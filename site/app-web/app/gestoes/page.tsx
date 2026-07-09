import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { GestaoKanban } from "@/components/gestao-kanban";
import { AtividadesTabs } from "@/components/atividades-tabs";
import { moverColunaAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function GestoesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const termo = (q ?? "").trim();

  const gestoes = await prisma.gestoes.findMany({
    where: {
      excluido: false,
      ...(termo
        ? {
            OR: [
              { imoveis: { endereco: { contains: termo, mode: "insensitive" as const } } },
              { clientes: { nome: { contains: termo, mode: "insensitive" as const } } },
              { parceiros: { nome: { contains: termo, mode: "insensitive" as const } } }
            ]
          }
        : {})
    },
    orderBy: { created_at: "desc" },
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
        <div className="text-sm font-bold text-gray-800">Gestões · Captação Exclusiva</div>
        <AtividadesTabs ativo="/gestoes" />
      </div>

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <form className="flex-1 min-w-[220px] max-w-sm">
          <input
            type="text"
            name="q"
            defaultValue={termo}
            placeholder="Buscar por endereço, cliente ou corretor..."
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white"
          />
        </form>
        <p className="text-[11px] text-gray-400">
          Toda gestão nasce sozinha aqui quando um corretor gera o Contrato de Gestão pelo portal.
        </p>
      </div>

      <GestaoKanban gestoes={gestoes} moverColuna={moverColunaAction} />
    </div>
  );
}
