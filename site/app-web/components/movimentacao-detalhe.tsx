"use client";

import { useState } from "react";
import { FinanceiroEditarForm } from "@/components/financeiro-editar-form";
import { BotaoComConfirmacao } from "@/components/botao-com-confirmacao";
import { formatMoeda, formatDataCalendario, formatDataHora } from "@/lib/format";
import { rotuloStatusPagamento, corSeloStatusPagamento } from "@/lib/financeiro/status-pagamento";

type CategoriaOpcao = { id: string; nome: string; tipo: string | null };
type ClienteOpcao = { id: string; nome: string };
type ParceiroOpcao = { id: string; nome: string };

type MovimentacaoParaVisualizar = {
  id: string;
  tipo: string;
  categoria_id: string;
  cliente_interessado_id: string | null;
  cliente_proprietario_id: string | null;
  parceiro_id: string | null;
  contraparte_nome: string | null;
  descricao: string | null;
  comprovante_url: string | null;
  valor: unknown;
  vencimento: Date | string;
  pago: boolean;
  status_pagamento: string;
  conferido_em: Date | string | null;
  data_pagamento: Date | string | null;
  parcelas: number | null;
  num_parcela: number | null;
  forma_pagamento: string | null;
  gerado_automaticamente: boolean;
  categorias_financeiras: { nome: string };
  clientes_interessado: { nome: string } | null;
  clientes_proprietario: { nome: string } | null;
  parceiros: { nome: string } | null;
};

// Uma linha da ficha compacta: rótulo em cima (cor da marca), valor embaixo —
// mesmo espírito das fichas do AppSheet que o usuário pediu pra manter (só
// que com a paleta do SisEng em vez da roxa do AppSheet).
function Linha({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0">
      <div className="text-[11px] font-medium text-primary/80">{label}</div>
      <div className="text-sm text-gray-800 mt-0.5">{valor}</div>
    </div>
  );
}

export function MovimentacaoDetalhe({
  movimentacao,
  categorias,
  clientes,
  parceiros,
  action,
  excluirAction,
  atualizarStatusPagamentoAction,
  conferidoPorNome,
  pagoPorNome
}: {
  movimentacao: MovimentacaoParaVisualizar;
  categorias: CategoriaOpcao[];
  clientes: ClienteOpcao[];
  parceiros: ParceiroOpcao[];
  action: (prevState: unknown, formData: FormData) => Promise<{ erro: string } | undefined | void>;
  excluirAction: (formData: FormData) => void;
  atualizarStatusPagamentoAction: (formData: FormData) => void;
  conferidoPorNome: string | null;
  pagoPorNome: string | null;
}) {
  const [editando, setEditando] = useState(false);
  const m = movimentacao;

  if (editando) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-800">Editando movimentação</div>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="text-xs text-gray-500 hover:text-gray-800 underline"
          >
            Cancelar
          </button>
        </div>
        <FinanceiroEditarForm
          movimentacao={m}
          categorias={categorias}
          clientes={clientes}
          parceiros={parceiros}
          action={action}
        />
      </div>
    );
  }

  const rotuloPago = m.tipo === "Despesa" ? "pago" : "recebido";
  const temParcelas = (m.parcelas ?? 0) > 1;
  const status = m.status_pagamento;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-bold text-gray-800">{m.tipo}</div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold"
          >
            Editar
          </button>
          <form action={excluirAction}>
            <input type="hidden" name="movimentacaoId" value={m.id} />
            <BotaoComConfirmacao
              mensagem="Excluir esta movimentação de vez? Essa ação não pode ser desfeita."
              className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 font-semibold hover:bg-red-50"
            >
              Excluir
            </BotaoComConfirmacao>
          </form>
        </div>
      </div>

      <div className="flex flex-col">
        <Linha label="Categoria" valor={m.categorias_financeiras.nome} />
        {m.parceiros && <Linha label="Parceiro" valor={m.parceiros.nome} />}
        {m.clientes_interessado && <Linha label="Cliente (interessado)" valor={m.clientes_interessado.nome} />}
        {m.clientes_proprietario && <Linha label="Cliente (proprietário)" valor={m.clientes_proprietario.nome} />}
        {!m.clientes_interessado && !m.clientes_proprietario && !m.parceiros && m.contraparte_nome && (
          <Linha label="Contraparte (registro antigo)" valor={m.contraparte_nome} />
        )}
        <Linha label="Descrição" valor={m.descricao || "—"} />
        <Linha label="Forma de pagamento" valor={m.forma_pagamento || "—"} />
        {temParcelas && <Linha label="N° da parcela" valor={`${m.num_parcela} de ${m.parcelas}`} />}
        <Linha label="Vencimento" valor={formatDataCalendario(m.vencimento)} />
        <Linha label="Valor" valor={<span className="font-semibold">{formatMoeda(m.valor)}</span>} />
        <Linha
          label="Situação do pagamento"
          valor={
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[11px] font-bold rounded-full border px-2 py-0.5 ${corSeloStatusPagamento(status)}`}
                >
                  {rotuloStatusPagamento(status, m.tipo)}
                </span>

                {status === "Pendente" && (
                  <form action={atualizarStatusPagamentoAction}>
                    <input type="hidden" name="movimentacaoId" value={m.id} />
                    <input type="hidden" name="alvo" value="Conferido" />
                    <button
                      type="submit"
                      className="text-xs rounded-lg border border-blue-600 bg-blue-600 text-white px-2.5 py-1 font-semibold hover:opacity-90"
                    >
                      Conferir
                    </button>
                  </form>
                )}

                {status === "Conferido" && (
                  <>
                    <form action={atualizarStatusPagamentoAction}>
                      <input type="hidden" name="movimentacaoId" value={m.id} />
                      <input type="hidden" name="alvo" value="Pago" />
                      <button
                        type="submit"
                        className="text-xs rounded-lg border border-primary bg-primary text-white px-2.5 py-1 font-semibold hover:opacity-90"
                      >
                        Marcar como {rotuloPago}
                      </button>
                    </form>
                    <form action={atualizarStatusPagamentoAction}>
                      <input type="hidden" name="movimentacaoId" value={m.id} />
                      <input type="hidden" name="alvo" value="Pendente" />
                      <button
                        type="submit"
                        className="text-xs rounded-lg border border-gray-300 text-gray-600 px-2.5 py-1 font-semibold hover:bg-gray-50"
                      >
                        Desfazer conferência
                      </button>
                    </form>
                  </>
                )}

                {status === "Pago" && (
                  <form action={atualizarStatusPagamentoAction}>
                    <input type="hidden" name="movimentacaoId" value={m.id} />
                    <input type="hidden" name="alvo" value="Conferido" />
                    <button
                      type="submit"
                      className="text-xs rounded-lg border border-gray-300 text-gray-600 px-2.5 py-1 font-semibold hover:bg-gray-50"
                    >
                      Desfazer pagamento
                    </button>
                  </form>
                )}
              </div>

              {(status === "Conferido" || status === "Pago") && (
                <span className="text-[11px] text-gray-500">
                  {conferidoPorNome
                    ? `Conferido por ${conferidoPorNome}`
                    : "Conferido automaticamente (o Recebimento de origem foi recebido)"}
                  {m.conferido_em ? ` · ${formatDataHora(m.conferido_em)}` : ""}
                </span>
              )}
              {status === "Pago" && (
                <span className="text-[11px] text-gray-500">
                  {pagoPorNome ? `Pago por ${pagoPorNome}` : "Pago (registro automático)"}
                  {m.data_pagamento ? ` · ${formatDataCalendario(m.data_pagamento)}` : ""}
                </span>
              )}
            </div>
          }
        />
        <Linha
          label="Comprovante"
          valor={
            m.comprovante_url ? (
              <a href={m.comprovante_url} target="_blank" rel="noreferrer" className="text-primary font-semibold hover:underline">
                Abrir comprovante →
              </a>
            ) : (
              "—"
            )
          }
        />
        {m.gerado_automaticamente && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-2 inline-block w-fit">
            {m.tipo === "Recebimento"
              ? "Gerada automaticamente pelo lote de boletos da transação vinculada."
              : "Gerada automaticamente pelo rateio de honorários da transação vinculada."}
          </p>
        )}
      </div>
    </div>
  );
}
