import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ParceiroForm } from "@/components/parceiro-form";
import { criarParceiroAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovoParceiroPage() {
  const [lojas, bancos] = await Promise.all([
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.bancos.findMany({ orderBy: { nome: "asc" } })
  ]);

  return (
    <div>
      <Topbar />

      <Link href="/parceiros" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Parceiros
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Novo parceiro</div>

      <ParceiroForm parceiro={null} lojas={lojas} bancos={bancos} action={criarParceiroAction} />
    </div>
  );
}
