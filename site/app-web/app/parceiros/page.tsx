import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ParceirosPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const termo = (q ?? "").trim();

  const parceiros = await prisma.parceiros.findMany({
    where: termo
      ? {
          OR: [
            { nome: { contains: termo, mode: "insensitive" } },
            { email: { contains: termo, mode: "insensitive" } },
            { funcao: { contains: termo, mode: "insensitive" } }
          ]
        }
      : undefined,
    orderBy: { nome: "asc" },
    take: 300,
    include: { lojas: true }
  });

  return (
    <div>
      <Topbar />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-800">Parceiros ({parceiros.length})</div>
          <form className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={termo}
              placeholder="Buscar por nome, e-mail ou função..."
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
              <th className="font-normal py-1.5 border-b border-gray-100">Função</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Status</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Loja</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Telefone</th>
              <th className="font-normal py-1.5 border-b border-gray-100">E-mail</th>
            </tr>
          </thead>
          <tbody>
            {parceiros.map((p) => (
              <tr key={p.id}>
                <td className="py-2 border-b border-gray-50 font-medium text-gray-800">{p.nome}</td>
                <td className="py-2 border-b border-gray-50">{p.funcao}</td>
                <td className="py-2 border-b border-gray-50">{p.status_funcao}</td>
                <td className="py-2 border-b border-gray-50">{p.lojas?.nome ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{p.telefone ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{p.email ?? "—"}</td>
              </tr>
            ))}
            {parceiros.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-400">
                  Nenhum parceiro encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
