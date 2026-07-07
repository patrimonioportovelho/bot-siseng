import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { FinanceiroEditarForm } from "@/components/financeiro-editar-form";
import { RateioForm } from "@/components/rateio-form";
import { formatMoeda, formatPercentual } from "@/lib/format";
import { atualizarMovimentacaoAction, gerarRateioAction } from "../actions";

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

  // Rateio de honorários só faz sentido num Recebimento vinculado a uma
  // transação (Locação ou Compra e Venda) — é o dinheiro que entrou e
  // precisa ser repartido entre corretores/parceiros.
  const transacao =
    movimentacao.tipo === "Recebimento" && movimentacao.transacao_id
      ? await prisma.transacoes.findUnique({
          where: { id: movimentacao.transacao_id },
          select: {
            id: true,
            id_legado: true,
            valor_transacao: true,
            porc_honorario: true,
            tem_parceria: true,
            porc_parceria: true,
            porc_corretor_proprietario: true,
            porc_corretor_contraparte: true,
            parceiros_transacoes_parceiro_externo_idToparceiros: { select: { id: true, nome: true } },
            parceiros_transacoes_corretor_proprietario_idToparceiros: { select: { id: true, nome: true } },
            parceiros_transacoes_corretor_contraparte_idToparceiros: { select: { id: true, nome: true } }
          }
        })
      : null;

  const pagamentosExistentes = transacao
    ? await prisma.pagamentos.findMany({
        where: { transacao_id: transacao.id },
        orderBy: { created_at: "asc" },
        include: {
          parceiros: { select: { nome: true } },
          movimentacoes: { select: { id: true, pago: true } }
        }
      })
    : [];

  return (
    <div>
      <Topbar />

      <Link href="/financeiro" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Financeiro
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Movimentação</div>

      <div className="flex flex-col gap-5">
        <FinanceiroEditarForm
          movimentacao={movimentacao}
          categorias={categorias}
          clientes={clientes}
          parceiros={parceiros}
          action={atualizarMovimentacaoAction}
        />

        {transacao && pagamentosExistentes.length === 0 && (
          <RateioForm
            transacao={{
              id: transacao.id,
              id_legado: transacao.id_legado,
              valor_transacao: transacao.valor_transacao,
              porc_honorario: transacao.porc_honorario,
              tem_parceria: transacao.tem_parceria,
              porc_parceria: transacao.porc_parceria,
              porc_corretor_proprietario: transacao.porc_corretor_proprietario,
              porc_corretor_contraparte: transacao.porc_corretor_contraparte,
              parceiro_externo: transacao.parceiros_transacoes_parceiro_externo_idToparceiros,
              corretor_proprietario: transacao.parceiros_transacoes_corretor_proprietario_idToparceiros,
              corretor_contraparte: transacao.parceiros_transacoes_corretor_contraparte_idToparceiros
            }}
            recebimentoId={movimentacao.id}
            vencimentoSugerido={movimentacao.data_pagamento ?? movimentacao.vencimento}
            action={gerarRateioAction}
          />
        )}

        {pagamentosExistentes.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800 mb-3">Rateio já gerado</div>
            <div className="flex flex-col gap-2">
              {pagamentosExistentes.map((p) => {
                const despesa = p.movimentacoes[0];
                return (
                  <Link
                    key={p.id}
                    href={despesa ? `/financeiro/${despesa.id}` : "#"}
                    className="grid grid-cols-1 gap-1 md:grid-cols-[1fr_1fr_90px_100px_100px_90px] md:gap-3 md:items-center border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50"
                  >
                    <span className="text-xs font-medium text-gray-800">{p.parte}</span>
                    <span className="text-xs text-gray-600 truncate">{p.parceiros.nome}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{formatPercentual(p.porcentagem)}%</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {p.desconto ? `− ${formatMoeda(p.desconto)}` : "—"}
                    </span>
                    <span className="text-xs font-semibold text-gray-800 whitespace-nowrap">
                      {formatMoeda(p.valor_parceiro)}
                    </span>
                    <span
                      className={`text-xs font-medium whitespace-nowrap ${despesa?.pago ? "text-green-700" : "text-gray-500"}`}
                    >
                      {despesa?.pago ? "Pago" : "Pendente"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
