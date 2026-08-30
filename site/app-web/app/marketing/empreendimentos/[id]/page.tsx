import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { BotaoSubmit } from "@/components/botao-submit";
import { prisma } from "@/lib/prisma";
import { AtividadesTabs } from "@/components/atividades-tabs";
import { MarketingEmpreendimentoForm } from "@/components/marketing-empreendimento-form";
import { listarParceirosAdministrativos } from "@/lib/parceiros/administrativos";
import { atualizarEmpreendimentoAction, apagarEmpreendimentoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MarketingEmpreendimentoDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;

  const [empreendimento, administrativos, ordensVinculadas] = await Promise.all([
    prisma.marketing_empreendimentos.findUnique({ where: { id } }),
    listarParceirosAdministrativos(),
    prisma.marketing_ordens.findMany({
      where: { empreendimento_id: id, excluido: false },
      orderBy: { created_at: "desc" },
      select: { id: true, id_legado: true, titulo: true, coluna: true }
    })
  ]);
  if (!empreendimento) notFound();

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Marketing · {empreendimento.nome}</div>
        <AtividadesTabs ativo="/marketing" />
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Link href="/marketing/empreendimentos" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Empreendimentos
        </Link>
        {!empreendimento.excluido && (
          <form action={apagarEmpreendimentoAction}>
            <input type="hidden" name="empreendimentoId" value={empreendimento.id} />
            <BotaoSubmit variante="perigo" carregandoTexto="Apagando..." className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50">
              Apagar cadastro
            </BotaoSubmit>
          </form>
        )}
      </div>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Empreendimento salvo com sucesso.
        </div>
      )}

      {ordensVinculadas.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <div className="text-sm font-bold text-gray-800 mb-2">Ordens de Marketing vinculadas ({ordensVinculadas.length})</div>
          <div className="flex flex-col gap-1">
            {ordensVinculadas.map((o) => (
              <Link key={o.id} href={`/marketing/${o.id}`} className="text-xs text-primary hover:underline">
                {o.id_legado ?? "OM"} — {o.titulo}
              </Link>
            ))}
          </div>
        </div>
      )}

      <MarketingEmpreendimentoForm
        empreendimento={empreendimento}
        administrativos={administrativos}
        action={atualizarEmpreendimentoAction}
      />
    </div>
  );
}
