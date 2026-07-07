import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { FinanceiroEditarForm } from "@/components/financeiro-editar-form";
import { atualizarMovimentacaoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MovimentacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const movimentacao = await prisma.movimentacoes.findUnique({ where: { id } });
  if (!movimentacao) notFound();

  const [categorias, clientes, parceiros] = await Promise.all([
    prisma.categorias_financeiras.findMany({ orderBy: { nome: "asc" } }),
    prisma.clientes.findMany({
      where: { OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    prisma.parceiros.findMany({
      where: { status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    })
  ]);

  return (
    <div>
      <Topbar />

      <Link href="/financeiro" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Financeiro
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Movimentação</div>

      <FinanceiroEditarForm
        movimentacao={movimentacao}
        categorias={categorias}
        clientes={clientes}
        parceiros={parceiros}
        action={atualizarMovimentacaoAction}
      />
    </div>
  );
}
