import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { FinanceiroForm } from "@/components/financeiro-form";
import { criarMovimentacaoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaMovimentacaoPage() {
  const [categorias, clientes, parceiros, transacoesCompraVenda] = await Promise.all([
    prisma.categorias_financeiras.findMany({ orderBy: { nome: "asc" } }),
    prisma.clientes.findMany({
      // NULL em status_cadastro conta como "não arquivado" — mesmo critério
      // usado nos outros formulários (ver app/imoveis/novo/page.tsx).
      where: { OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    prisma.parceiros.findMany({
      where: { status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    prisma.transacoes.findMany({
      where: { tipo: "Compra e Venda", excluido: false },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        id_legado: true,
        valor_transacao: true,
        imoveis: { select: { endereco: true } },
        clientes_transacoes_cliente_idToclientes: { select: { nome: true } },
        clientes_transacoes_cliente_contraparte_idToclientes: { select: { nome: true } }
      }
    })
  ]);

  const transacoesOpcoes = transacoesCompraVenda.map((t) => ({
    id: t.id,
    id_legado: t.id_legado,
    valor_transacao: t.valor_transacao,
    imovelEndereco: t.imoveis?.endereco ?? null,
    proprietarioNome: t.clientes_transacoes_cliente_idToclientes?.nome ?? null,
    interessadoNome: t.clientes_transacoes_cliente_contraparte_idToclientes?.nome ?? null
  }));

  return (
    <div>
      <Topbar />

      <Link href="/financeiro" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Financeiro
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Nova movimentação</div>

      <FinanceiroForm
        categorias={categorias}
        clientes={clientes}
        parceiros={parceiros}
        transacoesCompraVenda={transacoesOpcoes}
        action={criarMovimentacaoAction}
      />
    </div>
  );
}
