"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { registrarEJogarErro } from "@/lib/erros";
import { gerarProximoIdOrdemMarketing } from "@/lib/marketing/id-legado";
import { dataHoraPortoVelho, formatHoraPortoVelho } from "@/lib/format";

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

function numerico(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
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
        empreendimento_id: texto(formData, "empreendimento_id"),
        // Vínculo manual com um imóvel cadastrado (pedido do usuário,
        // 09/08/2026 — "essas questões de marketing... ir para os imóveis
        // como relatório"): antes só chegava aqui via pedido confirmado da
        // Agenda; agora o cadastro direto no quadro também pode linkar.
        imovel_id: texto(formData, "imovel_id"),
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
        empreendimento_id: texto(formData, "empreendimento_id"),
        // Mesmo vínculo opcional do cadastro (ver criarOrdemAction) — dá pra
        // linkar ou trocar o imóvel numa Ordem já existente também.
        imovel_id: texto(formData, "imovel_id"),
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
        // Métricas manuais estruturadas (Fase 5d, 09/08/2026) — alimentam o
        // card de "resultados de Marketing" no Dashboard geral. Só grava o
        // objeto se pelo menos um número foi preenchido; nunca é
        // integração automática (o sistema não conecta com Instagram/Meta).
        resultados: numerico(formData, "resultados_alcance") !== null ||
        numerico(formData, "resultados_leads") !== null ||
        numerico(formData, "resultados_engajamento") !== null
          ? {
              alcance: numerico(formData, "resultados_alcance"),
              leads: numerico(formData, "resultados_leads"),
              engajamento: numerico(formData, "resultados_engajamento")
            }
          : undefined,
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
    .update({
      where: { id },
      // coluna_atualizada_em reinicia o relógio do SLA (lib/marketing/opcoes.ts,
      // slaDaOrdem) — só acontece aqui, nunca em atualizarOrdemAction ou
      // salvarBriefingAction, senão editar um campo qualquer "escondia" um
      // atraso real.
      data: { coluna: novaColuna, coluna_atualizada_em: new Date(), updated_at: new Date() }
    })
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
  // Apagar a Ordem também some com qualquer atividade dela nos calendários
  // (o filtro excluido:false já cuida disso no banco — falta só invalidar
  // as páginas que tinham cache com o item ainda visível).
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
  revalidatePath("/portal/agenda");
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
  // hora avulsa (16/08/2026) — pedido do usuário: "preciso do horario nas
  // atividades do OM e preciso que ele acompanhe no calendario geral
  // também". Opcional: atividade sem horário definido (ex.: prazo de
  // entrega de material) continua só com data, sem quebrar nada.
  const horaAtividade = texto(formData, "hora");

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
        hora: horaAtividade,
        notas: texto(formData, "notas")
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_atividades", entidadeId: ordemId, acao: "criar", erro }));

  revalidatePath(`/marketing/${ordemId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
  // Qualquer atividade de Marketing pode aparecer no calendário do portal
  // do corretor também (editorial company-wide, ver app/portal/agenda) —
  // sem isso, criar/marcar/remover uma atividade pela ficha da Ordem só
  // refletia lá depois de o corretor sair e voltar na página.
  revalidatePath("/portal/agenda");
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
  // Qualquer atividade de Marketing pode aparecer no calendário do portal
  // do corretor também (editorial company-wide, ver app/portal/agenda) —
  // sem isso, criar/marcar/remover uma atividade pela ficha da Ordem só
  // refletia lá depois de o corretor sair e voltar na página.
  revalidatePath("/portal/agenda");
}

export async function removerAtividadeAction(id: string, ordemId: string) {
  await requireAdminSession();

  await prisma.marketing_atividades
    .delete({ where: { id } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_atividades", entidadeId: id, acao: "remover", erro }));

  revalidatePath(`/marketing/${ordemId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
  // Qualquer atividade de Marketing pode aparecer no calendário do portal
  // do corretor também (editorial company-wide, ver app/portal/agenda) —
  // sem isso, criar/marcar/remover uma atividade pela ficha da Ordem só
  // refletia lá depois de o corretor sair e voltar na página.
  revalidatePath("/portal/agenda");
}

// --- Produção (pipeline peça a peça — Fase 5c, 09/08/2026) — 1 Ordem pode
//     virar várias peças (1 vídeo + 3 stories, por exemplo), cada uma com
//     seu próprio prazo/arquivo/nº de revisões. ---

export async function criarProducaoAction(formData: FormData) {
  await requireAdminSession();

  const ordemId = texto(formData, "ordemId");
  const peca = texto(formData, "peca");
  if (!ordemId || !peca) throw new Error("Informe a peça de produção.");

  await prisma.marketing_producoes
    .create({
      data: {
        marketing_ordem_id: ordemId,
        peca,
        roteiro: texto(formData, "roteiro"),
        local: texto(formData, "local"),
        referencia: texto(formData, "referencia"),
        responsavel_parceiro_id: texto(formData, "responsavel_parceiro_id"),
        data_captacao: data(formData, "data_captacao"),
        prazo_entrega: data(formData, "prazo_entrega")
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_producoes", entidadeId: ordemId, acao: "criar", erro }));

  revalidatePath(`/marketing/${ordemId}`);
}

// Links dos arquivos (brutos, versão pra aprovação, final) — preenchidos
// progressivamente conforme a peça avança, por isso é uma action separada
// da criação (formulário próprio, menor, dentro de cada linha da lista).
export async function atualizarProducaoLinksAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "producaoId");
  const ordemId = texto(formData, "ordemId");
  if (!id || !ordemId) throw new Error("Peça de produção inválida.");

  await prisma.marketing_producoes
    .update({
      where: { id },
      data: {
        arquivos_brutos_url: texto(formData, "arquivos_brutos_url"),
        versao_aprovacao_url: texto(formData, "versao_aprovacao_url"),
        arquivo_final_url: texto(formData, "arquivo_final_url"),
        updated_at: new Date()
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_producoes", entidadeId: id, acao: "atualizar_links", erro }));

  revalidatePath(`/marketing/${ordemId}`);
}

export async function atualizarProducaoStatusAction(id: string, ordemId: string, status: string) {
  await requireAdminSession();

  await prisma.marketing_producoes
    .update({ where: { id }, data: { status, updated_at: new Date() } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_producoes", entidadeId: id, acao: "mudar_status", erro }));

  revalidatePath(`/marketing/${ordemId}`);
}

// Botão "+1 revisão" — conta quantas rodadas de ajuste a peça já teve (o
// Manual seção 11 lista "rodadas de alteração" como um dos KPIs).
export async function incrementarRevisaoProducaoAction(id: string, ordemId: string) {
  await requireAdminSession();

  await prisma.marketing_producoes
    .update({ where: { id }, data: { revisoes: { increment: 1 }, updated_at: new Date() } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_producoes", entidadeId: id, acao: "incrementar_revisao", erro }));

  revalidatePath(`/marketing/${ordemId}`);
}

export async function removerProducaoAction(id: string, ordemId: string) {
  await requireAdminSession();

  await prisma.marketing_producoes
    .delete({ where: { id } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_producoes", entidadeId: id, acao: "remover", erro }));

  revalidatePath(`/marketing/${ordemId}`);
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
//
// Reconfirmação (16/08/2026, fluxo de cancelamento/reagendamento): quando o
// pedido JÁ tem marketing_ordem_id (ex.: foi cancelado e o corretor propôs
// um novo horário pela reagendarSolicitacaoAgendaCorretorAction, voltando
// pro status "pendente") não cria uma OM nova — reaproveita a que já existe
// e só reativa/atualiza a atividade de captação dela, senão duplicava OM
// toda vez que um mesmo pedido fosse reagendado.
export async function confirmarSolicitacaoAgendaAction(formData: FormData) {
  const admin = await requireAdminSession();

  const id = texto(formData, "solicitacaoId");
  if (!id) throw new Error("Solicitação inválida.");

  const solicitacao = await prisma.solicitacoes_agenda.findUnique({ where: { id } });
  if (!solicitacao) throw new Error("Solicitação não encontrada.");

  const novaData = texto(formData, "nova_data");
  const novaHora = texto(formData, "nova_hora");
  // dataHoraPortoVelho — mesmo cuidado de fuso do pedido do corretor: o
  // administrativo também está digitando um horário local de Porto Velho,
  // não do servidor.
  const dataConfirmada = novaData ? dataHoraPortoVelho(novaData, novaHora ?? "09:00") : solicitacao.data_hora_sugerida;
  const horaConfirmada = novaHora ?? formatHoraPortoVelho(dataConfirmada);

  let ordemId = solicitacao.marketing_ordem_id;

  if (!ordemId) {
    const idLegado = await gerarProximoIdOrdemMarketing();

    const ordemCriada = await prisma.marketing_ordens
      .create({
        data: {
          id_legado: idLegado,
          titulo: solicitacao.titulo,
          tipo: solicitacao.tipo,
          objetivo: solicitacao.descricao,
          solicitante_parceiro_id: solicitacao.parceiro_id,
          // Imóvel que o corretor já linkou no pedido — "cadastro inteligente"
          // da OM (09/08/2026): a Ordem nasce puxando endereço/valor daqui em
          // vez de exigir digitar tudo de novo no briefing (ver
          // components/marketing-briefing-form.tsx).
          imovel_id: solicitacao.imovel_id,
          coluna: "recebido",
          data_captacao: dataConfirmada
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_ordens", acao: "criar_de_solicitacao", erro }));
    ordemId = ordemCriada.id;

    // BUG encontrado em 09/08/2026 ("os calendários não se atualizaram"):
    // esta action gravava data_captacao na Ordem, mas nenhum dos
    // calendários (/manutencao/calendario, /portal/agenda) lê esse campo —
    // os dois só mostram marketing_atividades. Sem essa linha, o horário
    // confirmado não aparecia em lugar nenhum, só dentro da própria ficha
    // da Ordem. Cria a atividade que representa esse compromisso agendado
    // (hora à parte — ver comentário do campo em prisma/schema.prisma).
    await prisma.marketing_atividades
      .create({
        data: {
          marketing_ordem_id: ordemId,
          tipo: "captacao",
          titulo: solicitacao.titulo,
          data: dataConfirmada,
          hora: horaConfirmada,
          notas: solicitacao.descricao
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_atividades", entidadeId: ordemId!, acao: "criar_de_solicitacao", erro }));
  } else {
    // Reconfirmação: já existe OM (pedido cancelado e reagendado antes) —
    // reativa a atividade de captação dela em vez de criar outra.
    const atividadeExistente = await prisma.marketing_atividades.findFirst({
      where: { marketing_ordem_id: ordemId, tipo: "captacao" },
      orderBy: { created_at: "desc" }
    });

    if (atividadeExistente) {
      await prisma.marketing_atividades.update({
        where: { id: atividadeExistente.id },
        data: {
          data: dataConfirmada,
          hora: horaConfirmada,
          cancelado: false,
          cancelado_motivo: null,
          cancelado_por_tipo: null,
          cancelado_em: null
        }
      });
    } else {
      await prisma.marketing_atividades.create({
        data: {
          marketing_ordem_id: ordemId,
          tipo: "captacao",
          titulo: solicitacao.titulo,
          data: dataConfirmada,
          hora: horaConfirmada,
          notas: solicitacao.descricao
        }
      });
    }

    await prisma.marketing_ordens.update({ where: { id: ordemId }, data: { data_captacao: dataConfirmada } });
  }

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
        marketing_ordem_id: ordemId,
        cancelado_motivo: null,
        cancelado_por_tipo: null,
        cancelado_em: null
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
  revalidatePath(`/marketing/${ordemId}`);
  // Os dois calendários que dependem de marketing_atividades — sem isso o
  // corretor só veria o compromisso novo depois de sair e voltar na Agenda
  // (o Next só invalida o cache das rotas listadas aqui).
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
  revalidatePath("/portal/agenda");
  revalidatePath("/portal");
}

// Cancela um pedido JÁ CONFIRMADO (o compromisso existe, mas precisa ser
// desmarcado) — pedido do usuário 16/08/2026: "se for cancelado tanto pelo
// corretor quanto pelo marketing precisamos informar o porque foi
// cancelado". Motivo é obrigatório. Não apaga nem a solicitação nem a
// Ordem/atividade — fica tudo visível (inclusive no calendário geral) com o
// motivo e quem cancelou, até alguém reagendar.
export async function cancelarSolicitacaoAgendaAction(formData: FormData) {
  const admin = await requireAdminSession();

  const id = texto(formData, "solicitacaoId");
  const motivo = texto(formData, "motivo");
  if (!id) throw new Error("Solicitação inválida.");
  if (!motivo) throw new Error("Informe o motivo do cancelamento.");

  const solicitacao = await prisma.solicitacoes_agenda.findUnique({ where: { id } });
  if (!solicitacao) throw new Error("Solicitação não encontrada.");
  if (solicitacao.status !== "confirmada") throw new Error("Só dá pra cancelar um agendamento já confirmado.");

  await prisma.$transaction(async (tx) => {
    await tx.solicitacoes_agenda.update({
      where: { id },
      data: {
        status: "cancelada",
        cancelado_motivo: motivo,
        cancelado_por_tipo: "marketing",
        cancelado_em: new Date(),
        visto_pelo_corretor: false
      }
    });

    if (solicitacao.marketing_ordem_id) {
      const atividade = await tx.marketing_atividades.findFirst({
        where: { marketing_ordem_id: solicitacao.marketing_ordem_id, tipo: "captacao" },
        orderBy: { created_at: "desc" }
      });
      if (atividade) {
        await tx.marketing_atividades.update({
          where: { id: atividade.id },
          data: { cancelado: true, cancelado_motivo: motivo, cancelado_por_tipo: "marketing", cancelado_em: new Date() }
        });
      }
    }
  });

  await logAlteracao({
    entidadeTipo: "solicitacoes_agenda",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { status: solicitacao.status },
    dadosDepois: { status: "cancelada", cancelado_por_tipo: "marketing", cancelado_motivo: motivo }
  });

  revalidatePath("/marketing/agenda");
  revalidatePath("/marketing");
  if (solicitacao.marketing_ordem_id) revalidatePath(`/marketing/${solicitacao.marketing_ordem_id}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
  revalidatePath("/portal/agenda");
  revalidatePath("/portal");
}

// Reagenda um pedido cancelado — o administrativo já entra com data/hora
// definitiva (mesmo espírito de "marketing confirma o horário final" que já
// vale pro fluxo normal), então isso já volta pra "confirmada" direto, sem
// passar por "pendente" de novo.
export async function reagendarSolicitacaoAgendaAction(formData: FormData) {
  const admin = await requireAdminSession();

  const id = texto(formData, "solicitacaoId");
  const novaData = texto(formData, "nova_data");
  const novaHora = texto(formData, "nova_hora");
  if (!id) throw new Error("Solicitação inválida.");
  if (!novaData) throw new Error("Informe a nova data.");

  const solicitacao = await prisma.solicitacoes_agenda.findUnique({ where: { id } });
  if (!solicitacao) throw new Error("Solicitação não encontrada.");

  const novaDataHora = dataHoraPortoVelho(novaData, novaHora ?? "09:00");
  const horaTexto = novaHora ?? formatHoraPortoVelho(novaDataHora);

  await prisma.$transaction(async (tx) => {
    await tx.solicitacoes_agenda.update({
      where: { id },
      data: {
        status: "confirmada",
        data_hora_confirmada: novaDataHora,
        respondido_por_parceiro_id: admin.parceiroId,
        respondido_em: new Date(),
        visto_pelo_corretor: false,
        cancelado_motivo: null,
        cancelado_por_tipo: null,
        cancelado_em: null
      }
    });

    if (solicitacao.marketing_ordem_id) {
      await tx.marketing_ordens.update({ where: { id: solicitacao.marketing_ordem_id }, data: { data_captacao: novaDataHora } });

      const atividade = await tx.marketing_atividades.findFirst({
        where: { marketing_ordem_id: solicitacao.marketing_ordem_id, tipo: "captacao" },
        orderBy: { created_at: "desc" }
      });
      if (atividade) {
        await tx.marketing_atividades.update({
          where: { id: atividade.id },
          data: { data: novaDataHora, hora: horaTexto, cancelado: false, cancelado_motivo: null, cancelado_por_tipo: null, cancelado_em: null }
        });
      } else {
        await tx.marketing_atividades.create({
          data: {
            marketing_ordem_id: solicitacao.marketing_ordem_id,
            tipo: "captacao",
            titulo: solicitacao.titulo,
            data: novaDataHora,
            hora: horaTexto,
            notas: solicitacao.descricao
          }
        });
      }
    }
  });

  await logAlteracao({
    entidadeTipo: "solicitacoes_agenda",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { status: solicitacao.status },
    dadosDepois: { status: "confirmada", data_hora_confirmada: novaDataHora }
  });

  revalidatePath("/marketing/agenda");
  revalidatePath("/marketing");
  if (solicitacao.marketing_ordem_id) revalidatePath(`/marketing/${solicitacao.marketing_ordem_id}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
  revalidatePath("/portal/agenda");
  revalidatePath("/portal");
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
  revalidatePath("/portal/agenda");
  revalidatePath("/portal");
}
