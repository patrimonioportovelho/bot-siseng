import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatDataCalendario, diasParaVencimento, situacaoVencimento } from "@/lib/format";
import { STATUS_AVALIACAO_PRIORIDADE, STATUS_AVALIACAO_ATIVOS, STATUS_AVALIACAO_ENCERRADOS } from "@/lib/financiamento/opcoes";

export const dynamic = "force-dynamic";

// Dias de antecedência pra uma Avaliação Aprovada entrar em alerta de
// vencimento — pedido do usuário: "sempre ficar em evidência todos a 30 dias
// de vencer, e de preferência subam" (mesma ideia do alerta de 90 dias da
// Locação, só que numa janela mais curta, condizente com o ritmo de
// financiamento).
const DIAS_ALERTA_VALIDADE = 30;

// Chave especial de grupo pras Avaliações Aprovadas que já têm Andamento
// cadastrado — são as negociações de fato em curso, por isso ficam acima de
// tudo (inclusive acima do "Aprovado" simples), conforme pedido do usuário.
const GRUPO_APROVADO_COM_ANDAMENTO = "Aprovado::comAndamento";

const ORDEM_GRUPOS = [GRUPO_APROVADO_COM_ANDAMENTO, ...STATUS_AVALIACAO_PRIORIDADE];

type Tone = "prioridade" | "ativa" | "alerta" | "concluida" | "encerrada";

const TONE_CLASSES: Record<Tone, string> = {
  prioridade: "bg-indigo-50 text-indigo-700 border-indigo-200",
  ativa: "bg-blue-50 text-blue-700 border-blue-200",
  alerta: "bg-amber-50 text-amber-700 border-amber-200",
  concluida: "bg-green-50 text-green-700 border-green-200",
  encerrada: "bg-red-50 text-red-600 border-red-200"
};

function statusTone(grupoChave: string, status: string): Tone {
  if (grupoChave === GRUPO_APROVADO_COM_ANDAMENTO) return "prioridade";
  if (status === "Concluído") return "concluida";
  if (STATUS_AVALIACAO_ENCERRADOS.includes(status)) return "encerrada";
  if (status === "Aprovado") return "alerta";
  return "ativa";
}

function tituloGrupo(grupoChave: string): string {
  if (grupoChave === GRUPO_APROVADO_COM_ANDAMENTO) return "Aprovado — negociação em andamento";
  return grupoChave;
}

function Cartao({ titulo, valor, destaque }: { titulo: string; valor: string; destaque?: "azul" | "verde" | "vermelho" | "roxo" }) {
  const cor =
    destaque === "azul"
      ? "text-blue-700"
      : destaque === "verde"
      ? "text-green-700"
      : destaque === "vermelho"
      ? "text-red-600"
      : destaque === "roxo"
      ? "text-indigo-700"
      : "text-gray-800";
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-[11px] text-gray-500">{titulo}</div>
      <div className={`text-xl font-bold mt-1 ${cor}`}>{valor}</div>
    </div>
  );
}

export default async function FinanciamentoPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const termo = (q ?? "").trim();

  const where = termo
    ? {
        OR: [
          { clientes: { nome: { contains: termo, mode: "insensitive" as const } } },
          { cpf: { contains: termo.replace(/\D/g, ""), mode: "insensitive" as const } },
          { id_legado: { contains: termo, mode: "insensitive" as const } }
        ]
      }
    : undefined;

  const [avaliacoes, andamentosEmAberto] = await Promise.all([
    prisma.avaliacoes.findMany({
      where,
      orderBy: [{ data_avaliacao: { sort: "desc", nulls: "last" } }, { created_at: "desc" }],
      include: {
        clientes: { select: { nome: true } },
        bancos: { select: { nome: true } },
        _count: { select: { andamentos: true } }
      }
    }),
    prisma.andamentos.count({ where: { status_andamento: { not: "Concluído" } } })
  ]);

  // Cartões de resumo — sempre refletem o filtro de busca atual, pra dar uma
  // visão rápida de "quantos são desse jeito" antes de abrir a lista inteira.
  const total = avaliacoes.length;
  const emAndamento = avaliacoes.filter((a) => STATUS_AVALIACAO_ATIVOS.includes(a.status)).length;
  const concluidas = avaliacoes.filter((a) => a.status === "Concluído").length;
  const valorAprovadoTotal = avaliacoes.reduce((acc, a) => acc + Number(a.valor_aprovado ?? 0), 0);
  const aprovadosComAndamento = avaliacoes.filter((a) => a.status === "Aprovado" && a._count.andamentos > 0).length;
  const aprovadosVencendo = avaliacoes.filter((a) => {
    if (a.status !== "Aprovado") return false;
    const sit = situacaoVencimento(a.data_validade, false, DIAS_ALERTA_VALIDADE);
    return sit === "alerta" || sit === "vencido";
  }).length;

  // Agrupa por Status — mesma régua visual usada em Locação/Compra e Venda
  // (components/transacoes-lista.tsx): cabeçalho colorido por grupo, mais
  // "urgente"/ativo primeiro, encerrado/cancelado por último. "Aprovado" com
  // Andamento já cadastrado vira um grupo à parte (GRUPO_APROVADO_COM_ANDAMENTO),
  // separado do "Aprovado" simples — são as negociações de fato em curso.
  function grupoDe(a: (typeof avaliacoes)[number]): string {
    if (a.status === "Aprovado" && a._count.andamentos > 0) return GRUPO_APROVADO_COM_ANDAMENTO;
    return a.status;
  }
  const porGrupo = new Map<string, typeof avaliacoes>();
  for (const a of avaliacoes) {
    const g = grupoDe(a);
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g)!.push(a);
  }
  // Dentro dos dois grupos de "Aprovado", quem está mais perto de vencer (ou
  // já venceu e ainda não foi atualizado) sobe pro topo — pedido explícito do
  // usuário. Os demais grupos mantêm a ordem que já vieram da query (mais
  // recente primeiro).
  for (const g of [GRUPO_APROVADO_COM_ANDAMENTO, "Aprovado"]) {
    const itens = porGrupo.get(g);
    if (!itens) continue;
    itens.sort((x, y) => {
      const dx = diasParaVencimento(x.data_validade);
      const dy = diasParaVencimento(y.data_validade);
      if (dx === null && dy === null) return 0;
      if (dx === null) return 1;
      if (dy === null) return -1;
      return dx - dy;
    });
  }
  const gruposOrdenados = [...porGrupo.keys()].sort((x, y) => {
    const ix = ORDEM_GRUPOS.indexOf(x);
    const iy = ORDEM_GRUPOS.indexOf(y);
    if (ix === -1 && iy === -1) return x.localeCompare(y);
    if (ix === -1) return 1;
    if (iy === -1) return -1;
    return ix - iy;
  });

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Financiamento</div>
        <Link href="/financiamento/novo" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold">
          + Nova avaliação
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Cartao titulo="Avaliações (filtro atual)" valor={String(total)} />
        <Cartao titulo="Aprovados com negociação" valor={String(aprovadosComAndamento)} destaque="roxo" />
        <Cartao titulo="Aprovados vencendo em 30d" valor={String(aprovadosVencendo)} destaque="vermelho" />
        <Cartao titulo="Concluídas" valor={String(concluidas)} destaque="verde" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Cartao titulo="Em andamento" valor={String(emAndamento)} destaque="azul" />
        <Cartao titulo="Andamentos em aberto" valor={String(andamentosEmAberto)} destaque="vermelho" />
      </div>
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 mb-4 text-xs text-gray-600">
        Valor aprovado somado (filtro atual): <span className="font-semibold text-gray-800">{formatMoeda(valorAprovadoTotal)}</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">Avaliações ({total})</div>
          <form className="flex gap-2 flex-wrap">
            <input
              type="text"
              name="q"
              defaultValue={termo}
              placeholder="Buscar por cliente, CPF ou Id..."
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full sm:w-64 outline-none focus:border-primary"
            />
            <button type="submit" className="text-xs bg-white border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5">
              Buscar
            </button>
          </form>
        </div>

        {total === 0 && <div className="py-6 text-center text-gray-400 text-xs">Nenhuma avaliação encontrada.</div>}

        {gruposOrdenados.map((grupoChave) => {
          const doGrupo = porGrupo.get(grupoChave)!;
          const tone = statusTone(grupoChave, doGrupo[0].status);
          const mostraValidade = grupoChave === GRUPO_APROVADO_COM_ANDAMENTO || doGrupo[0].status === "Aprovado";
          return (
            <div key={grupoChave} className="mb-3 last:mb-0">
              <div className={`text-xs font-bold px-3 py-1.5 mb-1 rounded-lg border ${TONE_CLASSES[tone]}`}>
                {tituloGrupo(grupoChave)} ({doGrupo.length})
              </div>
              <div className="hidden md:grid md:grid-cols-[1.4fr_1fr_1fr_100px_100px_90px_120px] gap-3 px-3 py-1 text-[11px] text-gray-400 border-b border-gray-100">
                <span>Cliente</span>
                <span>Banco</span>
                <span>Tipo</span>
                <span>Avaliação</span>
                <span>Validade</span>
                <span className="text-right">Aprovado</span>
                <span className="text-right">Andamento</span>
              </div>
              <div className="flex flex-col">
                {doGrupo.map((a) => {
                  const sit = mostraValidade ? situacaoVencimento(a.data_validade, false, DIAS_ALERTA_VALIDADE) : null;
                  const dias = mostraValidade ? diasParaVencimento(a.data_validade) : null;
                  return (
                    <Link
                      key={a.id}
                      href={`/financiamento/${a.id}`}
                      className={`grid grid-cols-1 gap-1 md:grid-cols-[1.4fr_1fr_1fr_100px_100px_90px_120px] md:gap-3 md:items-center px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors ${
                        sit === "vencido" ? "bg-red-50/60" : sit === "alerta" ? "bg-amber-50/60" : ""
                      }`}
                    >
                      <span className="text-xs font-medium text-gray-800 truncate">{a.clientes?.nome ?? "Cliente sem cadastro"}</span>
                      <span className="text-xs text-gray-500 truncate">{a.bancos?.nome ?? "—"}</span>
                      <span className="text-xs text-gray-500 truncate">{a.tipo_avaliacao ?? "—"}</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">{formatDataCalendario(a.data_avaliacao)}</span>
                      <span className="text-xs whitespace-nowrap">
                        <span className={sit === "vencido" ? "text-red-600 font-semibold" : sit === "alerta" ? "text-amber-700 font-semibold" : "text-gray-500"}>
                          {formatDataCalendario(a.data_validade)}
                        </span>
                        {sit === "vencido" && dias !== null && <span className="block text-[10px] text-red-500">venceu há {Math.abs(dias)}d</span>}
                        {sit === "alerta" && dias !== null && <span className="block text-[10px] text-amber-600">vence em {dias}d</span>}
                      </span>
                      <span className="text-xs text-gray-600 text-right whitespace-nowrap">{formatMoeda(a.valor_aprovado)}</span>
                      <span className="text-xs text-right whitespace-nowrap">
                        {a._count.andamentos > 0 ? (
                          <span className="text-primary font-semibold">
                            {a._count.andamentos} andamento{a._count.andamentos > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
