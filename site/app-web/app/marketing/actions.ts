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
        publico: texto(formData, "publico"),
        empreendimento: texto(formData, "empreendimento"),
        canal: texto(formData, "canal"),
        prioridade: texto(formData, "prioridade") ?? "Normal",
        coluna: "recebido",
        prazo_roteiro: data(formData, "prazo_roteiro"),
        prazo_entrega: data(formData, "prazo_entrega"),
        responsavel_atual_id: texto(formData, "responsavel_atual_id"),
        responsavel_aprovacao_id: texto(formData, "responsavel_aprovacao_id")
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
        publico: texto(formData, "publico"),
        empreendimento: texto(formData, "empreendimento"),
        canal: texto(formData, "canal"),
        prioridade: texto(formData, "prioridade") ?? "Normal",
        prazo_roteiro: data(formData, "prazo_roteiro"),
        prazo_entrega: data(formData, "prazo_entrega"),
        data_publicacao: data(formData, "data_publicacao"),
        responsavel_atual_id: texto(formData, "responsavel_atual_id"),
        responsavel_aprovacao_id: texto(formData, "responsavel_aprovacao_id"),
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

// Ficha do briefing (formulário dinâmico, um por tipo — ver
// lib/marketing/opcoes.ts BRIEFING_TIPOS). Recalcula briefing_completo toda
// vez que salva: só true quando TODOS os campos daquele tipo estão
// preenchidos — é essa flag que a regra de negócio em moverColunaAction usa
// pra decidir se a Ordem pode sair de "Aguardando briefing".
export async function salvarBriefingAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "ordemId");
  const briefingTipo = texto(formData, "briefing_tipo");
  if (!id) throw new Error("Ordem de Marketing inválida.");
  if (!briefingTipo) throw new Error("Escolha o tipo de briefing.");

  const { campoBriefing } = await import("@/lib/marketing/opcoes");
  const tipo = campoBriefing(briefingTipo);
  if (!tipo) throw new Error("Tipo de briefing desconhecido.");

  const dados: Record<string, string> = {};
  let completo = true;
  for (const campo of tipo.campos) {
    const valor = texto(formData, campo.key);
    if (valor) dados[campo.key] = valor;
    else completo = false;
  }

  const antes = await prisma.marketing_ordens.findUnique({ where: { id } });
  if (!antes) throw new Error("Ordem de Marketing não encontrada.");

  const depois = await prisma.marketing_ordens
    .update({
      where: { id },
      data: {
        briefing_tipo: briefingTipo,
        briefing_dados: dados,
        briefing_completo: completo,
        updated_at: new Date()
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_ordens", entidadeId: id, acao: "salvar_briefing", erro }));

  await logAlteracao({
    entidadeTipo: "marketing_ordens",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { briefing_dados: antes.briefing_dados, briefing_completo: antes.briefing_completo },
    dadosDepois: { briefing_dados: depois.briefing_dados, briefing_completo: depois.briefing_completo }
  });

  revalidatePath(`/marketing/${id}`);
}

// Chamada direto do arrastar-e-soltar do Kanban — mesmo padrão de
// app/gestoes/actions.ts e app/manutencao/actions.ts.
export async function moverColunaAction(id: string, novaColuna: string) {
  await requireAdminSession();

  const antes = await prisma.marketing_ordens.findUnique({ where: { id } });
  if (!antes) throw new Error("Ordem de Marketing não encontrada.");

  // Regra de ouro do Manual: "o agendamento reserva o horário; o briefing
  // autoriza a produção" — uma Ordem só sai de Aguardando briefing com o
  // briefing completo. Voltar pra Recebido continua liberado (é um
  // "desistir"/reiniciar, não um avanço).
  if (antes.coluna === "aguardando_briefing" && novaColuna !== "aguardando_briefing" && novaColuna !== "recebido" && !antes.briefing_completo) {
    throw new Error("Briefing incompleto — preencha todos os campos do briefing antes de avançar.");
  }

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

// Insere de uma vez os itens do Manual IMPACTO pro pilar em que a Ordem
// está AGORA (derivado da coluna atual — ver pilarImpactoDaColuna) — botão
// "+ Checklist do pilar atual" na ficha do card. Muda de conteúdo conforme o
// card avança de coluna, em vez de ser uma lista única despejada no início.
export async function adicionarChecklistPadraoAction(formData: FormData) {
  await requireAdminSession();

  const ordemId = texto(formData, "ordemId");
  if (!ordemId) throw new Error("Ordem de Marketing inválida.");

  const ordemAtual = await prisma.marketing_ordens.findUnique({ where: { id: ordemId }, select: { coluna: true } });
  if (!ordemAtual) throw new Error("Ordem de Marketing não encontrada.");

  const { CHECKLIST_POR_PILAR, pilarImpactoDaColuna } = await import("@/lib/marketing/opcoes");
  const pilar = pilarImpactoDaColuna(ordemAtual.coluna);
  const itens = CHECKLIST_POR_PILAR[pilar.id] ?? [];

  const ultimo = await prisma.marketing_checklist_itens.findFirst({
    where: { marketing_ordem_id: ordemId },
    orderBy: { ordem: "desc" }
  });

  let ordem = (ultimo?.ordem ?? -1) + 1;

  await prisma.marketing_checklist_itens
    .createMany({
      data: itens.map((label) => ({ marketing_ordem_id: ordemId, label, ordem: ordem++ }))
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

// --- Agenda (pedidos que o corretor manda pela Agenda do portal) ---

// Confirma o pedido — com a mesma data sugerida ou reagendando (campos
// nova_data/nova_hora opcionais) — e isso já vira uma Ordem de Marketing na
// coluna "Recebido" sozinho: o pedido do corretor "é" o agendamento, ele
// não precisa reagendar em outro lugar (pedido do usuário, 09/08/2026).
// visto_pelo_corretor volta a false pra acender a notificação no portal.
export async function confirmarSolicitacaoAgendaAction(formData: FormData) {
  const admin = await requireAdminSession();

  const id = texto(formData, "solicitacaoId");
  if (!id) throw new Error("Solicitação inválida.");

  const solicitacao = await prisma.solicitacoes_agenda.findUnique({ where: { id } });
  if (!solicitacao) throw new Error("Solicitação não encontrada.");

  const novaData = texto(formData, "nova_data");
  const novaHora = texto(formData, "nova_hora");
  const dataConfirmada = novaData ? new Date(`${novaData}T${novaHora || "09:00"}:00`) : solicitacao.data_hora_sugerida;

  const idLegado = await gerarProximoIdOrdemMarketing();

  const ordemCriada = await prisma.marketing_ordens
    .create({
      data: {
        id_legado: idLegado,
        titulo: solicitacao.titulo,
        tipo: solicitacao.tipo,
        objetivo: solicitacao.descricao,
        solicitante_parceiro_id: solicitacao.parceiro_id,
        coluna: "recebido",
        data_captacao: dataConfirmada
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_ordens", acao: "criar_de_solicitacao", erro }));

  const depois = await prisma.solicitacoes_agenda
    .update({
      where: { id },
      data: {
        status: "confirmada",
        data_hora_confirmada: dataConfirmada,
        resposta_texto: texto(formData, "resposta_texto"),
        respondido_por_parceiro_id: admin.parceiroId,
        respondido_em: new Date(),
        visto_pelo_corretor: false,
        marketing_ordem_id: ordemCriada.id
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "solicitacoes_agenda", entidadeId: id, acao: "confirmar", erro }));

  await logAlteracao({
    entidadeTipo: "solicitacoes_agenda",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { status: solicitacao.status },
    dadosDepois: { status: depois.status, marketing_ordem_id: depois.marketing_ordem_id }
  });

  revalidatePath("/marketing/agenda");
  revalidatePath("/marketing");
}

export async function recusarSolicitacaoAgendaAction(formData: FormData) {
  const admin = await requireAdminSession();

  const id = texto(formData, "solicitacaoId");
  if (!id) throw new Error("Solicitação inválida.");

  const solicitacao = await prisma.solicitacoes_agenda.findUnique({ where: { id } });
  if (!solicitacao) throw new Error("Solicitação não encontrada.");

  await prisma.solicitacoes_agenda
    .update({
      where: { id },
      data: {
        status: "recusada",
        resposta_texto: texto(formData, "resposta_texto"),
        respondido_por_parceiro_id: admin.parceiroId,
        respondido_em: new Date(),
        visto_pelo_corretor: false
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "solicitacoes_agenda", entidadeId: id, acao: "recusar", erro }));

  await logAlteracao({
    entidadeTipo: "solicitacoes_agenda",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { status: solicitacao.status },
    dadosDepois: { status: "recusada" }
  });

  revalidatePath("/marketing/agenda");
}
