import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { MarketingForm } from "@/components/marketing-form";
import { listarParceirosAdministrativos } from "@/lib/parceiros/administrativos";
import { criarOrdemAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaOrdemMarketingPage() {
  const [corretores, administrativos] = await Promise.all([
    prisma.parceiros.findMany({
      where: { funcao: "Corretor", status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    listarParceirosAdministrativos()
  ]);

  return (
    <div>
      <Topbar />

      <Link href="/marketing" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Marketing
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Nova ordem de Marketing</div>

      <MarketingForm corretores={corretores} administrativos={administrativos} action={criarOrdemAction} />
    </div>
  );
}
