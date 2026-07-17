import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { AvaliacaoForm } from "@/components/avaliacao-form";
import { criarAvaliacaoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaAvaliacaoPage() {
  const [clientes, bancos, parceiros] = await Promise.all([
    prisma.clientes.findMany({
      where: { OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, cpf: true, telefone: true, parceiro_id: true }
    }),
    prisma.bancos.findMany({ orderBy: { nome: "asc" } }),
    prisma.parceiros.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } })
  ]);

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3">
        <Link href="/financiamento" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Financiamento
        </Link>
      </div>

      <div className="text-sm font-bold text-gray-800 mb-4">Nova avaliação</div>

      <AvaliacaoForm avaliacao={null} clientes={clientes} bancos={bancos} parceiros={parceiros} action={criarAvaliacaoAction} />
    </div>
  );
}
