"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAlteracao, requireEdicao } from "@/lib/auth";
import { etapaDoCliente } from "@/lib/clientes/funil-servidor";
import { movimentoPermitido, type EtapaFunilId } from "@/lib/clientes/funil";

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
