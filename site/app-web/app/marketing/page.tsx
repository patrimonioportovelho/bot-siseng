import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { MarketingKanban } from "@/components/marketing-kanban";
import { AtividadesTabs } from "@/components/atividades-tabs";
import { moverColunaAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function MarketingPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const termo = (q ?? "").trim();

  const ordens = await prisma.marketing_ordens.findMany({
    where: {
      excluido: false,
      ...(termo ? { titulo: { contains: termo, mode: "insensitive" as const } } : {})
    },
    orderBy: { created_at: "desc" },
    include: {
      parceiros_marketing_ordens_solicitante_parceiro_idToparceiros: { select: { nome: true } },
      parceiros_marketing_ordens_responsavel_atual_idToparceiros: { select: { nome: true } }
    }
  });

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Marketing</div>
        <AtividadesTabs ativo="/marketing" />
      </div>

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <form className="flex-1 min-w-[220px] max-w-sm">
          <input
            type="text"
            name="q"
            defaultValue={termo}
            placeholder="Buscar por título..."
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white"
          />
        </form>
        <Link
          href="/marketing/novo"
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
        >
          + Nova ordem
        </Link>
      </div>

      <MarketingKanban ordens={ordens} moverColuna={moverColunaAction} />
    </div>
  );
}
