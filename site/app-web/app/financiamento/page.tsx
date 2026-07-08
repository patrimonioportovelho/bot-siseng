import { Topbar } from "@/components/topbar";
import { Pagination } from "@/components/pagination";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatData } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function FinanciamentoPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const termo = (q ?? "").trim();
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const where = termo
    ? {
        OR: [
          { clientes: { nome: { contains: termo, mode: "insensitive" as const } } },
          { imoveis: { endereco: { contains: termo, mode: "insensitive" as const } } }
        ]
      }
    : undefined;

  const [andamentos, total] = await Promise.all([
    prisma.andamentos.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { clientes: true, imoveis: true, lancamentos_financiamento: true }
    }),
    prisma.andamentos.count({ where })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <Topbar />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">Financiamento — Andamentos ({total})</div>
          <form className="flex gap-2 flex-wrap">
            <input
              type="text"
              name="q"
              defaultValue={termo}
              placeholder="Buscar por cliente ou imóvel..."
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full sm:w-64 outline-none focus:border-primary"
            />
            <button type="submit" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5">
              Buscar
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[650px]">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="font-normal py-1.5 border-b border-gray-100">Cliente</th>
                <th className="font-normal py-1.5 border-b border-gray-100">Imóvel</th>
                <th className="font-normal py-1.5 border-b border-gray-100">Tipo contrato</th>
                <th className="font-normal py-1.5 border-b border-gray-100">Lançamentos</th>
                <th className="font-normal py-1.5 border-b border-gray-100">Início</th>
                <th className="font-normal py-1.5 border-b border-gray-100 text-right">Valor financiado</th>
              </tr>
            </thead>
            <tbody>
              {andamentos.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 border-b border-gray-50">{a.clientes?.nome ?? "—"}</td>
                  <td className="py-2 border-b border-gray-50">{a.imoveis?.endereco ?? "—"}</td>
                  <td className="py-2 border-b border-gray-50">{a.tipo_contrato ?? "—"}</td>
                  <td className="py-2 border-b border-gray-50">{a.lancamentos_financiamento.length}</td>
                  <td className="py-2 border-b border-gray-50">{formatData(a.data_inicio)}</td>
                  <td className="py-2 border-b border-gray-50 text-right">{formatMoeda(a.valor_financiado)}</td>
                </tr>
              ))}
              {andamentos.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-400">
                    Nenhum andamento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} basePath="/financiamento" q={termo} />
      </div>
    </div>
  );
}
