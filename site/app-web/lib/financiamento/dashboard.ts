import { prisma } from "@/lib/prisma";
import { whereLojaFiltroParceiro } from "@/lib/lojas/filtro";
import {
  COLUNAS_FIN,
  COLUNA_FIN_POR_ID,
  DIAS_ALERTA_VALIDADE,
  TIPO_CONFORMIDADE,
  TIPO_CONTATO_FIN,
  TIPO_ETAPA,
  TIPO_INCONFORMIDADE,
  colunaDoCard,
  situacaoSla,
  type ColunaFinId
} from "@/lib/financiamento/quadro";

// Financiamento no Dashboard geral (30/10/2026). A visão deixa de depender só da
// Data de avaliação: o que está na CARTEIRA hoje (Standbye, Restrição, etc.)
// continua aparecendo mesmo depois de virar o mês, e o que PRECISA DE CONTATO é
// quem não teve movimentação dentro do período selecionado (nenhuma mudança de
// etapa, contato ou conformidade registrada nele).
const DIA_MS = 86400000;
const STATUS_FINAIS = ["Concluído", "Reprovação", "Avaliação cancelada", "Avaliação vencida"];

export type CardContato = {
  id: string;
  cliente: string;
  banco: string | null;
  corretor: string | null;
  diasNaEtapa: number;
  estimado: boolean;
  ultimoContatoDias: number | null;
  validadeDias: number | null;
  inconformidade: boolean;
  acimaDaMeta: boolean;
};

export type LinhaCarteira = {
  coluna: ColunaFinId;
  label: string;
  grupo: string;
  cor: string;
  total: number;
  semMovimentacao: number;
  cards: CardContato[]; // sem movimentação no período, mais parados primeiro
};

export type DashboardFinanciamento = {
  carteira: LinhaCarteira[];
  totalCarteira: number;
  totalSemMovimentacao: number;
  novasAvaliacoes: number;
  entraramNoProcesso: number;
  concluidos: number;
  encerrados: number;
  contatosRegistrados: number;
  inconformidadesAbertas: number;
  acimaDaMeta: number;
  valorFinanciadoConcluido: number;
  tempoMedioConclusaoDias: number | null;
};

export async function buscarDashboardFinanciamento(params: {
  inicio: Date;
  fimExclusivo: Date;
  lojasFiltro: string[];
}): Promise<DashboardFinanciamento> {
  const { inicio, fimExclusivo, lojasFiltro } = params;
  const filtroLoja = whereLojaFiltroParceiro(lojasFiltro);
  const agora = Date.now();

  const [ativas, abertas, movimentos, contatos, concluidosAndamentos, novas, encerradosNoPeriodo] = await Promise.all([
    prisma.avaliacoes.findMany({
      where: { excluido: false, status: { notIn: STATUS_FINAIS }, AND: [filtroLoja] },
      select: {
        id: true,
        status: true,
        data_avaliacao: true,
        data_validade: true,
        clientes: { select: { nome: true } },
        bancos: { select: { nome: true } },
        parceiros: { select: { nome: true } },
        andamentos: { where: { excluido: false }, orderBy: { created_at: "desc" }, take: 1, select: { status_andamento: true } }
      }
    }),
    // etapa aberta de cada avaliação (relógio) e inconformidade aberta
    prisma.financiamento_atividades.findMany({
      where: { fim: null, tipo: { in: [TIPO_ETAPA, TIPO_INCONFORMIDADE] }, avaliacoes: { excluido: false, AND: [filtroLoja] } },
      select: { avaliacao_id: true, tipo: true, inicio: true, estimado: true }
    }),
    // movimentação no período: mudança de etapa, contato, conformidade
    prisma.financiamento_atividades.findMany({
      where: {
        inicio: { gte: inicio, lt: fimExclusivo },
        tipo: { in: [TIPO_ETAPA, TIPO_CONTATO_FIN, TIPO_CONFORMIDADE, TIPO_INCONFORMIDADE] },
        avaliacoes: { excluido: false, AND: [filtroLoja] }
      },
      select: { avaliacao_id: true, tipo: true, coluna: true }
    }),
    prisma.financiamento_atividades.groupBy({
      by: ["avaliacao_id"],
      where: { tipo: TIPO_CONTATO_FIN },
      _max: { inicio: true }
    }),
    prisma.andamentos.findMany({
      where: {
        excluido: false,
        data_conclusao: { gte: inicio, lt: fimExclusivo },
        avaliacoes: { excluido: false, AND: [filtroLoja] }
      },
      select: { avaliacao_id: true, valor_financiado: true, data_conclusao: true, avaliacoes: { select: { data_avaliacao: true } } }
    }),
    prisma.avaliacoes.count({
      where: { excluido: false, data_avaliacao: { gte: inicio, lt: fimExclusivo }, AND: [filtroLoja] }
    }),
    prisma.avaliacoes.findMany({
      where: {
        excluido: false,
        status: { in: ["Reprovação", "Avaliação cancelada", "Avaliação vencida"] },
        financiamento_atividades: { some: { tipo: TIPO_ETAPA, coluna: "encerrado", inicio: { gte: inicio, lt: fimExclusivo } } },
        AND: [filtroLoja]
      },
      select: { id: true }
    })
  ]);

  const etapaAberta = new Map<string, { inicio: Date; estimado: boolean }>();
  const inconformes = new Set<string>();
  for (const a of abertas) {
    if (a.tipo === TIPO_ETAPA) etapaAberta.set(a.avaliacao_id, { inicio: a.inicio, estimado: a.estimado });
    else inconformes.add(a.avaliacao_id);
  }
  const comMovimento = new Set(movimentos.map((m) => m.avaliacao_id));
  const ultimoContato = new Map(contatos.map((c) => [c.avaliacao_id, c._max.inicio]));

  // avaliações novas no período também são movimento (acabaram de entrar)
  const novasIds = await prisma.avaliacoes.findMany({
    where: { excluido: false, data_avaliacao: { gte: inicio, lt: fimExclusivo }, AND: [filtroLoja] },
    select: { id: true }
  });
  for (const n of novasIds) comMovimento.add(n.id);

  const carteiraMapa = new Map<ColunaFinId, LinhaCarteira>();
  for (const c of COLUNAS_FIN) {
    if (c.grupo === "fim") continue;
    carteiraMapa.set(c.id, { coluna: c.id, label: c.label, grupo: c.grupo, cor: c.cor, total: 0, semMovimentacao: 0, cards: [] });
  }

  let acimaDaMeta = 0;
  for (const a of ativas) {
    const and = a.andamentos[0] ?? null;
    const coluna = colunaDoCard(a.status, and?.status_andamento ?? null);
    const linha = carteiraMapa.get(coluna);
    if (!linha) continue;
    linha.total += 1;

    const aberta = etapaAberta.get(a.id) ?? null;
    const diasNaEtapa = aberta ? Math.max(0, Math.floor((agora - aberta.inicio.getTime()) / DIA_MS)) : 0;
    const sla = situacaoSla(coluna, diasNaEtapa) === "atrasado";
    if (sla) acimaDaMeta += 1;

    if (comMovimento.has(a.id)) continue;
    linha.semMovimentacao += 1;
    const contato = ultimoContato.get(a.id) ?? null;
    const validadeDias = a.data_validade ? Math.round((a.data_validade.getTime() - agora) / DIA_MS) : null;
    linha.cards.push({
      id: a.id,
      cliente: a.clientes?.nome ?? "Cliente não informado",
      banco: a.bancos?.nome ?? null,
      corretor: a.parceiros?.nome ?? null,
      diasNaEtapa,
      estimado: aberta?.estimado ?? true,
      ultimoContatoDias: contato ? Math.max(0, Math.floor((agora - contato.getTime()) / DIA_MS)) : null,
      validadeDias: validadeDias !== null && validadeDias <= DIAS_ALERTA_VALIDADE ? validadeDias : null,
      inconformidade: inconformes.has(a.id),
      acimaDaMeta: sla
    });
  }
  for (const l of carteiraMapa.values()) l.cards.sort((x, y) => y.diasNaEtapa - x.diasNaEtapa);
  const carteira = [...carteiraMapa.values()];

  // concluídos no período: andamento com data de conclusão no período OU etapa Concluído iniciada no período
  const concluidosPorEtapa = new Set(movimentos.filter((m) => m.tipo === TIPO_ETAPA && m.coluna === "concluido").map((m) => m.avaliacao_id));
  const concluidosIds = new Set([...concluidosAndamentos.map((a) => a.avaliacao_id), ...concluidosPorEtapa]);

  const entraramNoProcesso = new Set(
    movimentos
      .filter((m) => m.tipo === TIPO_ETAPA && m.coluna && COLUNA_FIN_POR_ID.get(m.coluna as ColunaFinId)?.grupo === "processo")
      .map((m) => m.avaliacao_id)
  ).size;

  const tempos: number[] = [];
  let valorFinanciado = 0;
  for (const a of concluidosAndamentos) {
    valorFinanciado += Number(a.valor_financiado ?? 0);
    if (a.data_conclusao && a.avaliacoes.data_avaliacao) {
      const dias = Math.round((a.data_conclusao.getTime() - a.avaliacoes.data_avaliacao.getTime()) / DIA_MS);
      if (dias >= 0) tempos.push(dias);
    }
  }

  return {
    carteira,
    totalCarteira: carteira.reduce((s, l) => s + l.total, 0),
    totalSemMovimentacao: carteira.reduce((s, l) => s + l.semMovimentacao, 0),
    novasAvaliacoes: novas,
    entraramNoProcesso,
    concluidos: concluidosIds.size,
    encerrados: encerradosNoPeriodo.length,
    contatosRegistrados: movimentos.filter((m) => m.tipo === TIPO_CONTATO_FIN).length,
    inconformidadesAbertas: inconformes.size,
    acimaDaMeta,
    valorFinanciadoConcluido: valorFinanciado,
    tempoMedioConclusaoDias: tempos.length ? Math.round(tempos.reduce((s, d) => s + d, 0) / tempos.length) : null
  };
}
