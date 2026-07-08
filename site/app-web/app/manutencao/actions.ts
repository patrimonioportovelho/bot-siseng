"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
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

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

// Cadastro de um novo ticket de manutenção. imovel_id sempre vem de um
// imóvel de verdade (picker com Id + endereço) — nunca texto livre — e o
// cliente_proprietario_id normalmente já chega pré-preenchido a partir do
// imóvel escolhido (ver components/manutencao-form.tsx), mas continua
// editável/substituível pelo usuário.
export async function criarManutencaoAction(formData: FormData) {
  await requireAdminSession();

  const imovelId = texto(formData, "imovel_id");
  const titulo = texto(formData, "titulo");
  const tipoServico = texto(formData, "tipo_servico");

  if (!imovelId || !titulo || !tipoServico) {
    throw new Error("Imóvel, título e tipo de serviço são obrigatórios.");
  }

  const criada = await prisma.manutencoes
    .create({
      data: {
        imovel_id: imovelId,
        cliente_proprietario_id: texto(formData, "cliente_proprietario_id"),
        prestador_id: texto(formData, "prestador_id"),
        titulo,
        tipo_servico: tipoServico,
        urgencia: texto(formData, "urgencia") ?? "media",
        solicitado_por: texto(formData, "solicitado_por"),
        custo_estimado: valorMonetario(formData, "custo_estimado"),
        chave_posse: texto(formData, "chave_posse") ?? "imobiliaria",
        chave_com: texto(formData, "chave_com"),
        chave_atualizado_em: new Date(),
        coluna: "solicitado",
        autorizado_por: "pendente"
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencoes", acao: "criar", erro }));

  await logAlteracao({ entidadeTipo: "manutencoes", entidadeId: criada.id, acao: "criar", dadosDepois: criada });

  revalidatePath("/manutencao");
  redirect(`/manutencao/${criada.id}?salvo=1`);
}

// Edição completa da ficha do ticket (campos do modelo de dados).
export async function atualizarManutencaoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "manutencaoId");
  if (!id) throw new Error("Manutenção inválida.");

  const antes = await prisma.manutencoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Manutenção não encontrada.");

  const novaChavePosse = texto(formData, "chave_posse") ?? "imobiliaria";
  const novaChaveCom = texto(formData, "chave_com");
  // Só atualiza o timestamp da chave quando de fato muda de mão — evita
  // "atualizado agora" toda vez que a ficha é só editada por outro motivo.
  const chaveMudou = novaChavePosse !== antes.chave_posse || novaChaveCom !== antes.chave_com;

  const depois = await prisma.manutencoes
    .update({
      where: { id },
      data: {
        titulo: texto(formData, "titulo") ?? undefined,
        tipo_servico: texto(formData, "tipo_servico") ?? undefined,
        urgencia: texto(formData, "urgencia") ?? undefined,
        solicitado_por: texto(formData, "solicitado_por"),
        cliente_proprietario_id: texto(formData, "cliente_proprietario_id"),
        prestador_id: texto(formData, "prestador_id"),
        custo_estimado: valorMonetario(formData, "custo_estimado"),
        custo_final: valorMonetario(formData, "custo_final"),
        autorizado_por: texto(formData, "autorizado_por") ?? "pendente",
        chave_posse: novaChavePosse,
        chave_com: novaChaveCom,
        chave_atualizado_em: chaveMudou ? new Date() : undefined,
        updated_at: new Date()
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencoes", entidadeId: id, acao: "editar", erro }));

  await logAlteracao({ entidadeTipo: "manutencoes", entidadeId: id, acao: "editar", dadosAntes: antes, dadosDepois: depois });

  revalidatePath(`/manutencao/${id}`);
  revalidatePath("/manutencao");
  revalidatePath("/manutencao/painel");
  redirect(`/manutencao/${id}?salvo=1`);
}

// Chamada direto do arrastar-e-soltar do Kanban — atualiza só a coluna, sem
// passar pelo formulário inteiro. Chamada como função normal (não via
// <form action>) direto do onDrop do card.
export async function moverColunaAction(id: string, novaColuna: string) {
  await requireAdminSession();

  const antes = await prisma.manutencoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Manutenção não encontrada.");

  await prisma.manutencoes.update({ where: { id }, data: { coluna: novaColuna, updated_at: new Date() } });

  await logAlteracao({
    entidadeTipo: "manutencoes",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { coluna: antes.coluna },
    dadosDepois: { coluna: novaColuna }
  });

  revalidatePath("/manutencao");
  revalidatePath("/manutencao/painel");
}

// Soft-delete — mesmo padrão usado em imóveis/clientes/transações: marca
// excluido=true em vez de apagar de verdade, porque o ticket pode ter
// checklist/atividades/notas com histórico real.
export async function apagarManutencaoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "manutencaoId");
  if (!id) throw new Error("Manutenção inválida.");

  await prisma.manutencoes.update({ where: { id }, data: { excluido: true, updated_at: new Date() } });

  await logAlteracao({ entidadeTipo: "manutencoes", entidadeId: id, acao: "apagar" });

  revalidatePath("/manutencao");
  redirect("/manutencao");
}

// --- Checklist ---

export async function adicionarChecklistItemAction(formData: FormData) {
  await requireAdminSession();

  const manutencaoId = texto(formData, "manutencaoId");
  const label = texto(formData, "label");
  if (!manutencaoId || !label) throw new Error("Informe o item do checklist.");

  const ultimo = await prisma.manutencao_checklist_itens.findFirst({
    where: { manutencao_id: manutencaoId },
    orderBy: { ordem: "desc" }
  });

  await prisma.manutencao_checklist_itens.create({
    data: { manutencao_id: manutencaoId, label, ordem: (ultimo?.ordem ?? -1) + 1 }
  });

  revalidatePath(`/manutencao/${manutencaoId}`);
}

export async function marcarChecklistItemAction(id: string, manutencaoId: string) {
  await requireAdminSession();

  const item = await prisma.manutencao_checklist_itens.findUnique({ where: { id } });
  if (!item) throw new Error("Item não encontrado.");

  await prisma.manutencao_checklist_itens.update({ where: { id }, data: { done: !item.done } });

  revalidatePath(`/manutencao/${manutencaoId}`);
}

export async function removerChecklistItemAction(id: string, manutencaoId: string) {
  await requireAdminSession();

  await prisma.manutencao_checklist_itens.delete({ where: { id } });

  revalidatePath(`/manutencao/${manutencaoId}`);
}

// --- Atividades (agendadas dentro do ticket, aparecem no Calendário) ---

export async function criarAtividadeAction(formData: FormData) {
  await requireAdminSession();

  const manutencaoId = texto(formData, "manutencaoId");
  const tipo = texto(formData, "tipo");
  const titulo = texto(formData, "titulo");
  const dataAtividade = data(formData, "data");

  if (!manutencaoId || !tipo || !titulo || !dataAtividade) {
    throw new Error("Tipo, título e data são obrigatórios pra agendar a atividade.");
  }

  await prisma.manutencao_atividades.create({
    data: {
      manutencao_id: manutencaoId,
      tipo,
      titulo,
      data: dataAtividade,
      notas: texto(formData, "notas")
    }
  });

  revalidatePath(`/manutencao/${manutencaoId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

export async function marcarAtividadeFeitaAction(id: string, manutencaoId: string) {
  await requireAdminSession();

  const atividade = await prisma.manutencao_atividades.findUnique({ where: { id } });
  if (!atividade) throw new Error("Atividade não encontrada.");

  await prisma.manutencao_atividades.update({ where: { id }, data: { feito: !atividade.feito } });

  revalidatePath(`/manutencao/${manutencaoId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

export async function removerAtividadeAction(id: string, manutencaoId: string) {
  await requireAdminSession();

  await prisma.manutencao_atividades.delete({ where: { id } });

  revalidatePath(`/manutencao/${manutencaoId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

// --- Notas (histórico, timestamp automático, ordem cronológica reversa) ---

export async function adicionarNotaAction(formData: FormData) {
  await requireAdminSession();

  const manutencaoId = texto(formData, "manutencaoId");
  const textoNota = texto(formData, "texto");
  if (!manutencaoId || !textoNota) throw new Error("Escreva o texto da nota.");

  await prisma.manutencao_notas.create({ data: { manutencao_id: manutencaoId, texto: textoNota } });

  revalidatePath(`/manutencao/${manutencaoId}`);
}
