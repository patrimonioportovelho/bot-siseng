import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { AtividadesTabs } from "@/components/atividades-tabs";
import { MarketingCorretorPerfilForm } from "@/components/marketing-corretor-perfil-form";
import { listarParceirosAdministrativos } from "@/lib/parceiros/administrativos";
import { salvarPerfilCorretorAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MarketingCorretorPerfilPage({
  params,
  searchParams
}: {
  params: Promise<{ parceiroId: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { parceiroId } = await params;
  const { salvo } = await searchParams;

  const [corretor, perfil, administrativos] = await Promise.all([
    prisma.parceiros.findUnique({ where: { id: parceiroId }, select: { id: true, nome: true, funcao: true } }),
    prisma.marketing_corretores.findUnique({ where: { parceiro_id: parceiroId } }),
    listarParceirosAdministrativos()
  ]);
  if (!corretor) notFound();

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Marketing · {corretor.nome}</div>
        <AtividadesTabs ativo="/marketing" />
      </div>

      <Link href="/marketing/corretores" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-4">
        ← Voltar para Corretores
      </Link>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Perfil salvo com sucesso.
        </div>
      )}

      <MarketingCorretorPerfilForm
        parceiroId={corretor.id}
        perfil={perfil}
        administrativos={administrativos}
        action={salvarPerfilCorretorAction}
      />
    </div>
  );
}
