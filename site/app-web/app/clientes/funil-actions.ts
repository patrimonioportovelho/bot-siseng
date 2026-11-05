"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAlteracao, requireEdicao } from "@/lib/auth";
import { etapaDoCliente } from "@/lib/clientes/funil-servidor";
import { movimentoPermitido, type EtapaFunilId } from "@/lib/clientes/funil";
import { FUNCOES_CORRETOR } from "@/lib/transacoes/opcoes";
import { registrarAviso } from "@/lib/avisos-equipe";

export type ContatoCliente = { id: string; tipo: string; resultado: string | null; nota: string | null; data: string; por: string | null };

// Mover um card no quadro de Clientes. Só Leads <-> Em atendimento muda algo: as outras etapas
// são calculadas pelos vínculos, contratos e propostas. Devolve { ok: false, erro } em vez de lançar
// (em produção o Next esconde a mensagem de um erro lançado).
export async function moverClienteFunilAction(id: string, destino: EtapaFunilId): Promise<{ ok: true } | { ok: false; erro: string }> {
  const admin = await requireEdicao("clientes");
  const atual = await etapaDoCliente(id);
  if (!atual) return { ok: false, erro: "Cliente não encontrado." };
  const regra = movimentoPermitido(atual.derivacao, destino);
  if (!regra.ok) return regra;
  if (destino === atual.derivacao.etapa) return { ok: true };

  await prisma.clientes.update({
    where: { id },
    data: destino === "atendimento" ? { atendimento_desde: new Date(), atendimento_por: admin.parceiroId } : { atendimento_desde: null, atendimento_por: null }
  });
  await logAlteracao({
    entidadeTipo: "clientes",
    entidadeId: id,
    acao: "mover_funil_cliente",
    dadosAntes: { etapa: atual.derivacao.etapa },
    dadosDepois: { etapa: destino }
  }).catch(() => undefined);
  revalidatePath("/clientes");
  return { ok: true };
}

// Contato (WhatsApp, ligação...) ou nota na etiqueta do cliente.
export async function registrarContatoClienteAction(
  clienteId: string,
  dados: { tipo: string; resultado: string | null; nota: string | null }
): Promise<{ ok: true; contato: ContatoCliente } | { ok: false; erro: string }> {
  const admin = await requireEdicao("clientes");
  const tipo = dados.tipo.trim();
  if (!tipo) return { ok: false, erro: "Informe o tipo do contato." };
  const nota = dados.nota?.trim().slice(0, 4000) || null;
  if (tipo === "Nota" && !nota) return { ok: false, erro: "Escreva a nota." };
  const existe = await prisma.clientes.findUnique({ where: { id: clienteId }, select: { id: true } });
  if (!existe) return { ok: false, erro: "Cliente não encontrado." };

  const c = await prisma.clientes_contatos.create({
    data: { cliente_id: clienteId, tipo, resultado: dados.resultado?.trim() || null, nota, por_parceiro_id: admin.parceiroId }
  });
  revalidatePath("/clientes");
  return { ok: true, contato: { id: c.id, tipo: c.tipo, resultado: c.resultado, nota: c.nota, data: c.data.toISOString(), por: admin.nome } };
}

// Transfere o cliente para outro corretor (só Corretor e Corretor Estagiário em atividade). Feito pelo
// administrativo, por exemplo para redistribuir leads cujo corretor já saiu da imobiliária. O cliente
// passa a aparecer no portal do novo corretor e a transferência fica no histórico do cliente.
export async function transferirClienteAction(
  clienteId: string,
  novoCorretorId: string,
  motivo: string | null
): Promise<{ ok: true; corretorNome: string; contato: ContatoCliente } | { ok: false; erro: string }> {
  const admin = await requireEdicao("clientes");

  const [cliente, novo] = await Promise.all([
    prisma.clientes.findUnique({ where: { id: clienteId }, select: { id: true, nome: true, parceiro_id: true, parceiros: { select: { nome: true } } } }),
    prisma.parceiros.findFirst({ where: { id: novoCorretorId, funcao: { in: FUNCOES_CORRETOR }, status_funcao: "Ativo" }, select: { id: true, nome: true } })
  ]);
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };
  if (!novo) return { ok: false, erro: "Escolha um Corretor ou Corretor Estagiário ativo." };
  if (cliente.parceiro_id === novo.id) return { ok: false, erro: `${novo.nome} já é o corretor deste cliente.` };

  const anterior = cliente.parceiros?.nome ?? "sem corretor";
  // repasse_desde: o cliente fica "novo para o corretor" (sino e quadro dele) até o primeiro movimento na etiqueta
  await prisma.clientes.update({
    where: { id: clienteId },
    data: { parceiro_id: novo.id, updated_at: new Date(), repasse_desde: new Date(), repasse_por: admin.parceiroId }
  });
  // aviso estilo MSN: aparece na hora para o corretor, se ele estiver no portal
  await registrarAviso({
    tipo: "cliente_recebido",
    parceiroId: admin.parceiroId,
    paraParceiroId: novo.id,
    detalhe: cliente.nome,
    url: `/portal/clientes/${clienteId}`
  });
  const contato = await prisma.clientes_contatos.create({
    data: {
      cliente_id: clienteId,
      tipo: "Transferência",
      resultado: `${anterior} → ${novo.nome}`,
      nota: motivo?.trim().slice(0, 1000) || null,
      por_parceiro_id: admin.parceiroId
    }
  });
  await logAlteracao({
    entidadeTipo: "clientes",
    entidadeId: clienteId,
    acao: "transferir_corretor_cliente",
    dadosAntes: { parceiro_id: cliente.parceiro_id, corretor: anterior },
    dadosDepois: { parceiro_id: novo.id, corretor: novo.nome, motivo: motivo?.trim() || null }
  }).catch(() => undefined);

  revalidatePath("/clientes");
  return {
    ok: true,
    corretorNome: novo.nome,
    contato: { id: contato.id, tipo: contato.tipo, resultado: contato.resultado, nota: contato.nota, data: contato.data.toISOString(), por: admin.nome }
  };
}
