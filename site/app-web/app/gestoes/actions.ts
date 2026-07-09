"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal, percentualParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function valorMonetario(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return valorEditavelParaDecimal(t);
}

function percentual(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return percentualParaDecimal(t);
}

function inteiro(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

// Edição completa da ficha da Gestão — Cliente/Imóvel não são editáveis
// aqui (nasceram do formulário do portal, mostrados só como leitura no
// cabeçalho da página).
export async function atualizarGestaoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "gestaoId");
  if (!id) throw new Error("Gestão inválida.");

  const antes = await prisma.gestoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Gestão não encontrada.");

  const novaChavePosse = texto(formData, "chave_posse") ?? "imobiliaria";
  const novaChaveCom = texto(formData, "chave_com");
  const chaveMudou = novaChavePosse !== antes.chave_posse || novaChaveCom !== antes.chave_com;

  const depois = await prisma.gestoes
    .update({
      where: { id },
      data: {
        coluna: texto(formData, "coluna") ?? undefined,
        parceiro_id: texto(formData, "parceiro_id"),
        valor_venda: valorMonetario(formData, "valor_venda"),
        porc_honorario: percentual(formData, "porc_honorario"),
        prazo_gestao_dias: inteiro(formData, "prazo_gestao_dias"),
        data_assinatura: data(formData, "data_assinatura"),
        chave_posse: novaChavePosse,
        chave_com: novaChaveCom,
        chave_atualizado_em: chaveMudou ? new Date() : undefined,
        updated_at: new Date()
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "gestoes", entidadeId: id, acao: "editar", erro }));

  await logAlteracao({ entidadeTipo: "gestoes", entidadeId: id, acao: "editar", dadosAntes: antes, dadosDepois: depois });

  revalidatePath(`/gestoes/${id}`);
  revalidatePath("/gestoes");
  revalidatePath("/manutencao/painel");
  redirect(`/gestoes/${id}?salvo=1`);
}

// Chamada direto do arrastar-e-soltar do Kanban — mesmo padrão do quadro de
// Manutenção (moverColunaAction em app/manutencao/actions.ts).
export async function moverColunaAction(id: string, novaColuna: string) {
  await requireAdminSession();

  const antes = await prisma.gestoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Gestão não encontrada.");

  await prisma.gestoes.update({ where: { id }, data: { coluna: novaColuna, updated_at: new Date() } });

  await logAlteracao({
    entidadeTipo: "gestoes",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { coluna: antes.coluna },
    dadosDepois: { coluna: novaColuna }
  });

  revalidatePath("/gestoes");
  revalidatePath("/manutencao/painel");
}

// Soft-delete — mesmo padrão do resto do sistema: marca excluido=true em vez
// de apagar de verdade (histórico de checklist/atividades/notas continua).
export async function apagarGestaoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "gestaoId");
  if (!id) throw new Error("Gestão inválida.");

  await prisma.gestoes.update({ where: { id }, data: { excluido: true, updated_at: new Date() } });

  await logAlteracao({ entidadeTipo: "gestoes", entidadeId: id, acao: "apagar" });

  revalidatePath("/gestoes");
  redirect("/gestoes");
}

// --- Checklist ---

export async function adicionarChecklistItemAction(formData: FormData) {
  await requireAdminSession();

  const gestaoId = texto(formData, "gestaoId");
  const label = texto(formData, "label");
  if (!gestaoId || !label) throw new Error("Informe o item do checklist.");

  const ultimo = await prisma.gestao_checklist_itens.findFirst({
    where: { gestao_id: gestaoId },
    orderBy: { ordem: "desc" }
  });

  await prisma.gestao_checklist_itens.create({
    data: { gestao_id: gestaoId, label, ordem: (ultimo?.ordem ?? -1) + 1 }
  });

  revalidatePath(`/gestoes/${gestaoId}`);
}

export async function marcarChecklistItemAction(id: string, gestaoId: string) {
  await requireAdminSession();

  const item = await prisma.gestao_checklist_itens.findUnique({ where: { id } });
  if (!item) throw new Error("Item não encontrado.");

  await prisma.gestao_checklist_itens.update({ where: { id }, data: { done: !item.done } });

  revalidatePath(`/gestoes/${gestaoId}`);
}

export async function removerChecklistItemAction(id: string, gestaoId: string) {
  await requireAdminSession();

  await prisma.gestao_checklist_itens.delete({ where: { id } });

  revalidatePath(`/gestoes/${gestaoId}`);
}

// --- Atividades (agendadas dentro da gestão, aparecem no Calendário) ---

export async function criarAtividadeAction(formData: FormData) {
  await requireAdminSession();

  const gestaoId = texto(formData, "gestaoId");
  const tipo = texto(formData, "tipo");
  const titulo = texto(formData, "titulo");
  const dataAtividade = data(formData, "data");

  if (!gestaoId || !tipo || !titulo || !dataAtividade) {
    throw new Error("Tipo, título e data são obrigatórios pra agendar a atividade.");
  }

  await prisma.gestao_atividades.create({
    data: {
      gestao_id: gestaoId,
      tipo,
      titulo,
      data: dataAtividade,
      notas: texto(formData, "notas")
    }
  });

  revalidatePath(`/gestoes/${gestaoId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

export async function marcarAtividadeFeitaAction(id: string, gestaoId: string) {
  await requireAdminSession();

  const atividade = await prisma.gestao_atividades.findUnique({ where: { id } });
  if (!atividade) throw new Error("Atividade não encontrada.");

  await prisma.gestao_atividades.update({ where: { id }, data: { feito: !atividade.feito } });

  revalidatePath(`/gestoes/${gestaoId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

export async function removerAtividadeAction(id: string, gestaoId: string) {
  await requireAdminSession();

  await prisma.gestao_atividades.delete({ where: { id } });

  revalidatePath(`/gestoes/${gestaoId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

// --- Notas (histórico, timestamp automático, ordem cronológica reversa) ---

export async function adicionarNotaAction(formData: FormData) {
  await requireAdminSession();

  const gestaoId = texto(formData, "gestaoId");
  const textoNota = texto(formData, "texto");
  if (!gestaoId || !textoNota) throw new Error("Escreva o texto da nota.");

  await prisma.gestao_notas.create({ data: { gestao_id: gestaoId, texto: textoNota } });

  revalidatePath(`/gestoes/${gestaoId}`);
}
