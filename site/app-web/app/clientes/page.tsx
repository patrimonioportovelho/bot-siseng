import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Pagination } from "@/components/pagination";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ClientesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string; excluido?: string }>;
}) {
  const { q, page: pageParam, excluido } = await searchParams;
  const termo = (q ?? "").trim();
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const where = {
    // NULL em status_cadastro conta como "não arquivado" — todo cliente
    // criado nunca tem esse campo setado, e "not: Arquivado" sozinho exclui
    // NULL no Postgres, o que sumia com clientes recém-criados da lista.
    AND: [
      { OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] },
      ...(termo
        ? [
            {
              OR: [
                { nome: { contains: termo, mode: "insensitive" as const } },
                { email: { contains: termo, mode: "insensitive" as const } },
                { cpf: { contains: termo, mode: "insensitive" as const } }
              ]
            }
          ]
        : [])
    ]
  };

  const [clientes, total] = await Promise.all([
    prisma.clientes.findMany({
      where,
      orderBy: { nome: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { parceiros: true }
    }),
    prisma.clientes.count({ where })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <Topbar />

      {excluido === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Cadastro apagado com sucesso.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-800">Clientes ({total})</div>
          <div className="flex gap-2">
            <form className="flex gap-2">
              <input
                type="text"
                name="q"
                defaultValue={termo}
                placeholder="Buscar por nome, e-mail ou CPF..."
                className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-64 outline-none focus:border-primary"
              />
              <button type="submit" className="text-xs bg-white border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5">
                Buscar
              </button>
            </form>
            <Link
              href="/clientes/novo"
              className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
            >
              + Adicionar cliente
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-[1.2fr_2.4fr_2fr_auto] gap-3 px-3 py-1.5 text-[11px] text-gray-400 border-b border-gray-100">
          <span>Id cliente</span>
          <span>Nome</span>
          <span>Parceiro responsável</span>
          <span></span>
        </div>
        <div className="flex flex-col">
          {clientes.map((c) => (
            <Link
              key={c.id}
              href={`/clientes/${c.id}`}
              className="grid grid-cols-[1.2fr_2.4fr_2fr_auto] gap-3 items-center px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-xs text-gray-500 truncate">{c.id_legado ?? c.id}</span>
              <span className="text-xs font-medium text-gray-800 truncate">{c.nome}</span>
              <span className="text-xs text-gray-500 truncate">{c.parceiros?.nome ?? "—"}</span>
              <span className="text-gray-300 text-xs">›</span>
            </Link>
          ))}
          {clientes.length === 0 && (
            <div className="py-6 text-center text-gray-400 text-xs">Nenhum cliente encontrado.</div>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} basePath="/clientes" q={termo} />
      </div>
    </div>
  );
}
