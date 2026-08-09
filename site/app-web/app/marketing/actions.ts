"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { registrarEJogarErro } from "@/lib/erros";
import { gerarProximoIdOrdemMarketing } from "@/lib/marketing/id-legado";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

// Cadastro de uma nova Ordem de Marketing (card do quadro). Sem trava de
// função pra quem pode criar/mexer (pedido do usuário — "todo mundo do
// administrativo, sem trava por enquanto"). O responsável atual, quando
// informado, só pode vir da lista de Parceiros Administrativo + Ativo
// (lib/parceiros/administrativos.ts alimenta o <select> em
// components/marketing-form.tsx) — não há trava adicional aqui no server
// porque essa lista já é a única fonte disponível pro campo.
export async function criarOrdemAction(formData: FormData) {
  await requireAdminSession();

  const titulo = texto(formData, "titulo");
  if (!titulo) throw new Error("Título é obrigatório.");

  const idLegado = await gerarProximoIdOrdemMarketing();

  const criada = await prisma.marketing_ordens
    .create({
      data: {
        id_legado: idLegado,
        titulo,
        solicitante_parceiro_id: texto(formData, "solicitante_parceiro_id"),
        tipo: texto(formData, "tipo"),
        objetivo: texto(formData, "objetivo"),
        prioridade: texto(formData, "prioridade") ?? "Normal",
        coluna: "recebido",
        prazo_roteiro: data(formData, "prazo_roteiro"),
        prazo_entrega: data(formData, "prazo_entrega"),
        responsavel_atual_id: texto(formData, "responsavel_atual_id")
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_ordens", acao: "criar", erro }));

  await logAlteracao({ entidadeTipo: "marketing_ordens", entidadeId: criada.id, acao: "criar", dadosDepois: criada });

  revalidatePath("/marketing");
  redirect(`/marketing/${criada.id}?salvo=1`);
}

// Edição completa da ficha da Ordem.
export async function atualizarOrdemAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "ordemId");
  if (!id) throw new Error("Ordem de Marketing inválida.");

  const antes = await prisma.marketing_ordens.findUnique({ where: { id } });
  if (!antes) throw new Error("Ordem de Marketing não encontrada.");

  const depois = await prisma.marketing_ordens
    .update({
      where: { id },
      data: {
        titulo: texto(formData, "titulo") ?? undefined,
        solicitante_parceiro_id: texto(formData, "solicitante_parceiro_id"),
        tipo: texto(formData, "tipo"),
        objetivo: texto(formData, "objetivo"),
        prioridade: texto(formData, "prioridade") ?? "Normal",
        prazo_roteiro: data(formData, "prazo_roteiro"),
        prazo_entrega: data(formData, "prazo_entrega"),
        data_publicacao: data(formData, "data_publicacao"),
        responsavel_atual_id: texto(formData, "responsavel_atual_id"),
        bloqueio: texto(formData, "bloqueio"),
        link_arquivos: texto(formData, "link_arquivos"),
        aprovacao_status: texto(formData, "aprovacao_status"),
        resultados_texto: texto(formData, "resultados_texto"),
        updated_at: new Date()
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_ordens", entidadeId: id, acao: "editar", erro }));

  await logAlteracao({ entidadeTipo: "marketing_ordens", entidadeId: id, acao: "editar", dadosAntes: antes, dadosDepois: depois });

  revalidatePath(`/marketing/${id}`);
  revalidatePath("/marketing");
  redirect(`/marketing/${id}?salvo=1`);
}

// Chamada direto do arrastar-e-soltar do Kanban — mesmo padrão de
// app/gestoes/actions.ts e app/manutencao/actions.ts.
export async function moverColunaAction(id: string, novaColuna: string) {
  await requireAdminSession();

  const antes = await prisma.marketing_ordens.findUnique({ where: { id } });
  if (!antes) throw new Error("Ordem de Marketing não encontrada.");

  await prisma.marketing_ordens
    .update({ where: { id }, data: { coluna: novaColuna, updated_at: new Date() } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_ordens", entidadeId: id, acao: "mover_coluna", erro }));

  await logAlteracao({
    entidadeTipo: "marketing_ordens",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { coluna: antes.coluna },
    dadosDepois: { coluna: novaColuna }
  });

  revalidatePath("/marketing");
}

// Soft-delete — mesmo padrão do resto do sistema.
export async function apagarOrdemAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "ordemId");
  if (!id) throw new Error("Ordem de Marketing inválida.");

  await prisma.marketing_ordens
    .update({ where: { id }, data: { excluido: true, updated_at: new Date() } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_ordens", entidadeId: id, acao: "apagar", erro }));

  await logAlteracao({ entidadeTipo: "marketing_ordens", entidadeId: id, acao: "apagar" });

  revalidatePath("/marketing");
  redirect("/marketing");
}

// --- Checklist ---

export async function adicionarChecklistItemAction(formData: FormData) {
  await requireAdminSession();

  const ordemId = texto(formData, "ordemId");
  const label = texto(formData, "label");
  if (!ordemId || !label) throw new Error("Informe o item do checklist.");

  const ultimo = await prisma.marketing_checklist_itens.findFirst({
    where: { marketing_ordem_id: ordemId },
    orderBy: { ordem: "desc" }
  });

  await prisma.marketing_checklist_itens
    .create({
      data: { marketing_ordem_id: ordemId, label, ordem: (ultimo?.ordem ?? -1) + 1 }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_checklist_itens", entidadeId: ordemId, acao: "criar", erro }));

  revalidatePath(`/marketing/${ordemId}`);
}

// Insere de uma vez os itens padrão do Manual (seção 14) — botão
// "+ Checklist padrão" na ficha do card.
export async function adicionarChecklistPadraoAction(formData: FormData) {
  await requireAdminSession();

  const ordemId = texto(formData, "ordemId");
  if (!ordemId) throw new Error("Ordem de Marketing inválida.");

  const { CHECKLIST_PADRAO } = await import("@/lib/marketing/opcoes");

  const ultimo = await prisma.marketing_checklist_itens.findFirst({
    where: { marketing_ordem_id: ordemId },
    orderBy: { ordem: "desc" }
  });

  let ordem = (ultimo?.ordem ?? -1) + 1;

  await prisma.marketing_checklist_itens
    .createMany({
      data: CHECKLIST_PADRAO.map((label) => ({ marketing_ordem_id: ordemId, label, ordem: ordem++ }))
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_checklist_itens", entidadeId: ordemId, acao: "criar_padrao", erro }));

  revalidatePath(`/marketing/${ordemId}`);
}

export async function marcarChecklistItemAction(id: string, ordemId: string) {
  await requireAdminSession();

  const item = await prisma.marketing_checklist_itens.findUnique({ where: { id } });
  if (!item) throw new Error("Item não encontrado.");

  await prisma.marketing_checklist_itens
    .update({ where: { id }, data: { done: !item.done } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_checklist_itens", entidadeId: id, acao: "marcar", erro }));

  revalidatePath(`/marketing/${ordemId}`);
}

export async function removerChecklistItemAction(id: string, ordemId: string) {
  await requireAdminSession();

  await prisma.marketing_checklist_itens
    .delete({ where: { id } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_checklist_itens", entidadeId: id, acao: "remover", erro }));

  revalidatePath(`/marketing/${ordemId}`);
}

// --- Atividades (agendadas dentro da ordem, aparecem no Calendário
//     compartilhado com Manutenção e Gestões) ---

export async function criarAtividadeAction(formData: FormData) {
  await requireAdminSession();

  const ordemId = texto(formData, "ordemId");
  const tipo = texto(formData, "tipo");
  const titulo = texto(formData, "titulo");
  const dataAtividade = data(formData, "data");

  if (!ordemId || !tipo || !titulo || !dataAtividade) {
    throw new Error("Tipo, título e data são obrigatórios pra agendar a atividade.");
  }

  await prisma.marketing_atividades
    .create({
      data: {
        marketing_ordem_id: ordemId,
        tipo,
        titulo,
        data: dataAtividade,
        notas: texto(formData, "notas")
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_atividades", entidadeId: ordemId, acao: "criar", erro }));

  revalidatePath(`/marketing/${ordemId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

export async function marcarAtividadeFeitaAction(id: string, ordemId: string) {
  await requireAdminSession();

  const atividade = await prisma.marketing_atividades.findUnique({ where: { id } });
  if (!atividade) throw new Error("Atividade não encontrada.");

  await prisma.marketing_atividades
    .update({ where: { id }, data: { feito: !atividade.feito } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_atividades", entidadeId: id, acao: "marcar_feita", erro }));

  revalidatePath(`/marketing/${ordemId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

export async function removerAtividadeAction(id: string, ordemId: string) {
  await requireAdminSession();

  await prisma.marketing_atividades
    .delete({ where: { id } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_atividades", entidadeId: id, acao: "remover", erro }));

  revalidatePath(`/marketing/${ordemId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

// --- Notas (histórico, timestamp automático, ordem cronológica reversa) ---

export async function adicionarNotaAction(formData: FormData) {
  await requireAdminSession();

  const ordemId = texto(formData, "ordemId");
  const textoNota = texto(formData, "texto");
  if (!ordemId || !textoNota) throw new Error("Escreva o texto da nota.");

  await prisma.marketing_notas
    .create({ data: { marketing_ordem_id: ordemId, texto: textoNota } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_notas", entidadeId: ordemId, acao: "criar", erro }));

  revalidatePath(`/marketing/${ordemId}`);
}
