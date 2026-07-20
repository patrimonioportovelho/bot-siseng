"use client";

import { useState } from "react";
import { FinanceiroEditarForm } from "@/components/financeiro-editar-form";
import { BotaoComConfirmacao } from "@/components/botao-com-confirmacao";
import { formatMoeda, formatDataCalendario } from "@/lib/format";

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
  marcarPagoAction,
  pendenteRecebido
}: {
  movimentacao: MovimentacaoParaVisualizar;
  categorias: CategoriaOpcao[];
  clientes: ClienteOpcao[];
  parceiros: ParceiroOpcao[];
  action: (formData: FormData) => void;
  excluirAction: (formData: FormData) => void;
  marcarPagoAction: (formData: FormData) => void;
  pendenteRecebido?: boolean;
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

  const rotuloPago = m.tipo === "Despesa" ? "Pago" : "Recebido";
  const rotuloPendente = m.tipo === "Despesa" ? "Pendente" : "Não recebido";
  const temParcelas = (m.parcelas ?? 0) > 1;

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
          label="Pago?"
          valor={
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-semibold ${
                  m.pago ? "text-[#3C7A57]" : pendenteRecebido ? "text-blue-700" : "text-gray-500"
                }`}
              >
                {m.pago ? rotuloPago : pendenteRecebido ? "Pendente - Recebido" : rotuloPendente}
              </span>
              <form action={marcarPagoAction}>
                <input type="hidden" name="movimentacaoId" value={m.id} />
                <button
                  type="submit"
                  className={`text-xs rounded-lg border px-2.5 py-1 font-semibold ${
                    m.pago
                      ? "border-gray-300 text-gray-600 hover:bg-gray-50"
                      : "bg-primary text-white border-primary hover:opacity-90"
                  }`}
                >
                  {m.pago ? `Marcar como ${rotuloPendente}` : `Marcar como ${rotuloPago}`}
                </button>
              </form>
            </div>
          }
        />
        {pendenteRecebido && !m.pago && (
          <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 mt-1 mb-1">
            O dinheiro já caiu na conta (o Recebimento de origem está marcado como recebido) — falta só repassar.
          </p>
        )}
        {m.pago && <Linha label="Data de pagamento" valor={m.data_pagamento ? formatDataCalendario(m.data_pagamento) : "—"} />}
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
