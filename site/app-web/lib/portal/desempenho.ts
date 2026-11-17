import { prisma } from "@/lib/prisma";
import { STATUS_NAO_REALIZADA, STATUS_TRANSACAO_EM_ABERTO } from "@/lib/format";
import { STATUS_COMPRA_FINALIZADA } from "@/lib/clientes/funil";
import { buscarHonorariosRecebidosPorParceiro } from "@/lib/parceiros/ranking-honorarios";

// Desempenho do corretor no portal (inspirado no relatório "Desempenho" do iList): produção do período, leads por mês,
// comparativo com a equipe e carteira atual. Só usa dados do SisEng. O ranking é entre os corretores do sistema e cada
// corretor vê só a posição dele e a média da equipe, nunca os números dos colegas.

export type PresetPeriodo = "mes" | "mes_anterior" | "trimestre" | "ano" | "12m" | "personalizado";

export const PRESETS_PERIODO: { id: Exclude<PresetPeriodo, "personalizado">; rotulo: string }[] = [
  { id: "mes", rotulo: "Mês atual" },
  { id: "mes_anterior", rotulo: "Mês anterior" },
  { id: "trimestre", rotulo: "Trimestre" },
  { id: "ano", rotulo: "Ano" },
  { id: "12m", rotulo: "Últimos 12 meses" }
];

export type PeriodoDesempenho = {
  preset: PresetPeriodo;
  // Datas de calendário (meia-noite UTC), para colunas @db.Date. `fimExclusivo` é o dia seguinte ao último dia.
  inicio: Date;
  fimExclusivo: Date;
  // Mesmo intervalo como momento real (meia-noite de Porto Velho, UTC-4), para colunas timestamptz.
  inicioTs: Date;
  fimTs: Date;
  rotulo: string;
  de: string;
  ate: string;
  aviso: string | null;
};

const DIA_MS = 86_400_000;
const FUSO_PORTO_VELHO_MS = 4 * 3_600_000;
const MAXIMO_MESES_PERSONALIZADO = 36;

const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const br = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

function lerData(valor: string | undefined): Date | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || iso(d) !== valor ? null : d;
}

// `hoje` = dia de hoje em Porto Velho (hojePortoVelho()). O padrão é o ano corrente, como no relatório do iList.
export function resolverPeriodo(entrada: { periodo?: string; de?: string; ate?: string }, hoje: Date): PeriodoDesempenho {
  const a = hoje.getFullYear();
  const m = hoje.getMonth();
  const d = hoje.getDate();
  const amanha = utc(a, m, d + 1);
  let preset: PresetPeriodo = (["mes", "mes_anterior", "trimestre", "ano", "12m", "personalizado"] as const).find((p) => p === entrada.periodo) ?? "ano";
  let inicio = utc(a, 0, 1);
  let fimExclusivo = amanha;
  let aviso: string | null = null;

  if (preset === "mes") inicio = utc(a, m, 1);
  else if (preset === "mes_anterior") {
    inicio = utc(a, m - 1, 1);
    fimExclusivo = utc(a, m, 1);
  } else if (preset === "trimestre") inicio = utc(a, m - (m % 3), 1);
  else if (preset === "12m") inicio = utc(a - 1, m, d + 1);
  else if (preset === "personalizado") {
    const de = lerData(entrada.de);
    const ate = lerData(entrada.ate);
    if (!de || !ate) {
      preset = "ano";
      aviso = "Informe as duas datas (de / até) para filtrar por um período personalizado. Mostrando o ano.";
    } else if (ate < de) {
      preset = "ano";
      aviso = "A data final é anterior à inicial. Mostrando o ano.";
    } else {
      inicio = de;
      fimExclusivo = new Date(ate.getTime() + DIA_MS);
      const limite = utc(de.getUTCFullYear(), de.getUTCMonth() + MAXIMO_MESES_PERSONALIZADO, de.getUTCDate());
      if (fimExclusivo > limite) {
        fimExclusivo = limite;
        aviso = `Período limitado a ${MAXIMO_MESES_PERSONALIZADO} meses.`;
      }
    }
  }

  const ultimoDia = new Date(fimExclusivo.getTime() - DIA_MS);
  return {
    preset,
    inicio,
    fimExclusivo,
    inicioTs: new Date(inicio.getTime() + FUSO_PORTO_VELHO_MS),
    fimTs: new Date(fimExclusivo.getTime() + FUSO_PORTO_VELHO_MS),
    rotulo: `${br(inicio)} a ${br(ultimoDia)}`,
    de: iso(inicio),
    ate: iso(ultimoDia),
    aviso
  };
}

export type Comparativo = {
  voce: number;
  // média dos corretores com atividade no período (inclui você); 0 se ninguém teve
  media: number;
  // 1 = melhor; null quando você não teve atividade na métrica
  posicao: number | null;
  // quantos corretores tiveram atividade na métrica
  total: number;
};

function comparar(valores: Map<string, number>, eu: string): Comparativo {
  const ativos = [...valores.values()].filter((v) => v > 0);
  const voce = valores.get(eu) ?? 0;
  const media = ativos.length ? ativos.reduce((s, v) => s + v, 0) / ativos.length : 0;
  return { voce, media, posicao: voce > 0 ? 1 + ativos.filter((v) => v > voce).length : null, total: ativos.length };
}

export type DesempenhoCorretor = {
  corretor: { nome: string; creci: string | null; funcao: string | null; desde: Date | null; fotoUrl: string | null };
  periodo: PeriodoDesempenho;
  producao: {
    captacoes: Comparativo & { comExclusividade: number; semExclusividade: number };
    vendasConcluidas: Comparativo & { vgv: Comparativo };
    vendasAcordadas: Comparativo & { valor: number };
    locacoes: Comparativo & { valor: number };
    honorarios: Comparativo;
    leads: Comparativo;
  };
  leadsPorMes: { label: string; leads: number }[];
  carteira: {
    imoveis: number;
    anunciados: number;
    comExclusividade: number;
    semExclusividade: number;
    diasMedios: number | null;
    diasMediosEscritorio: number | null;
    precoMedio: number | null;
    precoMedioEscritorio: number | null;
    porEtapa: { coluna: string; qtd: number }[];
  };
};

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function somarPor(mapa: Map<string, number>, id: string | null | undefined, valor: number) {
  if (!id) return;
  mapa.set(id, (mapa.get(id) ?? 0) + valor);
}

const media = (nums: number[]) => (nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null);

export async function buscarDesempenho(parceiroId: string, periodo: PeriodoDesempenho, agora: Date = new Date()): Promise<DesempenhoCorretor> {
  const { inicio, fimExclusivo, inicioTs, fimTs } = periodo;
  const noPeriodoData = { gte: inicio, lt: fimExclusivo };
  const noPeriodoTs = { gte: inicioTs, lt: fimTs };

  const [eu, corretores, gestoesPeriodo, vendasFinal, vendasAbertas, locacoes, clientes, honorarios, gestoesCarteira] = await Promise.all([
    prisma.parceiros.findUnique({ where: { id: parceiroId }, select: { nome: true, creci: true, funcao: true, data_entrada: true, foto_url: true } }),
    prisma.parceiros.findMany({ where: { funcao: "Corretor", status_funcao: { not: "Excluído" } }, select: { id: true } }),
    prisma.gestoes.findMany({ where: { excluido: false, created_at: noPeriodoTs }, select: { parceiro_id: true, tipo: true } }),
    prisma.transacoes.findMany({
      where: { excluido: false, tipo: "Compra e Venda", status: { in: STATUS_COMPRA_FINALIZADA }, data_assinatura: noPeriodoData },
      select: { corretor_proprietario_id: true, corretor_contraparte_id: true, valor_transacao: true }
    }),
    prisma.transacoes.findMany({
      where: { excluido: false, tipo: "Compra e Venda", status: STATUS_TRANSACAO_EM_ABERTO, data_cadastro: noPeriodoData },
      select: { corretor_proprietario_id: true, corretor_contraparte_id: true, valor_transacao: true }
    }),
    prisma.transacoes.findMany({
      where: { excluido: false, tipo: "Locação", status: { notIn: STATUS_NAO_REALIZADA }, data_assinatura: noPeriodoData },
      select: { corretor_proprietario_id: true, corretor_contraparte_id: true, valor_transacao: true }
    }),
    prisma.clientes.findMany({
      where: { data_cadastro: noPeriodoData, OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] },
      select: { parceiro_id: true, data_cadastro: true }
    }),
    buscarHonorariosRecebidosPorParceiro(inicio, fimExclusivo),
    prisma.gestoes.findMany({
      where: { excluido: false },
      select: { parceiro_id: true, tipo: true, coluna: true, created_at: true, imovel_id: true, imoveis: { select: { valor_venda: true, anuncio_id: true } } }
    })
  ]);

  // Quem entra no ranking: os corretores do sistema (e você, se for estagiário).
  const ids = new Set(corretores.map((c) => c.id));
  ids.add(parceiroId);
  const so = <T extends { parceiro_id: string | null }>(l: T[]) => l.filter((x) => x.parceiro_id && ids.has(x.parceiro_id));

  // Captações
  const captacoes = new Map<string, number>();
  for (const g of so(gestoesPeriodo)) somarPor(captacoes, g.parceiro_id, 1);
  const minhasCaptacoes = gestoesPeriodo.filter((g) => g.parceiro_id === parceiroId);

  // Negócios: os dois lados da transação ganham o crédito (uma vez só se for o mesmo corretor).
  function porTransacao(lista: { corretor_proprietario_id: string | null; corretor_contraparte_id: string | null; valor_transacao: unknown }[]) {
    const qtd = new Map<string, number>();
    const valor = new Map<string, number>();
    for (const t of lista) {
      const lados = new Set([t.corretor_proprietario_id, t.corretor_contraparte_id].filter((x): x is string => !!x && ids.has(x)));
      for (const id of lados) {
        somarPor(qtd, id, 1);
        somarPor(valor, id, Number(t.valor_transacao ?? 0));
      }
    }
    return { qtd, valor };
  }
  const concluidas = porTransacao(vendasFinal);
  const acordadas = porTransacao(vendasAbertas);
  const alugueis = porTransacao(locacoes);

  // Leads: clientes cadastrados no período (pela Data de cadastro do cliente, não pelo momento da importação)
  const leads = new Map<string, number>();
  for (const c of so(clientes)) somarPor(leads, c.parceiro_id, 1);

  const honorariosCorretores = new Map([...honorarios].filter(([id]) => ids.has(id)));

  // Leads por mês (só os seus)
  const porMes = new Map<string, number>();
  for (let d = new Date(inicio); d < fimExclusivo; d = utcMesSeguinte(d)) porMes.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, 0);
  for (const c of clientes) {
    if (c.parceiro_id !== parceiroId || !c.data_cadastro) continue;
    const chave = `${c.data_cadastro.getUTCFullYear()}-${c.data_cadastro.getUTCMonth()}`;
    if (porMes.has(chave)) porMes.set(chave, (porMes.get(chave) ?? 0) + 1);
  }
  const mostrarAno = new Set([...porMes.keys()].map((k) => k.split("-")[0])).size > 1;
  const leadsPorMes = [...porMes.entries()].map(([k, leadsMes]) => {
    const [ano, mes] = k.split("-").map(Number);
    return { label: mostrarAno ? `${MESES_ABREV[mes]}/${String(ano).slice(2)}` : MESES_ABREV[mes], leads: leadsMes };
  });

  // Carteira atual (situação de hoje, sem filtro de período)
  const diasDesde = (d: Date) => Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 86_400_000));
  const precos = (l: typeof gestoesCarteira) => l.map((g) => Number(g.imoveis.valor_venda ?? 0)).filter((v) => v > 0);
  const minhas = gestoesCarteira.filter((g) => g.parceiro_id === parceiroId);
  const imoveisMeus = new Map(minhas.map((g) => [g.imovel_id, g]));
  const etapas = new Map<string, number>();
  for (const g of minhas) etapas.set(g.coluna, (etapas.get(g.coluna) ?? 0) + 1);

  const diasMedios = media(minhas.map((g) => diasDesde(g.created_at)));
  const diasEscritorio = media(gestoesCarteira.map((g) => diasDesde(g.created_at)));
  const precoMedio = media(precos(minhas));
  const precoEscritorio = media(precos(gestoesCarteira));

  return {
    corretor: { nome: eu?.nome ?? "", creci: eu?.creci ?? null, funcao: eu?.funcao ?? null, desde: eu?.data_entrada ?? null, fotoUrl: eu?.foto_url ?? null },
    periodo,
    producao: {
      captacoes: {
        ...comparar(captacoes, parceiroId),
        comExclusividade: minhasCaptacoes.filter((g) => g.tipo === "gestao").length,
        semExclusividade: minhasCaptacoes.filter((g) => g.tipo === "captacao").length
      },
      vendasConcluidas: { ...comparar(concluidas.qtd, parceiroId), vgv: comparar(concluidas.valor, parceiroId) },
      vendasAcordadas: { ...comparar(acordadas.qtd, parceiroId), valor: acordadas.valor.get(parceiroId) ?? 0 },
      locacoes: { ...comparar(alugueis.qtd, parceiroId), valor: alugueis.valor.get(parceiroId) ?? 0 },
      honorarios: comparar(honorariosCorretores, parceiroId),
      leads: comparar(leads, parceiroId)
    },
    leadsPorMes,
    carteira: {
      imoveis: imoveisMeus.size,
      anunciados: [...imoveisMeus.values()].filter((g) => !!g.imoveis.anuncio_id).length,
      comExclusividade: minhas.filter((g) => g.tipo === "gestao").length,
      semExclusividade: minhas.filter((g) => g.tipo === "captacao").length,
      diasMedios: diasMedios === null ? null : Math.round(diasMedios),
      diasMediosEscritorio: diasEscritorio === null ? null : Math.round(diasEscritorio),
      precoMedio,
      precoMedioEscritorio: precoEscritorio,
      porEtapa: [...etapas.entries()].map(([coluna, qtd]) => ({ coluna, qtd }))
    }
  };
}

function utcMesSeguinte(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}
