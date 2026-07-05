import { Topbar } from "@/components/topbar";
import { Pagination } from "@/components/pagination";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatData } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdministracoesPage({
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

  const [administracoes, total] = await Promise.all([
    prisma.adm_imoveis.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { clientes: true, imoveis: true, lojas: true }
    }),
    prisma.adm_imoveis.count({ where })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <Topbar />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-800">Administrações ({total})</div>
          <form className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={termo}
              placeholder="Buscar por proprietário ou imóvel..."
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
              <th className="font-normal py-1.5 border-b border-gray-100">Imóvel</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Proprietário</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Loja</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Status</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Entrada</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {administracoes.map((a) => (
              <tr key={a.id}>
                <td className="py-2 border-b border-gray-50">{a.imoveis?.endereco ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{a.clientes?.nome ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{a.lojas?.nome ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{a.status}</td>
                <td className="py-2 border-b border-gray-50">{formatData(a.data_entrada)}</td>
                <td className="py-2 border-b border-gray-50 text-right">{formatMoeda(a.valor_transacao)}</td>
              </tr>
            ))}
            {administracoes.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-400">
                  Nenhuma administração encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <Pagination page={page} totalPages={totalPages} basePath="/administracoes" q={termo} />
      </div>
    </div>
  );
}
