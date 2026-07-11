import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { FinanceiroForm } from "@/components/financeiro-form";
import { criarMovimentacaoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaMovimentacaoPage() {
  const [categorias, clientes, parceiros, transacoesParaRecebimento] = await Promise.all([
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
    // Traz tanto Compra e Venda quanto Locação — antes só vinha Compra e
    // Venda, e por isso categorias de Recebimento ligadas a locação
    // (Administração de Imóveis Locados, Locações, Locações - cauções)
    // não tinham contrato pra escolher.
    prisma.transacoes.findMany({
      where: { tipo: { in: ["Compra e Venda", "Locação"] }, excluido: false },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        id_legado: true,
        tipo: true,
        valor_transacao: true,
        valor_caucao: true,
        porc_honorario: true,
        tem_parceria: true,
        porc_parceria: true,
        porc_corretor_proprietario: true,
        porc_corretor_contraparte: true,
        imoveis: { select: { endereco: true } },
        clientes_transacoes_cliente_idToclientes: { select: { id: true, nome: true } },
        clientes_transacoes_cliente_contraparte_idToclientes: { select: { id: true, nome: true } },
        parceiros_transacoes_corretor_proprietario_idToparceiros: { select: { id: true, nome: true } },
        parceiros_transacoes_corretor_contraparte_idToparceiros: { select: { id: true, nome: true } }
      }
    })
  ]);

  const transacoesOpcoes = transacoesParaRecebimento.map((t) => ({
    id: t.id,
    id_legado: t.id_legado,
    tipo: t.tipo,
    valor_transacao: t.valor_transacao,
    valor_caucao: t.valor_caucao,
    porc_honorario: t.porc_honorario,
    tem_parceria: t.tem_parceria,
    porc_parceria: t.porc_parceria,
    porc_corretor_proprietario: t.porc_corretor_proprietario,
    porc_corretor_contraparte: t.porc_corretor_contraparte,
    imovelEndereco: t.imoveis?.endereco ?? null,
    proprietarioId: t.clientes_transacoes_cliente_idToclientes?.id ?? null,
    proprietarioNome: t.clientes_transacoes_cliente_idToclientes?.nome ?? null,
    interessadoId: t.clientes_transacoes_cliente_contraparte_idToclientes?.id ?? null,
    interessadoNome: t.clientes_transacoes_cliente_contraparte_idToclientes?.nome ?? null,
    corretorProprietarioId: t.parceiros_transacoes_corretor_proprietario_idToparceiros?.id ?? null,
    corretorProprietarioNome: t.parceiros_transacoes_corretor_proprietario_idToparceiros?.nome ?? null,
    corretorContraparteId: t.parceiros_transacoes_corretor_contraparte_idToparceiros?.id ?? null,
    corretorContraparteNome: t.parceiros_transacoes_corretor_contraparte_idToparceiros?.nome ?? null
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
        transacoes={transacoesOpcoes}
        action={criarMovimentacaoAction}
      />
    </div>
  );
}
