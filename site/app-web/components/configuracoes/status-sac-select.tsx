"use client";

import { atualizarStatusSacAction } from "@/app/configuracoes/actions";

const STATUS_SAC = ["Novo", "Em andamento", "Resolvido"];

const CORES: Record<string, string> = {
  Novo: "bg-amber-50 text-amber-700 border-amber-200",
  "Em andamento": "bg-blue-50 text-blue-700 border-blue-200",
  Resolvido: "bg-green-50 text-green-700 border-green-200"
};

// Select que salva sozinho assim que muda — mesmo padrão do
// StatusTransacaoSelect, pra marcar o andamento de uma mensagem do SAC sem
// precisar de outro botão de salvar.
export function StatusSacSelect({ mensagemId, statusAtual }: { mensagemId: string; statusAtual: string }) {
  return (
    <form action={atualizarStatusSacAction} onChange={(e) => e.currentTarget.requestSubmit()}>
      <input type="hidden" name="mensagemId" value={mensagemId} />
      <select
        name="status"
        defaultValue={statusAtual}
        className={`text-xs border rounded-lg px-2 py-1 outline-none focus:border-primary ${CORES[statusAtual] ?? ""}`}
      >
        {STATUS_SAC.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}
