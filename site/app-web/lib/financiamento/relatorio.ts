import { prisma } from "@/lib/prisma";
import {
  COLUNA_FIN_POR_ID,
  TIPO_CONFORMIDADE,
  TIPO_CONTATO_FIN,
  TIPO_ETAPA,
  TIPO_INCONFORMIDADE,
  type ColunaFinId
} from "@/lib/financiamento/quadro";

// Relatório do Financiamento: tempo por etapa, gargalos, conformidade e
// inconformidade e ciclo total. Tudo sai das atividades registradas pelo quadro
// (cada mudança de etapa/status do andamento é uma atividade com início e fim).
// Etapas antigas, anteriores ao quadro, têm o início ESTIMADO pelas datas
// cadastradas — o relatório mostra quantas são estimadas.
const DIA_MS = 86400000;

export type LinhaEtapa = {
  etapa: string;
  coluna: string | null;
  passagens: number; // etapas já encerradas no período
  estimadas: number; // das quais com início estimado
  mediaDias: number | null;
  maxDias: number | null;
  acimaDaMeta: number; // das encerradas
  metaDias: number | null;
  abertasAgora: number;
  abertasAcimaDaMeta: number;
};

export type Gargalo = {
  avaliacaoId: string;
  cliente: string;
  banco: string | null;
  etapa: string;
  dias: number;
  metaDias: number;
  estimado: boolean;
};

export type LinhaMotivo = { motivo: string; total: number; abertas: number; mediaResolucaoDias: number | null };
export type LinhaBanco = { banco: string; conformes: number; inconformidades: number };

export type RelatorioFinanciamento = {
  etapas: LinhaEtapa[];
  gargalos: Gargalo[];
  conformidade: {
    analises: number; // avaliações com ao menos uma análise no período
    conformesPrimeiraAnalise: number;
    conformes: number;
    inconformidades: number;
    abertas: number;
    mediaResolucaoDias: number | null;
    porMotivo: LinhaMotivo[];
    porBanco: LinhaBanco[];
  };
  ciclo: { tipoContrato: string; total: number; mediaDias: number | null }[];
  contatos: { total: number; porResponsavel: { nome: string; total: number }[] };
};

export async function gerarRelatorioFinanciamento(params: { de: Date; ate: Date; banco?: string | null }): Promise<RelatorioFinanciamento> {
  const { de, ate, banco } = params;
  const fimDia = new Date(ate.getTime() + DIA_MS); // inclusive
  const filtroAvaliacao = banco ? { avaliacoes: { bancos: { nome: banco }, excluido: false } } : { avaliacoes: { excluido: false } };

  const [noPeriodo, abertas] = await Promise.all([
    prisma.financiamento_atividades.findMany({
      where: { inicio: { gte: de, lt: fimDia }, ...filtroAvaliacao },
      select: {
        id: true,
        avaliacao_id: true,
        tipo: true,
        coluna: true,
        etapa: true,
        motivo: true,
        resultado: true,
        inicio: true,
        fim: true,
        estimado: true,
        por: { select: { nome: true } },
        avaliacoes: { select: { bancos: { select: { nome: true } } } }
      }
    }),
    prisma.financiamento_atividades.findMany({
      where: { tipo: TIPO_ETAPA, fim: null, ...filtroAvaliacao },
      select: {
        avaliacao_id: true,
        coluna: true,
        etapa: true,
        inicio: true,
        estimado: true,
        avaliacoes: { select: { clientes: { select: { nome: true } }, bancos: { select: { nome: true } } } }
      }
    })
  ]);

  const agora = Date.now();

  // ---- tempo por etapa ----
  const porEtapa = new Map<string, { coluna: string | null; dias: number[]; estimadas: number; acima: number; abertas: number; abertasAcima: number }>();
  const reg = (etapa: string, coluna: string | null) => {
    if (!porEtapa.has(etapa)) porEtapa.set(etapa, { coluna, dias: [], estimadas: 0, acima: 0, abertas: 0, abertasAcima: 0 });
    return porEtapa.get(etapa)!;
  };
  const metaDe = (coluna: string | null) => (coluna ? (COLUNA_FIN_POR_ID.get(coluna as ColunaFinId)?.slaDias ?? null) : null);

  for (const a of noPeriodo) {
    if (a.tipo !== TIPO_ETAPA || !a.etapa || !a.fim) continue;
    const e = reg(a.etapa, a.coluna);
    const dias = (a.fim.getTime() - a.inicio.getTime()) / DIA_MS;
    e.dias.push(dias);
    if (a.estimado) e.estimadas += 1;
    const meta = metaDe(a.coluna);
    if (meta && dias > meta) e.acima += 1;
  }
  const gargalos: Gargalo[] = [];
  for (const a of abertas) {
    if (!a.etapa) continue;
    const e = reg(a.etapa, a.coluna);
    e.abertas += 1;
    const dias = (agora - a.inicio.getTime()) / DIA_MS;
    const meta = metaDe(a.coluna);
    if (meta && dias > meta) {
      e.abertasAcima += 1;
      gargalos.push({
        avaliacaoId: a.avaliacao_id,
        cliente: a.avaliacoes.clientes?.nome ?? "Cliente não informado",
        banco: a.avaliacoes.bancos?.nome ?? null,
        etapa: a.etapa,
        dias: Math.floor(dias),
        metaDias: meta,
        estimado: a.estimado
      });
    }
  }
  gargalos.sort((x, y) => y.dias - x.dias);

  const etapas: LinhaEtapa[] = [...porEtapa.entries()]
    .map(([etapa, v]) => ({
      etapa,
      coluna: v.coluna,
      passagens: v.dias.length,
      estimadas: v.estimadas,
      mediaDias: v.dias.length ? v.dias.reduce((s, x) => s + x, 0) / v.dias.length : null,
      maxDias: v.dias.length ? Math.max(...v.dias) : null,
      acimaDaMeta: v.acima,
      metaDias: metaDe(v.coluna),
      abertasAgora: v.abertas,
      abertasAcimaDaMeta: v.abertasAcima
    }))
    .sort((x, y) => (y.mediaDias ?? -1) - (x.mediaDias ?? -1));

  // ---- conformidade ----
  const analises = noPeriodo
    .filter((a) => a.tipo === TIPO_CONFORMIDADE || a.tipo === TIPO_INCONFORMIDADE)
    .sort((x, y) => x.inicio.getTime() - y.inicio.getTime());
  const primeiraPorAvaliacao = new Map<string, string>();
  for (const a of analises) if (!primeiraPorAvaliacao.has(a.avaliacao_id)) primeiraPorAvaliacao.set(a.avaliacao_id, a.tipo);
  const incons = analises.filter((a) => a.tipo === TIPO_INCONFORMIDADE);
  const resolvidas = incons.filter((a) => a.fim);
  const motivos = new Map<string, { total: number; abertas: number; dias: number[] }>();
  for (const a of incons) {
    const m = a.motivo ?? "Sem motivo";
    if (!motivos.has(m)) motivos.set(m, { total: 0, abertas: 0, dias: [] });
    const x = motivos.get(m)!;
    x.total += 1;
    if (!a.fim) x.abertas += 1;
    else x.dias.push((a.fim.getTime() - a.inicio.getTime()) / DIA_MS);
  }
  const bancos = new Map<string, { conformes: number; inconformidades: number }>();
  for (const a of analises) {
    const b = a.avaliacoes.bancos?.nome ?? "Sem banco";
    if (!bancos.has(b)) bancos.set(b, { conformes: 0, inconformidades: 0 });
    const x = bancos.get(b)!;
    if (a.tipo === TIPO_CONFORMIDADE) x.conformes += 1;
    else x.inconformidades += 1;
  }

  // ---- ciclo total (andamentos concluídos, com datas) ----
  const ciclo = await prisma.$queryRawUnsafe<{ tipo_contrato: string | null; total: bigint; media: number | null }[]>(
    `select coalesce(a.tipo_contrato,'Não informado') tipo_contrato, count(*) total,
            avg((a.data_conclusao - a.data_inicio))::float media
       from andamentos a
       join avaliacoes v on v.id = a.avaliacao_id
       ${banco ? "join bancos b on b.id = v.banco_id" : ""}
      where a.excluido = false and v.excluido = false
        and a.data_inicio is not null and a.data_conclusao is not null
        and a.data_conclusao >= a.data_inicio
        and a.data_conclusao >= $1::date and a.data_conclusao <= $2::date
        ${banco ? "and b.nome = $3" : ""}
      group by 1 order by 1`,
    de,
    ate,
    ...(banco ? [banco] : [])
  );

  // ---- mensagens/contatos ----
  const contatos = noPeriodo.filter((a) => a.tipo === TIPO_CONTATO_FIN);
  const porResp = new Map<string, number>();
  for (const c of contatos) {
    const nome = c.por?.nome ?? "—";
    porResp.set(nome, (porResp.get(nome) ?? 0) + 1);
  }

  return {
    etapas,
    gargalos: gargalos.slice(0, 15),
    conformidade: {
      analises: primeiraPorAvaliacao.size,
      conformesPrimeiraAnalise: [...primeiraPorAvaliacao.values()].filter((t) => t === TIPO_CONFORMIDADE).length,
      conformes: analises.filter((a) => a.tipo === TIPO_CONFORMIDADE).length,
      inconformidades: incons.length,
      abertas: incons.filter((a) => !a.fim).length,
      mediaResolucaoDias: resolvidas.length
        ? resolvidas.reduce((s, a) => s + (a.fim!.getTime() - a.inicio.getTime()) / DIA_MS, 0) / resolvidas.length
        : null,
      porMotivo: [...motivos.entries()]
        .map(([motivo, v]) => ({
          motivo,
          total: v.total,
          abertas: v.abertas,
          mediaResolucaoDias: v.dias.length ? v.dias.reduce((s, x) => s + x, 0) / v.dias.length : null
        }))
        .sort((x, y) => y.total - x.total),
      porBanco: [...bancos.entries()].map(([banco, v]) => ({ banco, ...v })).sort((x, y) => y.inconformidades - x.inconformidades)
    },
    ciclo: ciclo.map((c) => ({ tipoContrato: c.tipo_contrato ?? "Não informado", total: Number(c.total), mediaDias: c.media })),
    contatos: {
      total: contatos.length,
      porResponsavel: [...porResp.entries()].map(([nome, total]) => ({ nome, total })).sort((x, y) => y.total - x.total)
    }
  };
}
