import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { MetaForm } from "@/components/meta-form";
import { FUNCOES_CORRETOR } from "@/lib/transacoes/opcoes";
import { criarMetaAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaMetaPage() {
  const [corretores, lojas] = await Promise.all([
    prisma.parceiros.findMany({
      where: { funcao: { in: FUNCOES_CORRETOR }, status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, funcao: true }
    }),
    prisma.lojas.findMany({ orderBy: { nome: "asc" } })
  ]);

  return (
    <div>
      <Topbar />

      <Link href="/metas" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Metas
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Nova meta</div>

      <MetaForm meta={null} corretores={corretores} lojas={lojas} action={criarMetaAction} />
    </div>
  );
}
