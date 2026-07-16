"use client";

import { useState } from "react";
import { STATUS_LANCAMENTO_OPCOES } from "@/lib/financiamento/opcoes";
import { formatMoeda, formatValorEditavel } from "@/lib/format";

type LancamentoExistente = {
  id: string;
  valor_financiado: unknown;
  remuneracao: unknown;
  status: string;
  data_pagamento: Date | null;
};

type Linha = {
  id: string | null;
  valorFinanciadoTexto: string;
  remuneracaoTexto: string;
  status: string;
  dataPagamento: string;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function linhaDe(l: LancamentoExistente): Linha {
  return {
    id: l.id,
    valorFinanciadoTexto: formatValorEditavel(l.valor_financiado),
    remuneracaoTexto: formatValorEditavel(l.remuneracao),
    status: l.status,
    dataPagamento: inputDate(l.data_pagamento)
  };
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-2 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Lista de lançamentos (parcelas de remuneração) de um Andamento — edição
// direta na tela, sem sair pra outra página. Salva tudo de uma vez (ver
// sincronizarLancamentosAction): adiciona linha nova, edita valor/status,
// remove — tudo isso só vira gravação de verdade quando aperta "Salvar
// lançamentos".
export function LancamentosLista({
  andamentoId,
  lancamentosIniciais,
  action
}: {
  andamentoId: string;
  lancamentosIniciais: LancamentoExistente[];
  action: (formData: FormData) => void;
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() => lancamentosIniciais.map(linhaDe));
  const [alterado, setAlterado] = useState(false);

  function atualizarLinha(indice: number, campo: keyof Linha, valor: string) {
    setLinhas((prev) => prev.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
    setAlterado(true);
  }

  function removerLinha(indice: number) {
    setLinhas((prev) => prev.filter((_, i) => i !== indice));
    setAlterado(true);
  }

  function adicionarLinha() {
    setLinhas((prev) => [
      ...prev,
      { id: null, valorFinanciadoTexto: "", remuneracaoTexto: "", status: "Previsão", dataPagamento: "" }
    ]);
    setAlterado(true);
  }

  const linhasParaEnviar = linhas.map((l) => ({
    id: l.id,
    valor_financiado: l.valorFinanciadoTexto,
    remuneracao: l.remuneracaoTexto,
    status: l.status,
    data_pagamento: l.dataPagamento
  }));

  const totalRemuneracao = linhas.reduce((acc, l) => {
    const n = Number(l.remuneracaoTexto.replace(/\./g, "").replace(",", "."));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Lançamentos ({linhas.length})</div>
        <span className="text-xs text-gray-500">
          Total remuneração: <span className="font-semibold text-gray-800">{formatMoeda(totalRemuneracao)}</span>
        </span>
      </div>

      {linhas.length === 0 && <p className="text-xs text-gray-400 mb-3">Nenhum lançamento ainda.</p>}

      <div className="flex flex-col gap-2">
        {linhas.map((linha, indice) => (
          <div
            key={indice}
            className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_130px_130px_32px] md:items-center border border-gray-100 rounded-lg p-2"
          >
            <div>
              <label className={LABEL}>Valor financiado</label>
              <input
                className={CAMPO}
                value={linha.valorFinanciadoTexto}
                onChange={(e) => atualizarLinha(indice, "valorFinanciadoTexto", e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className={LABEL}>Remuneração</label>
              <input
                className={CAMPO}
                value={linha.remuneracaoTexto}
                onChange={(e) => atualizarLinha(indice, "remuneracaoTexto", e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select className={CAMPO} value={linha.status} onChange={(e) => atualizarLinha(indice, "status", e.target.value)}>
                {STATUS_LANCAMENTO_OPCOES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Data pagamento</label>
              <input
                type="date"
                className={CAMPO}
                value={linha.dataPagamento}
                onChange={(e) => atualizarLinha(indice, "dataPagamento", e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => removerLinha(indice)}
              className="text-xs text-red-500 hover:text-red-700 self-end pb-2"
              title="Remover lançamento"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={adicionarLinha} className="mt-2 text-[11px] text-primary underline">
        + Adicionar lançamento
      </button>

      <form action={action} className="flex justify-end mt-4">
        <input type="hidden" name="andamentoId" value={andamentoId} />
        <input type="hidden" name="lancamentosJson" value={JSON.stringify(linhasParaEnviar)} />
        <button
          type="submit"
          disabled={!alterado}
          className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold disabled:opacity-40"
        >
          Salvar lançamentos
        </button>
      </form>
    </div>
  );
}
