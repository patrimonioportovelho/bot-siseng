"use client";

import { useActionState } from "react";
import { BotaoEnviar } from "@/components/botao-enviar";
import { gerarPagamentoParcialAction } from "@/app/portal/financeiro/actions";

// Mini-formulário "gerar Pix de um pedaço da dívida" (Fase 8, 14/08/2026) —
// pedido do usuário: "se a dívida é 150 e vence dia 20, dia 01 ele gera 50,
// dia 10 gera mais 50". Client component só pra poder mostrar o erro inline
// (ex.: "valor maior que o saldo disponível") sem perder o que a pessoa já
// preencheu — mesmo padrão de useActionState usado em components/financeiro-form.tsx.
// Depois de gerar com sucesso, a página inteira revalida (revalidatePath na
// action) e o novo pedaço pendente aparece na lista, com seu próprio QR Code.
export function PortalGerarPixParcial({ movimentacaoId, tetoDisponivel }: { movimentacaoId: string; tetoDisponivel: number }) {
  const [resultado, formAction] = useActionState(gerarPagamentoParcialAction, undefined);

  return (
    <form action={formAction} className="flex items-end gap-2 mt-2">
      <input type="hidden" name="movimentacaoId" value={movimentacaoId} />
      <div className="flex-1">
        <label className="text-[10px] text-gray-500 block mb-1">Valor deste Pix (até {tetoDisponivel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})</label>
        <input
          type="number"
          name="valor"
          step="0.01"
          min="0.01"
          max={tetoDisponivel}
          required
          placeholder="Ex.: 50,00"
          className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 w-full outline-none focus:border-primary bg-white"
        />
      </div>
      <BotaoEnviar
        textoEnviando="Gerando..."
        className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
      >
        Gerar Pix
      </BotaoEnviar>
      {resultado?.erro && <p className="text-[11px] text-red-600 basis-full">{resultado.erro}</p>}
    </form>
  );
}
