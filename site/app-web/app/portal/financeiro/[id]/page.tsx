import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { formatMoeda, formatDataCalendario, formatDataHora, situacaoVencimento } from "@/lib/format";
import { saldoDevido } from "@/lib/financeiro/pagamentos-pix";
import { gerarPixCopiaECola } from "@/lib/pix";
import { PixQrcode } from "@/components/pix-qrcode";
import { PortalGerarPixParcial } from "@/components/portal-gerar-pix-parcial";
import { cancelarPagamentoParcialAction } from "../actions";

export const dynamic = "force-dynamic";

const DIAS_ALERTA = 15;

// Página de detalhe de UMA dívida do corretor (Fase 8b, 14/08/2026) —
// pedido do usuário: "é melhor abrir página da dívida, essa pode ser igual a
// do administrativo, e lá gerar a opção de pix, porque quando vai na página
// do financeiro no corretor ocupa muito espaço e o QR Code só some depois
// que confirma, imagina quando tiver um monte de despesa". Antes isso tudo
// ficava empilhado direto na lista (/portal/financeiro); agora a lista só
// mostra o resumo (saldo + vencimento) e cada linha abre aqui — mesma ideia
// da página de detalhe do admin (app/financeiro/[id]/page.tsx).
export default async function PortalDividaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortalSession();
  const { id } = await params;

  const movimentacao = await prisma.movimentacoes.findUnique({
    where: { id },
    include: {
      categorias_financeiras: { select: { nome: true } },
      pagamentos_pix: { orderBy: { criado_em: "asc" } }
    }
  });

  // Confere que a dívida é mesmo dele — não deixa abrir pelo id de outro
  // corretor só trocando o número na URL.
  if (!movimentacao || movimentacao.parceiro_id !== session.parceiroId || movimentacao.tipo !== "Recebimento") {
    notFound();
  }

  const parciais = movimentacao.pagamentos_pix.map((p) => ({ valor: Number(p.valor), pago: p.pago }));
  const saldo = saldoDevido(Number(movimentacao.valor), parciais);
  const pendentesNaoConfirmados = movimentacao.pagamentos_pix
    .filter((p) => !p.pago)
    .reduce((soma, p) => soma + Number(p.valor), 0);
  const tetoDisponivel = Math.max(0, Math.round((saldo - pendentesNaoConfirmados) * 100) / 100);
  const situacao = situacaoVencimento(movimentacao.vencimento, movimentacao.pago, DIAS_ALERTA);

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/portal/financeiro" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar para Financeiro
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <div className="text-sm font-bold text-gray-800">
                {movimentacao.categorias_financeiras.nome}
                {movimentacao.descricao && <span className="text-gray-400 font-normal"> — {movimentacao.descricao}</span>}
              </div>
              <div className="text-[11px] text-gray-400">Vence em {formatDataCalendario(movimentacao.vencimento)}</div>
            </div>
            {situacao && !movimentacao.pago && (
              <span
                className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border ${
                  situacao === "vencido"
                    ? "bg-red-50 text-red-600 border-red-200"
                    : situacao === "alerta"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-gray-50 text-gray-500 border-gray-200"
                }`}
              >
                {situacao === "vencido" ? "Vencido" : situacao === "alerta" ? "Vence em breve" : "Em dia"}
              </span>
            )}
            {movimentacao.pago && (
              <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border bg-green-50 text-green-700 border-green-200">
                Quitado
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 text-sm mt-3">
            <span className="text-gray-500">Valor total: {formatMoeda(movimentacao.valor)}</span>
            <span className="font-bold text-red-600">Saldo devedor: {formatMoeda(saldo)}</span>
          </div>
        </div>

        {movimentacao.pagamentos_pix.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <div className="text-sm font-bold text-gray-800 mb-3">Pix já gerados</div>
            <div className="flex flex-col gap-2">
              {movimentacao.pagamentos_pix.map((p) => (
                <div key={p.id} className="border border-gray-100 rounded-lg p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-800">{formatMoeda(p.valor)}</span>
                    <span
                      className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border ${
                        p.pago
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {p.pago ? "Confirmado" : "Aguardando confirmação"}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Gerado em {formatDataHora(p.criado_em)}
                    {p.pago && p.confirmado_em && <> · Confirmado em {formatDataHora(p.confirmado_em)}</>}
                  </div>

                  {!p.pago && (
                    <>
                      <div className="mt-2">
                        <PixQrcode valor={Number(p.valor)} codigo={gerarPixCopiaECola({ valor: Number(p.valor), descricao: "Fee" })} />
                      </div>
                      <form action={cancelarPagamentoParcialAction} className="mt-2">
                        <input type="hidden" name="pagamentoPixId" value={p.id} />
                        <button type="submit" className="text-[11px] text-gray-400 hover:text-red-600 underline">
                          Cancelar este Pix
                        </button>
                      </form>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tetoDisponivel > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800 mb-1">Gerar novo Pix</div>
            <p className="text-[11px] text-gray-400 mb-2">
              Pague aos poucos: gere um Pix de parte do saldo agora e o resto depois, dentro do prazo.
            </p>
            <PortalGerarPixParcial movimentacaoId={movimentacao.id} tetoDisponivel={tetoDisponivel} />
          </div>
        )}
      </div>
    </div>
  );
}
