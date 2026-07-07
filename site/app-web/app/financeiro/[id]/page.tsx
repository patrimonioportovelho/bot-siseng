import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { FinanceiroEditarForm } from "@/components/financeiro-editar-form";
import { RateioForm } from "@/components/rateio-form";
import { formatMoeda, formatPercentual, formatData } from "@/lib/format";
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

  // Busca a transação vinculada (se houver) independente do tipo — tanto
  // Recebimento quanto Despesa podem estar ligados a uma transação (ex.:
  // repasse de honorário é Despesa com transacao_id preenchido). Isso é o
  // que faltava aparecer no detalhe: antes só mostrava Categoria/Valor/
  // Vencimento e não dava pra saber de qual contrato aquilo veio.
  const transacaoVinculada = movimentacao.transacao_id
    ? await prisma.transacoes.findUnique({
        where: { id: movimentacao.transacao_id },
        select: {
          id: true,
          id_legado: true,
          tipo: true,
          valor_transacao: true,
          data_assinatura: true,
          status: true,
          porc_honorario: true,
          tem_parceria: true,
          porc_parceria: true,
          porc_corretor_proprietario: true,
          porc_corretor_contraparte: true,
          imoveis: { select: { endereco: true } },
          clientes_transacoes_cliente_idToclientes: { select: { nome: true } },
          clientes_transacoes_cliente_contraparte_idToclientes: { select: { nome: true } },
          parceiros_transacoes_parceiro_externo_idToparceiros: { select: { id: true, nome: true } },
          parceiros_transacoes_corretor_proprietario_idToparceiros: { select: { id: true, nome: true } },
          parceiros_transacoes_corretor_contraparte_idToparceiros: { select: { id: true, nome: true } }
        }
      })
    : null;

  // Rateio de honorários só faz sentido num Recebimento vinculado a uma
  // transação — é o dinheiro que entrou e precisa ser repartido entre
  // corretores/parceiros.
  const pagamentosExistentes =
    movimentacao.tipo === "Recebimento" && transacaoVinculada
      ? await prisma.pagamentos.findMany({
          where: { transacao_id: transacaoVinculada.id },
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
        {transacaoVinculada && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="text-sm font-bold text-gray-800">Transação vinculada</div>
              <Link
                href={`/transacoes/${transacaoVinculada.id}`}
                className="text-xs text-primary font-semibold hover:underline"
              >
                Abrir transação →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-1 md:grid-cols-3 md:gap-4">
              <div>
                <div className="text-[11px] text-gray-400">Id / Tipo</div>
                <div className="text-xs text-gray-800 font-medium">
                  {transacaoVinculada.id_legado ?? transacaoVinculada.id} — {transacaoVinculada.tipo}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">Imóvel</div>
                <div className="text-xs text-gray-800">{transacaoVinculada.imoveis?.endereco ?? "—"}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">Status da transação</div>
                <div className="text-xs text-gray-800">{transacaoVinculada.status ?? "—"}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">Cliente (proprietário)</div>
                <div className="text-xs text-gray-800">
                  {transacaoVinculada.clientes_transacoes_cliente_idToclientes?.nome ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">Cliente (interessado)</div>
                <div className="text-xs text-gray-800">
                  {transacaoVinculada.clientes_transacoes_cliente_contraparte_idToclientes?.nome ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">Valor da transação</div>
                <div className="text-xs text-gray-800">{formatMoeda(transacaoVinculada.valor_transacao)}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">Data de assinatura</div>
                <div className="text-xs text-gray-800">{formatData(transacaoVinculada.data_assinatura)}</div>
              </div>
            </div>
          </div>
        )}

        <FinanceiroEditarForm
          movimentacao={movimentacao}
          categorias={categorias}
          clientes={clientes}
          parceiros={parceiros}
          action={atualizarMovimentacaoAction}
        />

        {movimentacao.tipo === "Recebimento" && transacaoVinculada && pagamentosExistentes.length === 0 && (
          <RateioForm
            transacao={{
              id: transacaoVinculada.id,
              id_legado: transacaoVinculada.id_legado,
              valor_transacao: transacaoVinculada.valor_transacao,
              porc_honorario: transacaoVinculada.porc_honorario,
              tem_parceria: transacaoVinculada.tem_parceria,
              porc_parceria: transacaoVinculada.porc_parceria,
              porc_corretor_proprietario: transacaoVinculada.porc_corretor_proprietario,
              porc_corretor_contraparte: transacaoVinculada.porc_corretor_contraparte,
              parceiro_externo: transacaoVinculada.parceiros_transacoes_parceiro_externo_idToparceiros,
              corretor_proprietario: transacaoVinculada.parceiros_transacoes_corretor_proprietario_idToparceiros,
              corretor_contraparte: transacaoVinculada.parceiros_transacoes_corretor_contraparte_idToparceiros
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
