// Indicadores de mercado da faixa do cabeçalho do portal do corretor: dólar, euro, Selic, inflação (IPCA) e Ibovespa.
// Só leitura de fontes públicas, sem enviar nenhum dado de usuário:
//   - Câmbio: AwesomeAPI (economia.awesomeapi.com.br), cotação comercial em tempo quase real.
//   - Selic (meta) e IPCA: API de dados abertos do Banco Central (SGS 432, 13522 e 433).
//   - Ibovespa: Yahoo Finance (não oficial; se sair do ar, só o Ibovespa some da faixa).
// Cada indicador falha sozinho: se uma fonte não responder, os outros continuam aparecendo. O cache do Next
// (revalidate) evita bater nas fontes a cada página aberta: 10 min para câmbio/bolsa, 6 h para Selic/inflação.

export type Indicador = {
  id: "usd" | "eur" | "selic" | "ipca" | "ibov";
  rotulo: string;
  valor: string;
  // variação com sinal, já formatada ("+0,19%"); null quando a fonte não informa
  variacao: string | null;
  tendencia: "alta" | "baixa" | "estavel" | null;
  detalhe: string | null;
};

export type Mercado = { itens: Indicador[]; atualizadoEm: Date | null };

const REVALIDAR_COTACAO = 600;
const REVALIDAR_BCB = 21_600;
const TIMEOUT_MS = 4_000;

async function buscarJson<T>(url: string, revalidar: number): Promise<T | null> {
  try {
    const r = await fetch(url, {
      next: { revalidate: revalidar },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SisEng)", Accept: "application/json" }
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const fmt = (n: number, casas = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

function tendenciaDe(n: number | null): Indicador["tendencia"] {
  if (n === null) return null;
  if (Math.abs(n) < 0.005) return "estavel";
  return n > 0 ? "alta" : "baixa";
}

function variacaoPct(n: number | null): string | null {
  if (n === null) return null;
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}%`;
}

type Awesome = Record<string, { bid?: string; pctChange?: string; create_date?: string }>;

async function cambio(): Promise<{ itens: Indicador[]; data: Date | null }> {
  const j = await buscarJson<Awesome>("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL", REVALIDAR_COTACAO);
  const itens: Indicador[] = [];
  let data: Date | null = null;
  for (const [chave, id, rotulo] of [
    ["USDBRL", "usd", "Dólar"],
    ["EURBRL", "eur", "Euro"]
  ] as const) {
    const bid = num(j?.[chave]?.bid);
    if (bid === null) continue;
    const pct = num(j?.[chave]?.pctChange);
    itens.push({ id, rotulo, valor: `R$ ${fmt(bid)}`, variacao: variacaoPct(pct), tendencia: tendenciaDe(pct), detalhe: null });
    // create_date vem no horário de Brasília ("2026-11-20 12:18:23")
    const cd = j?.[chave]?.create_date;
    if (cd) {
      const d = new Date(cd.replace(" ", "T") + "-03:00");
      if (!Number.isNaN(d.getTime()) && (!data || d > data)) data = d;
    }
  }
  return { itens, data };
}

type PontoBcb = { data: string; valor: string };

function dataBcb(s: string): Date {
  const [d, m, a] = s.split("/").map(Number);
  return new Date(a, m - 1, d);
}

async function selic(): Promise<Indicador | null> {
  // Série diária: pede a janela dos últimos ~8 meses até hoje (o "ultimos/N" dessa série recusa N grande e pode
  // trazer datas futuras). O valor vigente é o último do intervalo.
  const hoje = new Date();
  const br = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 240);
  const j = await buscarJson<PontoBcb[]>(
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=${br(inicio)}&dataFinal=${br(hoje)}`,
    REVALIDAR_BCB
  );
  if (!Array.isArray(j) || !j.length) return null;
  const vigentes = j.filter((p) => dataBcb(p.data) <= hoje);
  const atual = num(vigentes[vigentes.length - 1]?.valor);
  if (atual === null) return null;
  const anteriorDiferente = [...vigentes].reverse().map((p) => num(p.valor)).find((v) => v !== null && v !== atual) ?? null;
  const delta = anteriorDiferente === null ? null : atual - anteriorDiferente;
  return {
    id: "selic",
    rotulo: "Selic",
    valor: `${fmt(atual)}% a.a.`,
    variacao: delta === null ? null : `${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))} p.p.`,
    tendencia: tendenciaDe(delta),
    detalhe: "meta definida pelo Copom"
  };
}

async function ipca(): Promise<Indicador | null> {
  const [doze, mensal] = await Promise.all([
    buscarJson<PontoBcb[]>("https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/2?formato=json", REVALIDAR_BCB),
    buscarJson<PontoBcb[]>("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/1?formato=json", REVALIDAR_BCB)
  ]);
  const atual = num(doze?.[doze.length - 1]?.valor);
  if (atual === null) return null;
  const anterior = num(doze?.[doze.length - 2]?.valor);
  const delta = anterior === null ? null : atual - anterior;
  const mes = num(mensal?.[0]?.valor);
  return {
    id: "ipca",
    rotulo: "Inflação (IPCA)",
    valor: `${fmt(atual)}% em 12m`,
    variacao: delta === null ? null : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${fmt(Math.abs(delta))} p.p.`,
    tendencia: tendenciaDe(delta),
    detalhe: mes === null ? null : `último mês: ${fmt(mes)}%`
  };
}

type Yahoo = {
  chart?: { result?: { meta?: { regularMarketPrice?: number; regularMarketChangePercent?: number; regularMarketTime?: number } }[] };
};

async function ibovespa(): Promise<{ item: Indicador | null; data: Date | null }> {
  const j = await buscarJson<Yahoo>("https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=5d&interval=1d", REVALIDAR_COTACAO);
  const meta = j?.chart?.result?.[0]?.meta;
  const preco = num(meta?.regularMarketPrice);
  if (preco === null) return { item: null, data: null };
  const pct = num(meta?.regularMarketChangePercent);
  const t = num(meta?.regularMarketTime);
  return {
    item: {
      id: "ibov",
      rotulo: "Ibovespa",
      valor: `${preco.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} pts`,
      variacao: variacaoPct(pct),
      tendencia: tendenciaDe(pct),
      detalhe: null
    },
    data: t ? new Date(t * 1000) : null
  };
}

export async function buscarMercado(): Promise<Mercado> {
  const [c, s, i, b] = await Promise.all([cambio(), selic(), ipca(), ibovespa()]);
  const itens: Indicador[] = [...c.itens, ...(s ? [s] : []), ...(i ? [i] : []), ...(b.item ? [b.item] : [])];
  // ordem fixa: dólar, euro, selic, inflação, bolsa
  const ordem = ["usd", "eur", "selic", "ipca", "ibov"];
  itens.sort((x, y) => ordem.indexOf(x.id) - ordem.indexOf(y.id));
  return { itens, atualizadoEm: c.data ?? b.data };
}
