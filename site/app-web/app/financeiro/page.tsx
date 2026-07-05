import { Topbar } from "@/components/topbar";
import { Pagination } from "@/components/pagination";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatData } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function FinanceiroPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string; pago?: string }>;
}) {
  const { q, page: pageParam, pago } = await searchParams;
  const termo = (q ?? "").trim();
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const where = {
    ...(pago === "sim" ? { pago: true } : pago === "nao" ? { pago: false } : {}),
    ...(termo
      ? {
          OR: [
            { descricao: { contains: termo, mode: "insensitive" as const } },
            { contraparte_nome: { contains: termo, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const [movimentacoes, total, somaAberto] = await Promise.all([
    prisma.movimentacoes.findMany({
      where,
      orderBy: { vencimento: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { categorias_financeiras: true }
    }),
    prisma.movimentacoes.count({ where }),
    prisma.movimentacoes.aggregate({ _sum: { valor: true }, where: { pago: false } })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <Topbar />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Total de movimentações</div>
          <div className="text-xl font-bold mt-1 text-gray-900">{total}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Em aberto (não pago)</div>
          <div className="text-xl font-bold mt-1 text-accent">{formatMoeda(somaAberto._sum.valor ?? 0)}</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-800">Movimentações ({total})</div>
          <form className="flex gap-2">
            {pago && <input type="hidden" name="pago" value={pago} />}
            <input
              type="text"
              name="q"
              defaultValue={termo}
              placeholder="Buscar por descrição ou contraparte..."
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-64 outline-none focus:border-primary"
            />
            <button type="submit" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5">
              Buscar
            </button>
          </form>
        </div>

        <div className="flex gap-2 mb-3">
          <a href="/financeiro" className={"text-xs px-3 py-1 rounded-full border " + (!pago ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600")}>
            Todas
          </a>
          <a href="/financeiro?pago=nao" className={"text-xs px-3 py-1 rounded-full border " + (pago === "nao" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600")}>
            Em aberto
          </a>
          <a href="/financeiro?pago=sim" className={"text-xs px-3 py-1 rounded-full border " + (pago === "sim" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600")}>
            Pagas
          </a>
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-normal py-1.5 border-b border-gray-100">Vencimento</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Tipo</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Categoria</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Descrição / contraparte</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Pago?</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {movimentacoes.map((m) => (
              <tr key={m.id}>
                <td className="py-2 border-b border-gray-50">{formatData(m.vencimento)}</td>
                <td className="py-2 border-b border-gray-50">{m.tipo}</td>
                <td className="py-2 border-b border-gray-50">{m.categorias_financeiras?.nome ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{m.descricao ?? m.contraparte_nome ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{m.pago ? "Sim" : "Não"}</td>
                <td className="py-2 border-b border-gray-50 text-right">{formatMoeda(m.valor)}</td>
              </tr>
            ))}
            {movimentacoes.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-400">
                  Nenhuma movimentação encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <Pagination page={page} totalPages={totalPages} basePath="/financeiro" q={termo} />
      </div>
    </div>
  );
}
