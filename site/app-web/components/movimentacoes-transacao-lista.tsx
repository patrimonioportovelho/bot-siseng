import Link from "next/link";
import { formatMoeda, formatDataCalendario, situacaoVencimento } from "@/lib/format";

// Janela de alerta pro destaque amarelo das pendências — mesma janela usada
// na tela geral do Financeiro (app/financeiro/page.tsx), pra manter a régua
// de cor consistente entre as duas telas.
const DIAS_ALERTA = 15;

export type MovimentacaoTransacao = {
  id: string;
  tipo: string;
  valor: unknown;
  vencimento: Date | string | null;
  pago: boolean;
  data_pagamento: Date | string | null;
  forma_pagamento: string | null;
  parcelas: number | null;
  num_parcela: number | null;
  descricao: string | null;
  categorias_financeiras: { nome: string } | null;
  parceiros: { nome: string } | null;
};

// Relatório compacto das movimentações (Recebimentos e Despesas) ligadas a
// uma transação — pedido do usuário: "colocar os relatórios das
// movimentações ligados a transação, para um acompanhamento mais rápido",
// pra Locação e Compra e Venda. Fica no rodapé da tela de detalhe da
// transação (app/transacoes/[id]/page.tsx), com link pra cada lançamento
// abrir direto no Financeiro.
export function MovimentacoesTransacaoLista({ movimentacoes }: { movimentacoes: MovimentacaoTransacao[] }) {
  const recebimentos = movimentacoes.filter((m) => m.tipo === "Recebimento");
  const despesas = movimentacoes.filter((m) => m.tipo === "Despesa");

  const totalRecebido = recebimentos.filter((m) => m.pago).reduce((acc, m) => acc + Number(m.valor ?? 0), 0);
  const totalAReceber = recebimentos.filter((m) => !m.pago).reduce((acc, m) => acc + Number(m.valor ?? 0), 0);
  const totalPago = despesas.filter((m) => m.pago).reduce((acc, m) => acc + Number(m.valor ?? 0), 0);
  const totalAPagar = despesas.filter((m) => !m.pago).reduce((acc, m) => acc + Number(m.valor ?? 0), 0);
  const vencidos = movimentacoes.filter((m) => situacaoVencimento(m.vencimento, m.pago, DIAS_ALERTA) === "vencido").length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mt-5">
      <div className="text-sm font-bold text-gray-800 mb-1">Movimentações financeiras</div>
      <p className="text-[11px] text-gray-400 mb-3">
        Recebimentos e despesas lançados no Financeiro e ligados a esta transação.
      </p>

      {movimentacoes.length === 0 ? (
        <p className="text-xs text-gray-400 py-3">Nenhuma movimentação lançada pra esta transação ainda.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              <div className="text-[10px] text-green-600">Recebido</div>
              <div className="text-sm font-bold text-green-700">{formatMoeda(totalRecebido)}</div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <div className="text-[10px] text-amber-600">A receber</div>
              <div className="text-sm font-bold text-amber-700">{formatMoeda(totalAReceber)}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="text-[10px] text-gray-500">Pago</div>
              <div className="text-sm font-bold text-gray-700">{formatMoeda(totalPago)}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="text-[10px] text-gray-500">A pagar</div>
              <div className="text-sm font-bold text-gray-700">{formatMoeda(totalAPagar)}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 border ${vencidos > 0 ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
              <div className={`text-[10px] ${vencidos > 0 ? "text-red-600" : "text-gray-500"}`}>Vencidos</div>
              <div className={`text-sm font-bold ${vencidos > 0 ? "text-red-700" : "text-gray-700"}`}>{vencidos}</div>
            </div>
          </div>

          <div className="hidden md:grid md:grid-cols-[90px_1.3fr_100px_90px_100px_100px_1.1fr] gap-3 px-3 py-1 text-[11px] text-gray-400 border-b border-gray-100">
            <span>Tipo</span>
            <span>Categoria</span>
            <span className="text-right">Valor</span>
            <span>Vencimento</span>
            <span>Pagamento</span>
            <span>Situação</span>
            <span>Descrição</span>
          </div>

          <div className="flex flex-col">
            {movimentacoes.map((m) => {
              const situacao = situacaoVencimento(m.vencimento, m.pago, DIAS_ALERTA);
              const corLinha =
                situacao === "vencido"
                  ? "bg-red-50/60 hover:bg-red-50"
                  : situacao === "alerta"
                    ? "bg-amber-50/60 hover:bg-amber-50"
                    : "hover:bg-gray-50";
              const temParcelas = (m.parcelas ?? 0) > 1;
              const rotuloSituacao = m.pago
                ? m.tipo === "Despesa"
                  ? "Pago"
                  : "Recebido"
                : situacao === "vencido"
                  ? "Vencido"
                  : m.tipo === "Despesa"
                    ? "A pagar"
                    : "A receber";
              const corSituacao = m.pago
                ? "text-green-700"
                : situacao === "vencido"
                  ? "text-red-700"
                  : situacao === "alerta"
                    ? "text-amber-700"
                    : "text-gray-500";

              return (
                <Link
                  key={m.id}
                  href={`/financeiro/${m.id}`}
                  className={`grid grid-cols-1 gap-1 md:grid-cols-[90px_1.3fr_100px_90px_100px_100px_1.1fr] md:gap-3 md:items-center px-3 py-2.5 rounded-lg transition-colors ${corLinha}`}
                >
                  <span className={`text-xs font-medium ${m.tipo === "Despesa" ? "text-red-600" : "text-green-700"}`}>
                    {m.tipo}
                  </span>
                  <span className="text-xs text-gray-700 truncate">
                    {m.categorias_financeiras?.nome ?? "—"}
                    {m.parceiros?.nome && <span className="text-gray-400"> · {m.parceiros.nome}</span>}
                  </span>
                  <span className="text-xs text-gray-800 text-right whitespace-nowrap font-medium">
                    {formatMoeda(m.valor)}
                    {temParcelas && <span className="text-gray-400 font-normal"> ({m.num_parcela}/{m.parcelas})</span>}
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{formatDataCalendario(m.vencimento)}</span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {m.data_pagamento ? formatDataCalendario(m.data_pagamento) : "—"}
                  </span>
                  <span className={`text-xs font-medium whitespace-nowrap ${corSituacao}`}>{rotuloSituacao}</span>
                  <span className="text-xs text-gray-500 truncate">{m.descricao ?? "—"}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
