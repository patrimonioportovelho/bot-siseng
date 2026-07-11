import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatDataCalendario, statusTone, resolverPeriodo } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Lista completa (Compra e Venda + Locação juntas) das transações assinadas
// dentro do período escolhido no Dashboard — o quadro "Transações do
// período" de lá mostra só as 15 mais recentes; aqui dá pra ver todas,
// paginado, com o mesmo filtro de período.
export default async function TransacoesPeriodoPage({
  searchParams
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string; q?: string; page?: string }>;
}) {
  const { periodo, inicio: inicioParam, fim: fimParam, q, page: pageParam } = await searchParams;
  const periodoResolvido = resolverPeriodo({ periodo, inicio: inicioParam, fim: fimParam });
  const { inicio, fimExclusivo } = periodoResolvido;
  const termo = (q ?? "").trim();
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const where = {
    excluido: false,
    data_assinatura: { gte: inicio, lt: fimExclusivo },
    ...(termo
      ? {
          OR: [
            { imoveis: { endereco: { contains: termo, mode: "insensitive" as const } } },
            {
              clientes_transacoes_cliente_idToclientes: { nome: { contains: termo, mode: "insensitive" as const } }
            },
            {
              clientes_transacoes_cliente_contraparte_idToclientes: {
                nome: { contains: termo, mode: "insensitive" as const }
              }
            },
            { id_legado: { contains: termo, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const [transacoes, total] = await Promise.all([
    prisma.transacoes.findMany({
      where,
      orderBy: { data_assinatura: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        imoveis: true,
        clientes_transacoes_cliente_idToclientes: true,
        clientes_transacoes_cliente_contraparte_idToclientes: true
      }
    }),
    prisma.transacoes.count({ where })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Preserva o período atual em qualquer link/paginação desta tela.
  const paramsPeriodo: Record<string, string | undefined> = {
    periodo: periodoResolvido.preset,
    inicio: periodoResolvido.preset === "personalizado" ? periodoResolvido.inicioTexto : undefined,
    fim: periodoResolvido.preset === "personalizado" ? periodoResolvido.fimTexto : undefined
  };
  const queryVoltar = new URLSearchParams();
  queryVoltar.set("periodo", periodoResolvido.preset);
  if (periodoResolvido.preset === "personalizado") {
    queryVoltar.set("inicio", periodoResolvido.inicioTexto);
    queryVoltar.set("fim", periodoResolvido.fimTexto);
  }

  return (
    <div>
      <Topbar />

      <Link
        href={`/dashboard?${queryVoltar.toString()}`}
        className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3"
      >
        ← Voltar para o Dashboard
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">Transações do período ({total})</div>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          Período: {formatDataCalendario(inicio)} até {formatDataCalendario(new Date(fimExclusivo.getTime() - 1))}, pela Data de
          assinatura.
        </p>

        <form className="flex gap-2 flex-wrap mb-3">
          <input type="hidden" name="periodo" value={periodoResolvido.preset} />
          {periodoResolvido.preset === "personalizado" && (
            <>
              <input type="hidden" name="inicio" value={periodoResolvido.inicioTexto} />
              <input type="hidden" name="fim" value={periodoResolvido.fimTexto} />
            </>
          )}
          <input
            type="text"
            name="q"
            defaultValue={termo}
            placeholder="Buscar por imóvel, cliente ou Id..."
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full sm:w-64 outline-none focus:border-primary"
          />
          <button type="submit" className="text-xs bg-white border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5">
            Buscar
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="font-normal py-1.5 border-b border-gray-100">Imóvel</th>
                <th className="font-normal py-1.5 border-b border-gray-100">Proprietário</th>
                <th className="font-normal py-1.5 border-b border-gray-100">Interessado</th>
                <th className="font-normal py-1.5 border-b border-gray-100">Tipo</th>
                <th className="font-normal py-1.5 border-b border-gray-100">Status</th>
                <th className="font-normal py-1.5 border-b border-gray-100">Assinatura</th>
                <th className="font-normal py-1.5 border-b border-gray-100 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {transacoes.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="py-2 border-b border-gray-50 max-w-[200px] truncate">
                    <Link href={`/transacoes/${t.id}`} className="block">
                      {t.imoveis?.endereco ?? "—"}
                    </Link>
                  </td>
                  <td className="py-2 border-b border-gray-50">
                    <Link href={`/transacoes/${t.id}`} className="block">
                      {t.clientes_transacoes_cliente_idToclientes?.nome ?? "—"}
                    </Link>
                  </td>
                  <td className="py-2 border-b border-gray-50">
                    <Link href={`/transacoes/${t.id}`} className="block">
                      {t.clientes_transacoes_cliente_contraparte_idToclientes?.nome ?? "—"}
                    </Link>
                  </td>
                  <td className="py-2 border-b border-gray-50">
                    <Link href={`/transacoes/${t.id}`} className="block">
                      {t.tipo}
                    </Link>
                  </td>
                  <td className="py-2 border-b border-gray-50">
                    <Link href={`/transacoes/${t.id}`} className="block">
                      <StatusBadge status={t.status ?? "—"} tone={statusTone(t.status)} />
                    </Link>
                  </td>
                  <td className="py-2 border-b border-gray-50 whitespace-nowrap">
                    <Link href={`/transacoes/${t.id}`} className="block">
                      {formatDataCalendario(t.data_assinatura)}
                    </Link>
                  </td>
                  <td className="py-2 border-b border-gray-50 text-right whitespace-nowrap">
                    <Link href={`/transacoes/${t.id}`} className="block">
                      {formatMoeda(t.valor_transacao)}
                    </Link>
                  </td>
                </tr>
              ))}
              {transacoes.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-400">
                    Nenhuma transação assinada nesse período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} basePath="/transacoes/periodo" q={termo} extraParams={paramsPeriodo} />
      </div>
    </div>
  );
}
