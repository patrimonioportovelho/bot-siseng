"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { hojeComoDataCalendario } from "@/lib/format";
import {
  COLUNA_FIN_POR_ID,
  COLUNAS_FIN,
  COLUNAS_PROCESSO,
  ENCERRAMENTOS,
  STATUS_CONFORMIDADE,
  TIPO_CONFORMIDADE,
  TIPO_CONTATO_FIN,
  TIPO_ETAPA,
  TIPO_INCONFORMIDADE,
  colunaDoCard,
  etapaDoCard,
  type ColunaFinId
} from "@/lib/financiamento/quadro";
import { CHAVES_CHECKLIST, MOTIVOS_INCONFORMIDADE, type EstadoChecklist } from "@/lib/financiamento/conformidade";

type Resultado = { ok: true } | { ok: false; erro: string };

function limpoOuNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

const STATUS_AVALIACAO_FINAIS = ["Concluído", "Reprovação", "Avaliação cancelada", "Avaliação vencida"];

// Andamento mais recente (não excluído) da avaliação.
async function andamentoAtual(avaliacaoId: string) {
  return prisma.andamentos.findFirst({
    where: { avaliacao_id: avaliacaoId, excluido: false },
    orderBy: { created_at: "desc" },
    select: { id: true, status_andamento: true, data_inicio: true, created_at: true, data_conclusao: true }
  });
}

// Cria o "relógio" (atividade de etapa aberta) de toda avaliação em andamento
// que ainda não tem um — a data de início é estimada a partir dos dados que já
// existiam (marcada como estimada). Idempotente; roda ao abrir o quadro.
export async function garantirEpisodiosFinanciamento(): Promise<void> {
  const semRelogio = await prisma.avaliacoes.findMany({
    where: {
      excluido: false,
      status: { notIn: STATUS_AVALIACAO_FINAIS },
      NOT: { financiamento_atividades: { some: { tipo: TIPO_ETAPA, fim: null } } }
    },
    select: {
      id: true,
      status: true,
      data_avaliacao: true,
      created_at: true,
      andamentos: {
        where: { excluido: false },
        orderBy: { created_at: "desc" },
        take: 1,
        select: { id: true, status_andamento: true, data_inicio: true, created_at: true }
      }
    }
  });
  if (semRelogio.length === 0) return;

  await prisma.financiamento_atividades.createMany({
    data: semRelogio.map((a) => {
      const and = a.andamentos[0] ?? null;
      const coluna = colunaDoCard(a.status, and?.status_andamento ?? null);
      const noProcesso = COLUNA_FIN_POR_ID.get(coluna)?.grupo === "processo";
      const inicio = noProcesso
        ? (and?.data_inicio ?? and?.created_at ?? a.created_at)
        : (a.data_avaliacao ?? a.created_at);
      return {
        avaliacao_id: a.id,
        andamento_id: noProcesso ? (and?.id ?? null) : null,
        tipo: TIPO_ETAPA,
        coluna,
        etapa: etapaDoCard(a.status, and?.status_andamento ?? null),
        inicio,
        estimado: true
      };
    })
  });
}

// ---------------------------------------------------------------------------
// Mover o card entre colunas (arrastar e soltar ou o seletor da etiqueta).
//  - Colunas de CRÉDITO mudam o status da avaliação (só enquanto o processo
//    não começou).
//  - Colunas de PROCESSO mudam o status do andamento; vindo de "Aprovado", o
//    andamento é criado na hora (início do processo).
//  - Concluído: andamento e avaliação ficam Concluídos (data de conclusão = hoje).
//  - Encerrados: exige o desfecho (Reprovação / Avaliação cancelada / vencida).
// Toda mudança fecha a atividade de etapa anterior e abre a nova — é daí que
// saem os tempos por etapa dos relatórios. Lança Error em português quando recusa.
// ---------------------------------------------------------------------------
export async function moverCardFinanciamentoAction(
  avaliacaoId: string,
  destino: ColunaFinId,
  opcoes?: { encerramento?: string | null; motivo?: string | null }
): Promise<void> {
  const sessao = await requireAdminSession();
  const colunaDestino = COLUNA_FIN_POR_ID.get(destino);
  if (!colunaDestino) throw new Error("Coluna inválida.");

  const [avaliacao, andamento] = await Promise.all([
    prisma.avaliacoes.findUnique({ where: { id: avaliacaoId }, select: { id: true, status: true, excluido: true } }),
    andamentoAtual(avaliacaoId)
  ]);
  if (!avaliacao || avaliacao.excluido) throw new Error("Avaliação não encontrada.");

  const origem = colunaDoCard(avaliacao.status, andamento?.status_andamento ?? null);
  if (origem === destino) return;
  const grupoOrigem = COLUNA_FIN_POR_ID.get(origem)?.grupo;
  const hoje = hojeComoDataCalendario();

  const dadosAvaliacao: Record<string, unknown> = {};
  const dadosAndamento: Record<string, unknown> = {};
  let criarAndamento = false;
  let statusAndamentoNovo: string | null = andamento?.status_andamento ?? null;
  let motivoEtapa: string | null = null;

  if (colunaDestino.grupo === "credito") {
    if (grupoOrigem === "processo") {
      throw new Error("Este financiamento já está no processo. Mova entre as etapas do processo ou use Encerrados.");
    }
    if (origem === "concluido") throw new Error("Financiamento concluído não volta para o crédito.");
    dadosAvaliacao.status = colunaDestino.statusAvaliacao;
  } else if (colunaDestino.grupo === "processo") {
    if (origem !== "aprovado" && grupoOrigem !== "processo") {
      throw new Error("Só uma avaliação Aprovada entra no processo. Mova primeiro para “Aprovado”.");
    }
    if (origem === "conformidade" && andamento?.status_andamento === "Inconforme") {
      const idxOrigem = COLUNAS_PROCESSO.findIndex((c) => c.id === origem);
      const idxDestino = COLUNAS_PROCESSO.findIndex((c) => c.id === destino);
      if (idxDestino > idxOrigem) {
        throw new Error("Há uma inconformidade em aberto. Resolva (ou volte à etapa de correção) antes de avançar.");
      }
    }
    const padrao = colunaDestino.statusAndamento![0];
    if (!andamento) {
      criarAndamento = true;
      statusAndamentoNovo = padrao;
    } else if (!colunaDestino.statusAndamento!.includes(andamento.status_andamento)) {
      dadosAndamento.status_andamento = padrao;
      statusAndamentoNovo = padrao;
    }
    // Moveu de volta/avante no processo: a avaliação precisa estar "Aprovado".
    if (avaliacao.status !== "Aprovado") dadosAvaliacao.status = "Aprovado";
  } else if (destino === "concluido") {
    if (origem === "encerrado") throw new Error("Reabra a avaliação (mova para um estágio de crédito) antes de concluir.");
    dadosAvaliacao.status = "Concluído";
    if (andamento) {
      dadosAndamento.status_andamento = "Concluído";
      if (!andamento.data_conclusao) dadosAndamento.data_conclusao = hoje;
      statusAndamentoNovo = "Concluído";
    }
  } else {
    // encerrado
    const desfecho = limpoOuNull(opcoes?.encerramento);
    if (!desfecho || !ENCERRAMENTOS.includes(desfecho)) {
      throw new Error("Escolha o desfecho: Reprovação, Avaliação cancelada ou Avaliação vencida.");
    }
    if (origem === "concluido") throw new Error("Financiamento concluído não pode ser encerrado.");
    dadosAvaliacao.status = desfecho;
    motivoEtapa = limpoOuNull(opcoes?.motivo);
  }

  const statusAvaliacaoNovo = (dadosAvaliacao.status as string | undefined) ?? avaliacao.status;
  const etapaNova =
    colunaDestino.grupo === "processo" ? (statusAndamentoNovo ?? "Pendente") : statusAvaliacaoNovo;

  // 1) cria o andamento (se for o caso) para ter o id nas atividades
  let andamentoId = andamento?.id ?? null;
  if (criarAndamento) {
    const novo = await prisma.andamentos.create({
      data: { avaliacao_id: avaliacaoId, status_andamento: statusAndamentoNovo!, data_inicio: hoje },
      select: { id: true }
    });
    andamentoId = novo.id;
  }

  const agora = new Date();
  const escritas = [
    ...(Object.keys(dadosAvaliacao).length > 0
      ? [prisma.avaliacoes.update({ where: { id: avaliacaoId }, data: { ...dadosAvaliacao, updated_at: agora } })]
      : []),
    ...(andamento && Object.keys(dadosAndamento).length > 0
      ? [prisma.andamentos.update({ where: { id: andamento.id }, data: { ...dadosAndamento, updated_at: agora } })]
      : []),
    // fecha a etapa que estava aberta…
    prisma.financiamento_atividades.updateMany({
      where: { avaliacao_id: avaliacaoId, tipo: TIPO_ETAPA, fim: null },
      data: { fim: agora }
    }),
    // …e abre a nova (encerrado/concluído abre uma linha já fechada: marca o desfecho)
    prisma.financiamento_atividades.create({
      data: {
        avaliacao_id: avaliacaoId,
        andamento_id: andamentoId,
        tipo: TIPO_ETAPA,
        coluna: destino,
        etapa: etapaNova,
        motivo: motivoEtapa,
        inicio: agora,
        fim: colunaDestino.grupo === "fim" ? agora : null,
        por_parceiro_id: sessao.parceiroId
      }
    })
  ];
  await prisma.$transaction(escritas);

  const quem = sessao.parceiroId;
  const antes = { status: avaliacao.status, status_andamento: andamento?.status_andamento ?? null };
  const depois = JSON.parse(
    JSON.stringify({ ...dadosAvaliacao, ...(statusAndamentoNovo ? { status_andamento: statusAndamentoNovo } : {}), origem: "quadro-financiamento" })
  );
  after(async () => {
    await prisma.logs_alteracao
      .create({
        data: {
          parceiro_id: quem,
          entidade_tipo: "avaliacoes",
          entidade_id: avaliacaoId,
          acao: "editar",
          dados_antes: antes,
          dados_depois: depois
        }
      })
      .catch(() => {});
  });
}

// Status do andamento dentro da etapa atual (ex.: "Aguardando Documentos do
// vendedor" → "Aguardando Documentos do comprador"). Cada troca vira uma
// atividade com tempo. Conforme/Inconforme têm botões próprios.
export async function definirStatusAndamentoAction(avaliacaoId: string, novoStatus: string): Promise<Resultado> {
  const sessao = await requireAdminSession();
  try {
    if (STATUS_CONFORMIDADE.includes(novoStatus)) {
      return { ok: false, erro: "Use os botões Conforme / Registrar inconformidade." };
    }
    const [avaliacao, andamento] = await Promise.all([
      prisma.avaliacoes.findUnique({ where: { id: avaliacaoId }, select: { status: true } }),
      andamentoAtual(avaliacaoId)
    ]);
    if (!avaliacao || !andamento) return { ok: false, erro: "Esta avaliação ainda não tem andamento." };
    const coluna = colunaDoCard(avaliacao.status, andamento.status_andamento);
    const def = COLUNA_FIN_POR_ID.get(coluna);
    if (!def || def.grupo !== "processo" || !def.statusAndamento!.includes(novoStatus)) {
      return { ok: false, erro: "Esse status não pertence à etapa atual." };
    }
    if (andamento.status_andamento === novoStatus) return { ok: true };

    const agora = new Date();
    await prisma.$transaction([
      prisma.andamentos.update({ where: { id: andamento.id }, data: { status_andamento: novoStatus, updated_at: agora } }),
      prisma.financiamento_atividades.updateMany({
        where: { avaliacao_id: avaliacaoId, tipo: TIPO_ETAPA, fim: null },
        data: { fim: agora }
      }),
      prisma.financiamento_atividades.create({
        data: {
          avaliacao_id: avaliacaoId,
          andamento_id: andamento.id,
          tipo: TIPO_ETAPA,
          coluna,
          etapa: novoStatus,
          inicio: agora,
          por_parceiro_id: sessao.parceiroId
        }
      })
    ]);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar." };
  }
}

// ---------------------------------------------------------------------------
// Conformidade: resultado da análise do banco, com motivo quando inconforme.
// ---------------------------------------------------------------------------
async function trocarEtapaAtual(avaliacaoId: string, andamentoId: string, coluna: ColunaFinId, etapa: string, por: string) {
  const agora = new Date();
  await prisma.$transaction([
    prisma.andamentos.update({ where: { id: andamentoId }, data: { status_andamento: etapa, updated_at: agora } }),
    prisma.financiamento_atividades.updateMany({
      where: { avaliacao_id: avaliacaoId, tipo: TIPO_ETAPA, fim: null },
      data: { fim: agora }
    }),
    prisma.financiamento_atividades.create({
      data: { avaliacao_id: avaliacaoId, andamento_id: andamentoId, tipo: TIPO_ETAPA, coluna, etapa, inicio: agora, por_parceiro_id: por }
    })
  ]);
}

export async function registrarConformidadeAction(
  avaliacaoId: string,
  resultado: "Conforme" | "Inconforme",
  motivo: string | null,
  nota: string | null
): Promise<Resultado> {
  const sessao = await requireAdminSession();
  try {
    const [avaliacao, andamento] = await Promise.all([
      prisma.avaliacoes.findUnique({ where: { id: avaliacaoId }, select: { status: true } }),
      andamentoAtual(avaliacaoId)
    ]);
    if (!avaliacao || !andamento) return { ok: false, erro: "Esta avaliação ainda não tem andamento." };
    if (colunaDoCard(avaliacao.status, andamento.status_andamento) !== "conformidade") {
      return { ok: false, erro: "O resultado da conformidade só é registrado na etapa Conformidade." };
    }
    const agora = new Date();

    if (resultado === "Inconforme") {
      const m = limpoOuNull(motivo);
      if (!m || !MOTIVOS_INCONFORMIDADE.includes(m)) return { ok: false, erro: "Escolha o motivo da inconformidade." };
      await prisma.financiamento_atividades.create({
        data: {
          avaliacao_id: avaliacaoId,
          andamento_id: andamento.id,
          tipo: TIPO_INCONFORMIDADE,
          coluna: "conformidade",
          etapa: "Inconforme",
          resultado: "Aberta",
          motivo: m,
          nota: limpoOuNull(nota),
          inicio: agora,
          por_parceiro_id: sessao.parceiroId
        }
      });
      await trocarEtapaAtual(avaliacaoId, andamento.id, "conformidade", "Inconforme", sessao.parceiroId);
    } else {
      // Conforme: fecha eventuais inconformidades abertas como resolvidas.
      await prisma.financiamento_atividades.updateMany({
        where: { avaliacao_id: avaliacaoId, tipo: TIPO_INCONFORMIDADE, fim: null },
        data: { fim: agora, resultado: "Resolvida" }
      });
      await prisma.financiamento_atividades.create({
        data: {
          avaliacao_id: avaliacaoId,
          andamento_id: andamento.id,
          tipo: TIPO_CONFORMIDADE,
          coluna: "conformidade",
          etapa: "Conforme",
          resultado: "Conforme",
          nota: limpoOuNull(nota),
          inicio: agora,
          fim: agora,
          por_parceiro_id: sessao.parceiroId
        }
      });
      await trocarEtapaAtual(avaliacaoId, andamento.id, "conformidade", "Conforme", sessao.parceiroId);
    }
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível registrar." };
  }
}

// Inconformidade corrigida: fecha o registro (tempo de resolução) e devolve o
// card para nova análise de conformidade.
export async function resolverInconformidadeAction(avaliacaoId: string, atividadeId: string, nota: string | null): Promise<Resultado> {
  const sessao = await requireAdminSession();
  try {
    const atividade = await prisma.financiamento_atividades.findUnique({ where: { id: atividadeId } });
    if (!atividade || atividade.avaliacao_id !== avaliacaoId || atividade.tipo !== TIPO_INCONFORMIDADE || atividade.fim) {
      return { ok: false, erro: "Inconformidade não encontrada ou já resolvida." };
    }
    const agora = new Date();
    const n = limpoOuNull(nota);
    await prisma.financiamento_atividades.update({
      where: { id: atividadeId },
      data: { fim: agora, resultado: "Resolvida", nota: n ? `${atividade.nota ? atividade.nota + "\n" : ""}Resolução: ${n}` : atividade.nota }
    });
    const andamento = await andamentoAtual(avaliacaoId);
    const abertas = await prisma.financiamento_atividades.count({ where: { avaliacao_id: avaliacaoId, tipo: TIPO_INCONFORMIDADE, fim: null } });
    if (andamento && abertas === 0 && andamento.status_andamento === "Inconforme") {
      await trocarEtapaAtual(avaliacaoId, andamento.id, "conformidade", "Aguardando Conformidade", sessao.parceiroId);
    }
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar." };
  }
}

// ---------------------------------------------------------------------------
// Autosave da etiqueta
// ---------------------------------------------------------------------------
const CAMPOS_TEXTO_FIN = ["proxima_acao_texto", "notas"] as const;

export async function salvarCampoFinanciamentoAction(avaliacaoId: string, campo: string, valor: string | null): Promise<Resultado> {
  await requireAdminSession();
  try {
    let dados: Record<string, unknown>;
    if ((CAMPOS_TEXTO_FIN as readonly string[]).includes(campo)) {
      dados = { [campo]: limpoOuNull(valor) };
    } else if (campo === "proxima_acao_data") {
      const v = limpoOuNull(valor);
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, erro: "Data inválida." };
      dados = { proxima_acao_data: v ? new Date(`${v}T00:00:00.000Z`) : null };
    } else if (campo === "responsavel_id") {
      const v = limpoOuNull(valor);
      if (v) {
        const existe = await prisma.parceiros.findUnique({ where: { id: v }, select: { id: true } });
        if (!existe) return { ok: false, erro: "Responsável não encontrado." };
      }
      dados = { responsavel_id: v };
    } else {
      return { ok: false, erro: "Campo não permitido." };
    }
    await prisma.financiamento_acompanhamento.upsert({
      where: { avaliacao_id: avaliacaoId },
      create: { avaliacao_id: avaliacaoId, ...(dados as object) },
      update: { ...(dados as object), updated_at: new Date() }
    });
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar." };
  }
}

export async function alternarChecklistFinanciamentoAction(avaliacaoId: string, chave: string, feito: boolean): Promise<Resultado> {
  await requireAdminSession();
  if (!CHAVES_CHECKLIST.has(chave)) return { ok: false, erro: "Item inválido." };
  try {
    const atual = await prisma.financiamento_acompanhamento.findUnique({ where: { avaliacao_id: avaliacaoId }, select: { checklist: true } });
    const estado = ((atual?.checklist as EstadoChecklist | null) ?? {}) as EstadoChecklist;
    const proximo: EstadoChecklist = {
      ...estado,
      [chave]: feito ? { feito: true, data: new Date().toISOString().slice(0, 10) } : { feito: false }
    };
    await prisma.financiamento_acompanhamento.upsert({
      where: { avaliacao_id: avaliacaoId },
      create: { avaliacao_id: avaliacaoId, checklist: proximo },
      update: { checklist: proximo, updated_at: new Date() }
    });
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar." };
  }
}

export type AtividadeFinTela = {
  id: string;
  tipo: string;
  coluna: string | null;
  etapa: string | null;
  resultado: string | null;
  motivo: string | null;
  nota: string | null;
  inicio: string;
  fim: string | null;
  estimado: boolean;
  por: string | null;
};

// Registro de contato (WhatsApp, ligação...) na linha do tempo do financiamento.
export async function registrarContatoFinanciamentoAction(
  avaliacaoId: string,
  dados: { tipo: string; resultado: string | null; nota: string | null }
): Promise<{ ok: true; atividade: AtividadeFinTela } | { ok: false; erro: string }> {
  const sessao = await requireAdminSession();
  const tipo = limpoOuNull(dados.tipo);
  if (!tipo || !TIPOS_CONTATO_VALIDOS.has(tipo)) return { ok: false, erro: "Escolha o tipo de contato." };
  try {
    const andamento = await andamentoAtual(avaliacaoId);
    const c = await prisma.financiamento_atividades.create({
      data: {
        avaliacao_id: avaliacaoId,
        andamento_id: andamento?.id ?? null,
        tipo: TIPO_CONTATO_FIN,
        etapa: tipo,
        resultado: limpoOuNull(dados.resultado),
        nota: limpoOuNull(dados.nota),
        inicio: new Date(),
        fim: new Date(),
        por_parceiro_id: sessao.parceiroId
      },
      include: { por: { select: { nome: true } } }
    });
    return {
      ok: true,
      atividade: {
        id: c.id,
        tipo: c.tipo,
        coluna: c.coluna,
        etapa: c.etapa,
        resultado: c.resultado,
        motivo: c.motivo,
        nota: c.nota,
        inicio: c.inicio.toISOString(),
        fim: c.fim ? c.fim.toISOString() : null,
        estimado: c.estimado,
        por: c.por?.nome ?? null
      }
    };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível registrar." };
  }
}
const TIPOS_CONTATO_VALIDOS = new Set(["WhatsApp", "Ligação", "E-mail", "Reunião", "Visita ao banco", "Outro"]);

// Responsável padrão de cada coluna.
export async function definirResponsavelColunaFinAction(coluna: string, responsavelId: string | null): Promise<Resultado> {
  await requireAdminSession();
  if (!COLUNAS_FIN.some((c) => c.id === coluna)) return { ok: false, erro: "Etapa inválida." };
  try {
    const v = limpoOuNull(responsavelId);
    await prisma.financiamento_etapas.upsert({
      where: { coluna },
      create: { coluna, responsavel_id: v },
      update: { responsavel_id: v, updated_at: new Date() }
    });
    revalidatePath("/financiamento");
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar." };
  }
}
