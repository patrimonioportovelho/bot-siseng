"use client";

import { useActionState, useMemo, useState } from "react";
import { formatPercentual } from "@/lib/format";
import { BotaoEnviar } from "@/components/botao-enviar";
import { salvarComissionamentoLoteAction } from "@/app/parceiros/actions";

type ParceiroComissao = {
  id: string;
  nome: string;
  funcao: string;
  status_funcao: string;
  porcProprietario: number | null;
  porcInteressado: number | null;
};

const CAMPO = "text-xs border border-gray-300 rounded-lg px-2 py-1 w-24 outline-none focus:border-primary bg-white";

// Tela de revisão/preenchimento em lote (16/08/2026) — ver comentário
// completo em app/parceiros/actions.ts#salvarComissionamentoLoteAction.
// Uma linha por Corretor/Corretor Estagiário, os dois campos de sempre (%
// Proprietário/% Interessado) lado a lado, um único botão salva tudo de uma
// vez (mesmo padrão de JSON em hidden input já usado em
// components/rateio-form.tsx e transacao-form.tsx pra listas dinâmicas).
export function ComissionamentoLoteForm({ parceiros }: { parceiros: ParceiroComissao[] }) {
  const [linhas, setLinhas] = useState(() =>
    parceiros.map((p) => ({
      id: p.id,
      porc_proprietario: formatPercentual(p.porcProprietario),
      porc_interessado: formatPercentual(p.porcInteressado)
    }))
  );
  const [resultado, formAction] = useActionState(salvarComissionamentoLoteAction, undefined);

  const linhasJson = useMemo(() => JSON.stringify(linhas), [linhas]);

  function atualizar(id: string, campo: "porc_proprietario" | "porc_interessado", valor: string) {
    setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }

  const semNenhumPercentual = (p: ParceiroComissao) => p.porcProprietario == null && p.porcInteressado == null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="linhas" value={linhasJson} />

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="hidden md:grid md:grid-cols-[2fr_1.2fr_1fr_120px_120px] gap-3 px-4 py-2 bg-gray-50 text-[11px] text-gray-400 font-semibold uppercase tracking-wide">
          <span>Nome</span>
          <span>Função</span>
          <span>Status</span>
          <span>% Proprietário</span>
          <span>% Interessado</span>
        </div>
        <div className="flex flex-col divide-y divide-gray-100">
          {parceiros.map((p, i) => (
            <div
              key={p.id}
              className={`grid grid-cols-1 gap-2 md:grid-cols-[2fr_1.2fr_1fr_120px_120px] md:gap-3 md:items-center px-4 py-2.5 ${
                semNenhumPercentual(p) ? "bg-amber-50/50" : ""
              }`}
            >
              <span className="text-xs font-medium text-gray-800">
                {p.nome}
                {semNenhumPercentual(p) && (
                  <span className="ml-2 text-[10px] font-semibold text-amber-600 uppercase">sem comissionamento</span>
                )}
              </span>
              <span className="text-xs text-gray-500">{p.funcao}</span>
              <span className="text-xs text-gray-500">{p.status_funcao}</span>
              <input
                className={CAMPO}
                placeholder="Ex.: 22,5"
                value={linhas[i].porc_proprietario}
                onChange={(e) => atualizar(p.id, "porc_proprietario", e.target.value)}
              />
              <input
                className={CAMPO}
                placeholder="Ex.: 25"
                value={linhas[i].porc_interessado}
                onChange={(e) => atualizar(p.id, "porc_interessado", e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      {resultado?.erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{resultado.erro}</div>
      )}

      <div className="flex justify-end">
        <BotaoEnviar textoEnviando="Salvando..." className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold">
          Salvar tudo
        </BotaoEnviar>
      </div>
    </form>
  );
}
