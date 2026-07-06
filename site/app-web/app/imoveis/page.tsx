import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Pagination } from "@/components/pagination";
import { prisma } from "@/lib/prisma";
import { formatMoeda } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

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
          { rua: { contains: termo, mode: "insensitive" as const } },
          { clientes: { nome: { contains: termo, mode: "insensitive" as const } } }
        ]
      }
    : undefined;

  const [imoveis, total] = await Promise.all([
    prisma.imoveis.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { clientes: { include: { parceiros: true } }, parceiros: true }
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
          <div className="flex gap-2">
            <form className="flex gap-2">
              <input
                type="text"
                name="q"
                defaultValue={termo}
                placeholder="Buscar por endereço, bairro ou cliente..."
                className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-64 outline-none focus:border-primary"
              />
              <button type="submit" className="text-xs bg-white border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5">
                Buscar
              </button>
            </form>
            <Link
              href="/imoveis/novo"
              className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
            >
              + Adicionar imóvel
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-[1.2fr_2.6fr_1.6fr_auto] gap-3 px-3 py-1.5 text-[11px] text-gray-400 border-b border-gray-100">
          <span>Id imóvel</span>
          <span>Cliente (proprietário) / Parceiro</span>
          <span className="text-right">Venda / Avaliação</span>
          <span></span>
        </div>
        <div className="flex flex-col">
          {imoveis.map((i) => {
            const parceiroNome = i.clientes?.parceiros?.nome ?? i.parceiros?.nome ?? null;
            return (
              <Link
                key={i.id}
                href={`/imoveis/${i.id}`}
                className="grid grid-cols-[1.2fr_2.6fr_1.6fr_auto] gap-3 items-center px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="text-xs text-gray-500 truncate">{i.id_legado ?? i.id}</span>
                <span className="text-xs truncate">
                  <span className="font-medium text-gray-800">{i.clientes?.nome ?? "—"}</span>
                  <span className="text-gray-400"> · {parceiroNome ?? "sem parceiro"}</span>
                </span>
                <span className="text-xs text-right text-gray-600">
                  <span className="block">{i.valor_venda != null ? formatMoeda(i.valor_venda) : "—"}</span>
                  <span className="block text-gray-400">
                    {i.valor_avaliacao != null ? formatMoeda(i.valor_avaliacao) : "—"}
                  </span>
                </span>
                <span className="text-gray-300 text-xs">›</span>
              </Link>
            );
          })}
          {imoveis.length === 0 && (
            <div className="py-6 text-center text-gray-400 text-xs">Nenhum imóvel encontrado.</div>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} basePath="/imoveis" q={termo} />
      </div>
    </div>
  );
}
