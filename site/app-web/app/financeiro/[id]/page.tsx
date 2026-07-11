import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { MovimentacaoDetalhe } from "@/components/movimentacao-detalhe";
import { RateioForm } from "@/components/rateio-form";
import { formatMoeda, formatPercentual, formatDataCalendario } from "@/lib/format";
import { atualizarMovimentacaoAction, gerarRateioAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MovimentacaoPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;

  const movimentacao = await prisma.movimentacoes.findUnique({
    where: { id },
    include: {
      parceiros: {
        select: {
          nome: true,
          cpf: true,
          agencia: true,
          conta: true,
          tipo_conta: true,
          codigo_banco: true,
          pix: true,
          tipo_pix: true,
          bancos: { select: { nome: true } }
        }
      },
      categorias_financeiras: { select: { nome: true } },
      clientes_interessado: { select: { nome: true } },
      clientes_proprietario: {
        select: {
          nome: true,
          cpf: true,
          cnpj: true,
          agencia: true,
          conta: true,
          tipo_conta: true,
          codigo_banco: true,
          pix: true,
          tipo_pix: true,
          bancos: { select: { nome: true } }
        }
      }
    }
  });
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

  const recebimentoOrigem =
    movimentacao.tipo === "Despesa" && movimentacao.transacao_id
      ? await prisma.movimentacoes.findFirst({
          where: { tipo: "Recebimento", transacao_id: movimentacao.transacao_id },
          select: { id: true, valor: true, pago: true, categorias_financeiras: { select: { nome: true } } }
        })
      : null;

  const destinatarioRepasse =
    movimentacao.tipo === "Despesa" && movimentacao.parceiro_id && movimentacao.parceiros
      ? {
          tipoParte: "Parceiro" as const,
          nome: movimentacao.parceiros.nome,
          documento: movimentacao.parceiros.cpf,
          banco: movimentacao.parceiros.bancos?.nome ?? null,
          codigo_banco: movimentacao.parceiros.codigo_banco,
          agencia: movimentacao.parceiros.agencia,
          conta: movimentacao.parceiros.conta,
          tipo_conta: movimentacao.parceiros.tipo_conta,
          pix: movimentacao.parceiros.pix,
          tipo_pix: movimentacao.parceiros.tipo_pix
        }
      : movimentacao.tipo === "Despesa" && movimentacao.cliente_proprietario_id && movimentacao.clientes_proprietario
        ? {
            tipoParte: "Proprietário" as const,
            nome: movimentacao.clientes_proprietario.nome,
            documento: movimentacao.clientes_proprietario.cpf ?? movimentacao.clientes_proprietario.cnpj,
            banco: movimentacao.clientes_proprietario.bancos?.nome ?? null,
            codigo_banco: movimentacao.clientes_proprietario.codigo_banco,
            agencia: movimentacao.clientes_proprietario.agencia,
            conta: movimentacao.clientes_proprietario.conta,
            tipo_conta: movimentacao.clientes_proprietario.tipo_conta,
            pix: movimentacao.clientes_proprietario.pix,
            tipo_pix: movimentacao.clientes_proprietario.tipo_pix
          }
        : null;

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

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Movimentação salva com sucesso.
        </div>
      )}

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
                <div className="text-xs text-gray-800">{formatDataCalendario(transacaoVinculada.data_assinatura)}</div>
              </div>
            </div>
          </div>
        )}

        {destinatarioRepasse && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="text-sm font-bold text-gray-800">Recibo de repasse — {destinatarioRepasse.nome}</div>
                <div className="text-[11px] text-gray-400">{destinatarioRepasse.tipoParte}</div>
              </div>
              <span className="text-sm font-bold text-gray-800">{formatMoeda(movimentacao.valor)}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4 md:gap-4">
              <div>
                <div className="text-[11px] text-gray-400">CPF/CNPJ</div>
                <div className="text-xs text-gray-800">{destinatarioRepasse.documento ?? "—"}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">Banco</div>
                <div className="text-xs text-gray-800">
                  {destinatarioRepasse.banco ?? "—"}
                  {destinatarioRepasse.codigo_banco ? ` (${destinatarioRepasse.codigo_banco})` : ""}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">Agência / Conta</div>
                <div className="text-xs text-gray-800">
                  {destinatarioRepasse.agencia ?? "—"} / {destinatarioRepasse.conta ?? "—"}
                  {destinatarioRepasse.tipo_conta ? ` (${destinatarioRepasse.tipo_conta})` : ""}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">Pix</div>
                <div className="text-xs text-gray-800">
                  {destinatarioRepasse.pix
                    ? `${destinatarioRepasse.pix}${destinatarioRepasse.tipo_pix ? ` (${destinatarioRepasse.tipo_pix})` : ""}`
                    : "—"}
                </div>
              </div>
            </div>
            {!destinatarioRepasse.pix && !destinatarioRepasse.conta && (
              <p className="text-[11px] text-amber-600 mt-2">
                {destinatarioRepasse.tipoParte === "Parceiro"
                  ? "Este parceiro ainda não tem dados bancários cadastrados. Complete o cadastro dele antes de repassar."
                  : "Este cliente ainda não tem dados bancários cadastrados. Complete o cadastro dele antes de repassar."}
              </p>
            )}
            {recebimentoOrigem && (
              <Link
                href={`/financeiro/${recebimentoOrigem.id}`}
                className="mt-3 flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50"
              >
                <span className="text-[11px] text-gray-500">
                  Abatido do recebimento: {recebimentoOrigem.categorias_financeiras.nome} —{" "}
                  {formatMoeda(recebimentoOrigem.valor)}
                </span>
                <span className={`text-[11px] font-medium ${recebimentoOrigem.pago ? "text-green-700" : "text-gray-500"}`}>
                  {recebimentoOrigem.pago ? "Recebido" : "Ainda não recebido"} →
                </span>
              </Link>
            )}
          </div>
        )}

        <MovimentacaoDetalhe
          key={movimentacao.updated_at.toISOString()}
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
