import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { AtividadesTabs } from "@/components/atividades-tabs";
import { MarketingEmpreendimentoForm } from "@/components/marketing-empreendimento-form";
import { listarParceirosAdministrativos } from "@/lib/parceiros/administrativos";
import { criarEmpreendimentoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MarketingEmpreendimentoNovoPage() {
  const administrativos = await listarParceirosAdministrativos();

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Marketing · Novo empreendimento</div>
        <AtividadesTabs ativo="/marketing" />
      </div>

      <Link href="/marketing/empreendimentos" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-4">
        ← Voltar para Empreendimentos
      </Link>

      <MarketingEmpreendimentoForm empreendimento={null} administrativos={administrativos} action={criarEmpreendimentoAction} />
    </div>
  );
}
