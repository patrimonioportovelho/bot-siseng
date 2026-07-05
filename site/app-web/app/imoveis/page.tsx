import { Topbar } from "@/components/topbar";
import { Pagination } from "@/components/pagination";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function formatMoeda(valor: unknown) {
  const n = Number(valor ?? 0);
  if (!n) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function ImoveisPage({
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
          { endereco: { contains: termo, mode: "insensitive" as const } },
          { bairro: { contains: termo, mode: "insensitive" as const } },
          { rua: { contains: termo, mode: "insensitive" as const } }
        ]
      }
    : undefined;

  const [imoveis, total] = await Promise.all([
    prisma.imoveis.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { cidades: true, parceiros: true }
    }),
    prisma.imoveis.count({ where })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <Topbar />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-800">Imóveis ({total})</div>
          <form className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={termo}
              placeholder="Buscar por endereço ou bairro..."
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-64 outline-none focus:border-primary"
            />
            <button type="submit" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5">
              Buscar
            </button>
          </form>
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-normal py-1.5 border-b border-gray-100">Endereço</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Tipo</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Oferta</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Status</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Captador</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {imoveis.map((i) => (
              <tr key={i.id}>
                <td className="py-2 border-b border-gray-50 font-medium text-gray-800">
                  {i.endereco ?? [i.rua, i.n_predial].filter(Boolean).join(", ") ?? "—"}
                  {i.cidades?.nome ? <span className="text-gray-400"> · {i.cidades.nome}</span> : null}
                </td>
                <td className="py-2 border-b border-gray-50">{i.tipo_imovel ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{i.tipo_oferta ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{i.status_imovel ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{i.parceiros?.nome ?? "—"}</td>
                <td className="py-2 border-b border-gray-50 text-right">{formatMoeda(i.valor_venda)}</td>
              </tr>
            ))}
            {imoveis.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-400">
                  Nenhum imóvel encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <Pagination page={page} totalPages={totalPages} basePath="/imoveis" q={termo} />
      </div>
    </div>
  );
}
