import { prisma } from "@/lib/prisma";
import { STATUS_NAO_REALIZADA } from "@/lib/format";
import { buscarHonorariosRecebidosPorParceiroETipo } from "@/lib/parceiros/ranking-honorarios";
import { META_CAPTACOES, PRAZO_META_DIAS } from "@/lib/recrutamento/opcoes";

// Indicadores de evolução de Corretor / Corretor Estagiário, puxados do que o
// sistema já registra: imóveis captados, clientes cadastrados, propostas,
// transações (Locação e Compra e Venda), administrações, avaliações de
// financiamento, gestões, honorário recebido e último acesso ao portal.
export type MetricasCorretor = {
  captacoes: number;
  primeiraCaptacao: Date | null;
  // Dias entre a entrada e a 1ª captação (null se ainda não captou).
  diasAtePrimeiraCaptacao: number | null;
  // Captações feitas dentro dos primeiros 90 dias depois da entrada.
  captacoes90d: number;
  clientes: number;
  propostas: number;
  locacoes: number;
  vendas: number;
  administracoes: number;
  avaliacoes: number;
  gestoes: number;
  honorarioRecebido: number;
  ultimoAcessoPortal: Date | null;
};

const VAZIO: MetricasCorretor = {
  captacoes: 0,
  primeiraCaptacao: null,
  diasAtePrimeiraCaptacao: null,
  captacoes90d: 0,
  clientes: 0,
  propostas: 0,
  locacoes: 0,
  vendas: 0,
  administracoes: 0,
  avaliacoes: 0,
  gestoes: 0,
  honorarioRecebido: 0,
  ultimoAcessoPortal: null
};

const DIA_MS = 86400000;

export function diasEntre(inicio: Date, fim: Date): number {
  return Math.floor((fim.getTime() - inicio.getTime()) / DIA_MS);
}

export async function buscarMetricasCorretores(
  parceiros: { id: string; data_entrada: Date | null }[]
): Promise<Map<string, MetricasCorretor>> {
  const resultado = new Map<string, MetricasCorretor>();
  if (parceiros.length === 0) return resultado;
  const ids = parceiros.map((p) => p.id);
  for (const p of parceiros) resultado.set(p.id, { ...VAZIO });
  const m = (id: string) => resultado.get(id)!;

  const [imoveis, clientes, propostas, transacoes, adms, avaliacoes, gestoes, acessos, honorarios] = await Promise.all([
    prisma.imoveis.findMany({
      where: { parceiro_id: { in: ids }, excluido: false },
      select: { parceiro_id: true, data_cadastro: true }
    }),
    prisma.clientes.groupBy({ by: ["parceiro_id"], where: { parceiro_id: { in: ids } }, _count: { _all: true } }),
    prisma.propostas.groupBy({ by: ["parceiro_id"], where: { parceiro_id: { in: ids } }, _count: { _all: true } }),
    prisma.transacoes.findMany({
      where: {
        excluido: false,
        OR: [{ status: null }, { status: { notIn: STATUS_NAO_REALIZADA } }],
        AND: [{ OR: [{ corretor_proprietario_id: { in: ids } }, { corretor_contraparte_id: { in: ids } }] }]
      },
      select: { tipo: true, corretor_proprietario_id: true, corretor_contraparte_id: true }
    }),
    prisma.adm_imoveis.groupBy({
      by: ["parceiro_id"],
      where: { parceiro_id: { in: ids }, excluido: false },
      _count: { _all: true }
    }),
    prisma.avaliacoes.groupBy({
      by: ["parceiro_id"],
      where: { parceiro_id: { in: ids }, excluido: false },
      _count: { _all: true }
    }),
    prisma.gestoes.groupBy({
      by: ["parceiro_id"],
      where: { parceiro_id: { in: ids }, excluido: false },
      _count: { _all: true }
    }),
    prisma.logs_acesso.groupBy({
      by: ["parceiro_id"],
      where: { parceiro_id: { in: ids }, acao: "login" },
      _max: { criado_em: true }
    }),
    buscarHonorariosRecebidosPorParceiroETipo(new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2100, 0, 1)))
  ]);

  const entrada = new Map(parceiros.map((p) => [p.id, p.data_entrada]));

  for (const i of imoveis) {
    if (!i.parceiro_id || !resultado.has(i.parceiro_id)) continue;
    const x = m(i.parceiro_id);
    x.captacoes += 1;
    if (!x.primeiraCaptacao || i.data_cadastro < x.primeiraCaptacao) x.primeiraCaptacao = i.data_cadastro;
    const ent = entrada.get(i.parceiro_id);
    if (ent && i.data_cadastro >= ent && diasEntre(ent, i.data_cadastro) <= PRAZO_META_DIAS) x.captacoes90d += 1;
  }
  for (const p of parceiros) {
    const x = m(p.id);
    if (x.primeiraCaptacao && p.data_entrada) {
      x.diasAtePrimeiraCaptacao = Math.max(0, diasEntre(p.data_entrada, x.primeiraCaptacao));
    }
  }
  for (const c of clientes) if (c.parceiro_id && resultado.has(c.parceiro_id)) m(c.parceiro_id).clientes = c._count._all;
  for (const c of propostas) if (c.parceiro_id && resultado.has(c.parceiro_id)) m(c.parceiro_id).propostas = c._count._all;
  for (const t of transacoes) {
    const envolvidos = new Set([t.corretor_proprietario_id, t.corretor_contraparte_id].filter((v): v is string => !!v));
    for (const id of envolvidos) {
      if (!resultado.has(id)) continue;
      if (t.tipo === "Locação") m(id).locacoes += 1;
      else if (t.tipo === "Compra e Venda") m(id).vendas += 1;
    }
  }
  for (const c of adms) if (c.parceiro_id && resultado.has(c.parceiro_id)) m(c.parceiro_id).administracoes = c._count._all;
  for (const c of avaliacoes) if (c.parceiro_id && resultado.has(c.parceiro_id)) m(c.parceiro_id).avaliacoes = c._count._all;
  for (const c of gestoes) if (c.parceiro_id && resultado.has(c.parceiro_id)) m(c.parceiro_id).gestoes = c._count._all;
  for (const a of acessos) if (a.parceiro_id && resultado.has(a.parceiro_id)) m(a.parceiro_id).ultimoAcessoPortal = a._max.criado_em;
  for (const id of ids) m(id).honorarioRecebido = honorarios.get(id)?.total ?? 0;

  return resultado;
}

export { META_CAPTACOES, PRAZO_META_DIAS };
