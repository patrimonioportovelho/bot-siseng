import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { AtividadesTabs } from "@/components/atividades-tabs";

export const dynamic = "force-dynamic";

const STATUS_COR: Record<string, string> = {
  Ativo: "bg-green-50 text-green-700 border-green-200",
  Pausado: "bg-[#A9822E]/10 text-[#A9822E] border-[#A9822E]/30",
  Encerrado: "bg-gray-100 text-gray-500 border-gray-200"
};

// Listagem de Empreendimentos (Fase 5a, 09/08/2026) — cadastro à parte,
// vinculado opcionalmente às Ordens de Marketing (ver empreendimento_id em
// marketing_ordens).
export default async function MarketingEmpreendimentosPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const termo = (q ?? "").trim();

  const empreendimentos = await prisma.marketing_empreendimentos.findMany({
    where: {
      excluido: false,
      ...(termo ? { nome: { contains: termo, mode: "insensitive" as const } } : {})
    },
    orderBy: { nome: "asc" },
    include: {
      parceiros: { select: { nome: true } },
      _count: { select: { marketing_ordens: true } }
    }
  });

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Marketing · Empreendimentos</div>
        <AtividadesTabs ativo="/marketing" />
      </div>

      <Link href="/marketing" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-4">
        ← Voltar para o quadro
      </Link>

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <form className="flex-1 min-w-[220px] max-w-sm">
          <input
            type="text"
            name="q"
            defaultValue={termo}
            placeholder="Buscar por nome..."
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white"
          />
        </form>
        <Link
          href="/marketing/empreendimentos/novo"
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
        >
          + Novo empreendimento
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {empreendimentos.map((e) => (
          <Link
            key={e.id}
            href={`/marketing/empreendimentos/${e.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-800 truncate">{e.nome}</div>
              <div className="text-[11px] text-gray-400 truncate">
                {e.construtora ?? "—"}
                {e.localizacao ? ` · ${e.localizacao}` : ""}
                {e.parceiros?.nome ? ` · ${e.parceiros.nome}` : ""}
                {e._count.marketing_ordens > 0 ? ` · ${e._count.marketing_ordens} Ordem(ns)` : ""}
              </div>
            </div>
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border shrink-0 ${STATUS_COR[e.status] ?? STATUS_COR.Ativo}`}>
              {e.status}
            </span>
          </Link>
        ))}
        {empreendimentos.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">Nenhum empreendimento cadastrado.</div>
        )}
      </div>
    </div>
  );
}
