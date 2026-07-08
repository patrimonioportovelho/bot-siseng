import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ManutencaoKanban } from "@/components/manutencao-kanban";
import { moverColunaAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ManutencaoPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const termo = (q ?? "").trim();

  const tickets = await prisma.manutencoes.findMany({
    where: {
      excluido: false,
      ...(termo
        ? {
            OR: [
              { titulo: { contains: termo, mode: "insensitive" as const } },
              { clientes: { nome: { contains: termo, mode: "insensitive" as const } } },
              { parceiros: { nome: { contains: termo, mode: "insensitive" as const } } },
              { imoveis: { endereco: { contains: termo, mode: "insensitive" as const } } }
            ]
          }
        : {})
    },
    orderBy: [{ urgencia: "asc" }, { created_at: "desc" }],
    include: {
      imoveis: { select: { id: true, id_legado: true, endereco: true } },
      clientes: { select: { nome: true } },
      parceiros: { select: { nome: true } }
    }
  });

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Manutenção · Administração</div>
        <div className="flex gap-2">
          <Link href="/manutencao" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold">
            Quadro
          </Link>
          <Link
            href="/manutencao/calendario"
            className="text-xs border border-gray-300 text-gray-600 bg-white rounded-lg px-3 py-1.5 font-semibold"
          >
            Calendário
          </Link>
          <Link
            href="/manutencao/painel"
            className="text-xs border border-gray-300 text-gray-600 bg-white rounded-lg px-3 py-1.5 font-semibold"
          >
            Painel
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <form className="flex-1 min-w-[220px] max-w-sm">
          <input
            type="text"
            name="q"
            defaultValue={termo}
            placeholder="Buscar por título, proprietário, prestador..."
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white"
          />
        </form>
        <Link
          href="/manutencao/novo"
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
        >
          + Nova manutenção
        </Link>
      </div>

      <ManutencaoKanban tickets={tickets} moverColuna={moverColunaAction} />
    </div>
  );
}
