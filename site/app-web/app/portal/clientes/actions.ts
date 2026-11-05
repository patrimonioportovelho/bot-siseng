"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { registrarEJogarErro } from "@/lib/erros";
import { buscarClienteDuplicado, mensagemClienteDuplicado } from "@/lib/clientes/duplicidade";
import { validarCpfCnpj } from "@/lib/clientes/validacao";
import { dadosDoClienteFormulario } from "@/lib/clientes/dados-formulario";
import type { ClienteAvaliacao } from "@/lib/financiamento/avaliacao-credito";
import type { ContatoCliente } from "@/app/clientes/funil-actions";

// Ações do corretor na etiqueta dos clientes dele (portal). O corretor só mexe nos clientes que estão no
// nome dele, e só faz duas coisas: acompanhar (contatos, WhatsApp, notas) e complementar os dados.
// Qualquer uma das duas é o "primeiro movimento" que tira o cliente do estado "novo para você".

async function clienteDoCorretor(clienteId: string, parceiroId: string) {
  const c = await prisma.clientes.findUnique({ where: { id: clienteId }, select: { id: true, nome: true, parceiro_id: true, cpf: true, cnpj: true } });
  return c && c.parceiro_id === parceiroId ? c : null;
}

// O corretor fez o primeiro movimento: o cliente deixa de ser "novo para você" (some do sino).
async function limparRepasse(clienteId: string, parceiroId: string) {
  await prisma.clientes.updateMany({ where: { id: clienteId, parceiro_id: parceiroId, repasse_desde: { not: null } }, data: { repasse_desde: null, repasse_por: null } });
}

export async function registrarContatoPortalAction(
  clienteId: string,
  dados: { tipo: string; resultado: string | null; nota: string | null }
): Promise<{ ok: true; contato: ContatoCliente } | { ok: false; erro: string }> {
  const sessao = await requirePortalSession();
  const cliente = await clienteDoCorretor(clienteId, sessao.parceiroId);
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };
  const tipo = dados.tipo.trim();
  if (!tipo) return { ok: false, erro: "Informe o tipo do contato." };
  const nota = dados.nota?.trim().slice(0, 4000) || null;
  if (tipo === "Nota" && !nota) return { ok: false, erro: "Escreva a nota." };

  const c = await prisma.clientes_contatos.create({
    data: { cliente_id: clienteId, tipo, resultado: dados.resultado?.trim() || null, nota, por_parceiro_id: sessao.parceiroId }
  });
  await limparRepasse(clienteId, sessao.parceiroId);
  revalidatePath("/portal/clientes");
  return { ok: true, contato: { id: c.id, tipo: c.tipo, resultado: c.resultado, nota: c.nota, data: c.data.toISOString(), por: sessao.nome } };
}

// Listas do formulário (estados, cidades, bancos): carregadas só quando o corretor abre "Complementar dados".
export async function listasFormularioClienteAction(): Promise<{
  bancos: { id: string; nome: string; codigo: string | null }[];
  estados: { id: string; nome: string }[];
  cidades: { id: string; nome: string; estado_id: string }[];
}> {
  await requirePortalSession();
  const [bancos, estados, cidades] = await Promise.all([
    prisma.bancos.findMany({ orderBy: { nome: "asc" } }),
    prisma.estados.findMany({ orderBy: { nome: "asc" } }),
    prisma.cidades.findMany({ orderBy: { nome: "asc" } })
  ]);
  return {
    bancos: bancos.map((b) => ({ id: b.id, nome: b.nome, codigo: b.codigo })),
    estados: estados.map((e) => ({ id: e.id, nome: e.nome })),
    cidades: cidades.map((c) => ({ id: c.id, nome: c.nome, estado_id: c.estado_id }))
  };
}

// Complementar os dados do cliente (o lead que vai virar contrato precisa do cadastro completo).
export async function complementarClienteAction(
  clienteId: string,
  c: ClienteAvaliacao
): Promise<{ ok: true; campos: string[] } | { ok: false; erro: string }> {
  const sessao = await requirePortalSession();
  const atual = await clienteDoCorretor(clienteId, sessao.parceiroId);
  if (!atual) return { ok: false, erro: "Cliente não encontrado." };
  if (!c.nome.trim()) return { ok: false, erro: "O nome do cliente não pode ficar vazio." };

  const ehCnpj = c.tipoCliente === "Pessoa Jurídica";
  const documento = ehCnpj ? c.cnpj : c.cpf;
  if (documento.trim()) {
    const erroDocumento = validarCpfCnpj(documento);
    if (erroDocumento) return { ok: false, erro: erroDocumento };
    const novoDigitos = documento.replace(/\D/g, "");
    if (novoDigitos !== ((ehCnpj ? atual.cnpj : atual.cpf) ?? "")) {
      const duplicado = await buscarClienteDuplicado({ nome: "", cpfCnpj: documento, ignorarIds: [clienteId] });
      if (duplicado) return { ok: false, erro: mensagemClienteDuplicado(duplicado, sessao.parceiroId) };
    }
  }

  try {
    const dados = await dadosDoClienteFormulario(c);
    await prisma.clientes.update({ where: { id: clienteId }, data: { ...dados, updated_at: new Date(), repasse_desde: null, repasse_por: null } });
  } catch (erro) {
    await registrarEJogarErro({ entidadeTipo: "clientes", entidadeId: clienteId, acao: "complementar_via_portal", erro }).catch(() => undefined);
    return { ok: false, erro: "Não foi possível salvar os dados agora. Tente de novo." };
  }

  // fica no histórico do cliente (o administrativo vê que o corretor mexeu)
  await prisma.clientes_contatos.create({
    data: { cliente_id: clienteId, tipo: "Dados", resultado: "Dados complementados pelo corretor", por_parceiro_id: sessao.parceiroId }
  });
  await logAlteracaoPortal({ parceiroId: sessao.parceiroId, entidadeTipo: "clientes", entidadeId: clienteId, acao: "complementar_cliente_portal" }).catch(() => undefined);
  revalidatePath("/portal/clientes");
  return { ok: true, campos: [] };
}
