import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { formatMoeda, formatDataCalendario, situacaoVencimento } from "@/lib/format";
import { saldoDevido } from "@/lib/financeiro/pagamentos-pix";
import { gerarPixCopiaECola } from "@/lib/pix";
import { PixQrcode } from "@/components/pix-qrcode";
import { PortalGerarPixParcial } from "@/components/portal-gerar-pix-parcial";
import { cancelarPagamentoParcialAction } from "@/app/portal/financeiro/actions";

export const dynamic = "force-dynamic";

// Janela de alerta de vencimento — mesma usada em /financiamento (admin).
const DIAS_ALERTA = 15;

function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-bold text-gray-800">{titulo}</div>
      {sub && <p className="text-[11px] text-gray-400 mb-3">{sub}</p>}
      {children}
    </div>
  );
}

function Badge({ situacao }: { situacao: "vencido" | "alerta" | "normal" | null }) {
  if (!situacao) return null;
  const estilos: Record<string, string> = {
    vencido: "bg-red-50 text-red-600 border-red-200",
    alerta: "bg-amber-50 text-amber-700 border-amber-200",
    normal: "bg-gray-50 text-gray-500 border-gray-200"
  };
  const rotulos: Record<string, string> = { vencido: "Vencido", alerta: "Vence em breve", normal: "Em dia" };
  return (
    <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border ${estilos[situacao]}`}>
      {rotulos[situacao]}
    </span>
  );
}

// Financeiro do corretor no Portal (Fase 8, 14/08/2026) — pedido do usuário:
// "ele vai ter agora no menu a opção financeiro. Por lá ele vai saber o que
// recebeu, o que vai receber e o que vai pagar". Três seções:
//
// "A pagar" — todo Recebimento vinculado a ele (qualquer categoria, ex.: Fee
// Corretor Remax) ainda em aberto. Não é um lançamento novo/duplicado: é a
// MESMA linha de movimentacoes que o admin vê em /financeiro, só que do lado
// dele — com a opção de gerar Pix por pedaço (parcial) contra o saldo
// devedor, igual ele pediu ("dia 01 gera 50, dia 10 gera mais 50").
//
// "Recebido" e "A receber" — repasse de honorário (comissão) que a
// imobiliária deve/já pagou a ele, vindo do rateio (gerarRateioAction em
// app/financeiro/actions.ts). Mesma fonte de dados corrigida no Painel (ver
// app/portal/page.tsx) — movimentacoes.pago na Despesa de repasse, mais
// "pago direto" (vendedor pagou o corretor por fora, sem gerar Despesa).
export default async function PortalFinanceiroPage() {
  const session = await requirePortalSession();
  const pid = session.parceiroId;

  const [aPagar, despesasPagas, despesasPendentes, pagosDireto] = await Promise.all([
    prisma.movimentacoes.findMany({
      where: { tipo: "Recebimento", parceiro_id: pid, pago: false },
      include: { categorias_financeiras: { select: { nome: true } }, pagamentos_pix: { orderBy: { criado_em: "desc" } } },
      orderBy: { vencimento: "asc" }
    }),
    prisma.movimentacoes.findMany({
      where: { tipo: "Despesa", parceiro_id: pid, pagamento_id: { not: null }, pago: true },
      include: { categorias_financeiras: { select: { nome: true } } },
      orderBy: { data_pagamento: "desc" },
      take: 30
    }),
    prisma.movimentacoes.findMany({
      where: { tipo: "Despesa", parceiro_id: pid, pagamento_id: { not: null }, pago: false },
      include: { categorias_financeiras: { select: { nome: true } } },
      orderBy: { vencimento: "asc" }
    }),
    prisma.pagamentos.findMany({
      where: { parceiro_id: pid, pago_direto: true },
      orderBy: { created_at: "desc" },
      take: 30
    })
  ]);

  const totalRecebidoDespesas = despesasPagas.reduce((soma, m) => soma + Number(m.valor), 0);
  const totalRecebidoDireto = pagosDireto.reduce((soma, p) => soma + Number(p.valor_parceiro ?? 0), 0);
  const totalRecebido = totalRecebidoDespesas + totalRecebidoDireto;
  const totalAReceber = despesasPendentes.reduce((soma, m) => soma + Number(m.valor), 0);
  const totalAPagar = aPagar.reduce((soma, m) => {
    const parciais = m.pagamentos_pix.map((p) => ({ valor: Number(p.valor), pago: p.pago }));
    return soma + saldoDevido(Number(m.valor), parciais);
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="text-lg font-bold text-gray-900 mb-1">Financeiro</div>
        <p className="text-xs text-gray-500 mb-6">
          O que você recebeu, o que vai receber (previsão de comissão) e o que você precisa pagar (ex.: Fee Corretor
          Remax). Pagamentos são conferidos manualmente pelo administrativo depois de gerado o Pix.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-red-50 border border-red-100 rounded-lg p-3">
            <div className="text-[11px] text-red-600">Você deve</div>
            <div className="text-base font-bold text-red-700">{formatMoeda(totalAPagar)}</div>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-lg p-3">
            <div className="text-[11px] text-green-700">Recebido</div>
            <div className="text-base font-bold text-green-700">{formatMoeda(totalRecebido)}</div>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
            <div className="text-[11px] text-amber-700">A receber (previsão)</div>
            <div className="text-base font-bold text-amber-700">{formatMoeda(totalAReceber)}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Secao titulo="A pagar" sub="Toda dívida vinculada a você — pague aos poucos gerando um Pix por vez.">
            {aPagar.length === 0 && <p className="text-xs text-gray-400">Nenhuma dívida em aberto no momento.</p>}
            <div className="flex flex-col gap-3">
              {aPagar.map((m) => {
                const parciais = m.pagamentos_pix.map((p) => ({ valor: Number(p.valor), pago: p.pago }));
                const saldo = saldoDevido(Number(m.valor), parciais);
                const pendentesNaoConfirmados = m.pagamentos_pix
                  .filter((p) => !p.pago)
                  .reduce((soma, p) => soma + Number(p.valor), 0);
                const tetoDisponivel = Math.max(0, Math.round((saldo - pendentesNaoConfirmados) * 100) / 100);
                const situacao = situacaoVencimento(m.vencimento, false, DIAS_ALERTA);

                return (
                  <div key={m.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <div className="text-xs font-semibold text-gray-800">
                          {m.categorias_financeiras.nome}
                          {m.descricao && <span className="text-gray-400 font-normal"> — {m.descricao}</span>}
                        </div>
                        <div className="text-[11px] text-gray-400">Vence em {formatDataCalendario(m.vencimento)}</div>
                      </div>
                      <Badge situacao={situacao} />
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs mt-2 mb-1">
                      <span className="text-gray-500">Total: {formatMoeda(m.valor)}</span>
                      <span className="font-bold text-red-600">Saldo devedor: {formatMoeda(saldo)}</span>
                    </div>

                    {m.pagamentos_pix.length > 0 && (
                      <div className="flex flex-col gap-1.5 mt-2 mb-2">
                        {m.pagamentos_pix.map((p) => (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between gap-2 text-[11px] rounded-lg px-2 py-1.5 border ${
                              p.pago ? "bg-green-50 border-green-100 text-green-700" : "bg-amber-50 border-amber-100 text-amber-700"
                            }`}
                          >
                            <span>
                              {formatMoeda(p.valor)} — {p.pago ? `confirmado em ${formatDataCalendario(p.confirmado_em)}` : "aguardando confirmação"}
                            </span>
                            {!p.pago && (
                              <form action={cancelarPagamentoParcialAction}>
                                <input type="hidden" name="pagamentoPixId" value={p.id} />
                                <button type="submit" className="text-[10px] text-gray-400 hover:text-red-600 underline">
                                  cancelar
                                </button>
                              </form>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {m.pagamentos_pix
                      .filter((p) => !p.pago)
                      .map((p) => (
                        <div key={`qr-${p.id}`} className="mt-2">
                          <PixQrcode valor={Number(p.valor)} codigo={gerarPixCopiaECola({ valor: Number(p.valor), descricao: "Fee" })} />
                        </div>
                      ))}

                    {tetoDisponivel > 0 && <PortalGerarPixParcial movimentacaoId={m.id} tetoDisponivel={tetoDisponivel} />}
                  </div>
                );
              })}
            </div>
          </Secao>

          <Secao titulo="Recebido" sub="Repasse de comissão já confirmado (via rateio ou pago direto pelo vendedor).">
            {despesasPagas.length === 0 && pagosDireto.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum repasse recebido ainda.</p>
            )}
            <div className="flex flex-col gap-2">
              {despesasPagas.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 pb-2">
                  <span className="text-gray-600">{m.descricao ?? m.categorias_financeiras.nome}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">{formatDataCalendario(m.data_pagamento)}</span>
                    <span className="font-semibold text-green-700">{formatMoeda(m.valor)}</span>
                  </span>
                </div>
              ))}
              {pagosDireto.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 pb-2">
                  <span className="text-gray-600">{p.parte ?? "Repasse"} — pago direto pelo vendedor</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">{formatDataCalendario(p.created_at)}</span>
                    <span className="font-semibold text-green-700">{formatMoeda(p.valor_parceiro)}</span>
                  </span>
                </div>
              ))}
            </div>
          </Secao>

          <Secao titulo="A receber" sub="Comissão prevista, ainda não confirmada — previsão de valores a receber.">
            {despesasPendentes.length === 0 && <p className="text-xs text-gray-400">Nada previsto no momento.</p>}
            <div className="flex flex-col gap-2">
              {despesasPendentes.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 pb-2">
                  <span className="text-gray-600">{m.descricao ?? m.categorias_financeiras.nome}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">Previsto {formatDataCalendario(m.vencimento)}</span>
                    <span className="font-semibold text-amber-700">{formatMoeda(m.valor)}</span>
                  </span>
                </div>
              ))}
            </div>
          </Secao>
        </div>
      </div>
    </div>
  );
}
