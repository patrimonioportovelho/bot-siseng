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

  const [ordens, pedidosPendentesQtd] = await Promise.all([
    prisma.marketing_ordens.findMany({
      where: {
        excluido: false,
        ...(termo ? { titulo: { contains: termo, mode: "insensitive" as const } } : {})
      },
      orderBy: { created_at: "desc" },
      include: {
        parceiros_marketing_ordens_solicitante_parceiro_idToparceiros: { select: { nome: true } },
        parceiros_marketing_ordens_responsavel_atual_idToparceiros: { select: { nome: true } }
      }
    }),
    prisma.solicitacoes_agenda.count({ where: { excluido: false, status: "pendente" } })
  ]);

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
        <div className="flex items-center gap-2">
          <Link
            href="/marketing/empreendimentos"
            className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
          >
            Empreendimentos
          </Link>
          <Link
            href="/marketing/corretores"
            className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
          >
            Corretores
          </Link>
          <Link
            href="/marketing/agenda"
            className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap flex items-center gap-1.5"
          >
            Pedidos da Agenda
            {pedidosPendentesQtd > 0 && (
              <span className="bg-[#A9822E] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {pedidosPendentesQtd}
              </span>
            )}
          </Link>
          <Link
            href="/marketing/novo"
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
          >
            + Nova ordem
          </Link>
        </div>
      </div>

      <MarketingKanban ordens={ordens} moverColuna={moverColunaAction} />
    </div>
  );
}
