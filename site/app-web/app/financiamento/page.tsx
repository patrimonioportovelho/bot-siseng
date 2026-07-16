import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatDataCalendario } from "@/lib/format";
import { STATUS_AVALIACAO_OPCOES, STATUS_AVALIACAO_ATIVOS, STATUS_AVALIACAO_ENCERRADOS } from "@/lib/financiamento/opcoes";

export const dynamic = "force-dynamic";

type Tone = "ativa" | "concluida" | "encerrada";

const TONE_CLASSES: Record<Tone, string> = {
  ativa: "bg-blue-50 text-blue-700 border-blue-200",
  concluida: "bg-green-50 text-green-700 border-green-200",
  encerrada: "bg-red-50 text-red-600 border-red-200"
};

function statusTone(status: string): Tone {
  if (status === "Concluído") return "concluida";
  if (STATUS_AVALIACAO_ENCERRADOS.includes(status)) return "encerrada";
  return "ativa";
}

function Cartao({ titulo, valor, destaque }: { titulo: string; valor: string; destaque?: "azul" | "verde" | "vermelho" }) {
  const cor =
    destaque === "azul"
      ? "text-blue-700"
      : destaque === "verde"
      ? "text-green-700"
      : destaque === "vermelho"
      ? "text-red-600"
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

  // Agrupa por Status — mesma régua visual usada em Locação/Compra e Venda
  // (components/transacoes-lista.tsx): cabeçalho colorido por grupo, mais
  // "urgente"/ativo primeiro, encerrado/cancelado por último.
  const porStatus = new Map<string, typeof avaliacoes>();
  for (const a of avaliacoes) {
    if (!porStatus.has(a.status)) porStatus.set(a.status, []);
    porStatus.get(a.status)!.push(a);
  }
  const statusOrdenados = [...porStatus.keys()].sort((x, y) => {
    const ix = STATUS_AVALIACAO_OPCOES.indexOf(x);
    const iy = STATUS_AVALIACAO_OPCOES.indexOf(y);
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
        <Cartao titulo="Em andamento" valor={String(emAndamento)} destaque="azul" />
        <Cartao titulo="Concluídas" valor={String(concluidas)} destaque="verde" />
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

        {statusOrdenados.map((status) => {
          const doStatus = porStatus.get(status)!;
          const tone = statusTone(status);
          return (
            <div key={status} className="mb-3 last:mb-0">
              <div className={`text-xs font-bold px-3 py-1.5 mb-1 rounded-lg border ${TONE_CLASSES[tone]}`}>
                {status} ({doStatus.length})
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
                {doStatus.map((a) => (
                  <Link
                    key={a.id}
                    href={`/financiamento/${a.id}`}
                    className="grid grid-cols-1 gap-1 md:grid-cols-[1.4fr_1fr_1fr_100px_100px_90px_120px] md:gap-3 md:items-center px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-medium text-gray-800 truncate">{a.clientes?.nome ?? "Cliente sem cadastro"}</span>
                    <span className="text-xs text-gray-500 truncate">{a.bancos?.nome ?? "—"}</span>
                    <span className="text-xs text-gray-500 truncate">{a.tipo_avaliacao ?? "—"}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{formatDataCalendario(a.data_avaliacao)}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{formatDataCalendario(a.data_validade)}</span>
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
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
