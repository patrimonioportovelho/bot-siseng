import { Topbar } from "@/components/topbar";
import { Pagination } from "@/components/pagination";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ClientesPage({
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
          { nome: { contains: termo, mode: "insensitive" as const } },
          { email: { contains: termo, mode: "insensitive" as const } },
          { cpf: { contains: termo, mode: "insensitive" as const } }
        ]
      }
    : undefined;

  const [clientes, total] = await Promise.all([
    prisma.clientes.findMany({
      where,
      orderBy: { nome: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { cidades: true }
    }),
    prisma.clientes.count({ where })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <Topbar />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-800">Clientes ({total})</div>
          <form className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={termo}
              placeholder="Buscar por nome, e-mail ou CPF..."
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
              <th className="font-normal py-1.5 border-b border-gray-100">Nome</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Tipo</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Status</th>
              <th className="font-normal py-1.5 border-b border-gray-100">CPF/CNPJ</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Cidade</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Telefone</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td className="py-2 border-b border-gray-50 font-medium text-gray-800">{c.nome}</td>
                <td className="py-2 border-b border-gray-50">{c.tipo_cliente}</td>
                <td className="py-2 border-b border-gray-50">{c.status_cadastro ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{c.cpf ?? c.cnpj ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{c.cidades?.nome ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{c.telefone ?? "—"}</td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-400">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <Pagination page={page} totalPages={totalPages} basePath="/clientes" q={termo} />
      </div>
    </div>
  );
}
