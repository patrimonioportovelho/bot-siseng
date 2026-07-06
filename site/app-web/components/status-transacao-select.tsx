"use client";

import { STATUS_TRANSACAO_TODOS, statusTone } from "@/lib/format";
import { atualizarStatusTransacaoAction } from "@/app/transacoes/actions";

const CORES: Record<string, string> = {
  ativa: "bg-blue-50 text-blue-700 border-blue-200",
  concluida: "bg-green-50 text-green-700 border-green-200",
  cancelada: "bg-red-50 text-red-700 border-red-200",
  pendente: "bg-gray-50 text-gray-600 border-gray-200"
};

// Select que salva sozinho assim que muda — pensado para trocar o status de
// uma transação de locação direto na tela da Administração, sem precisar
// abrir outra página.
export function StatusTransacaoSelect({
  transacaoId,
  admImovelId,
  statusAtual
}: {
  transacaoId: string;
  admImovelId: string;
  statusAtual: string | null;
}) {
  const cor = CORES[statusTone(statusAtual)];

  return (
    <form action={atualizarStatusTransacaoAction} onChange={(e) => e.currentTarget.requestSubmit()}>
      <input type="hidden" name="transacaoId" value={transacaoId} />
      <input type="hidden" name="admImovelId" value={admImovelId} />
      <select
        name="status"
        defaultValue={statusAtual ?? ""}
        className={`text-xs border rounded-lg px-2 py-1 outline-none focus:border-primary ${cor}`}
      >
        <option value="" disabled>
          —
        </option>
        {STATUS_TRANSACAO_TODOS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}
