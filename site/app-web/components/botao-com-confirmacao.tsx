"use client";

import { useState } from "react";
import type { ReactNode } from "react";

// Substitui window.confirm() em ações destrutivas/irreversíveis dentro de um
// <form>. Motivo: window.confirm() é um diálogo nativo do navegador — se o
// usuário (ou qualquer sessão anterior naquele navegador) já marcou "Impedir
// que esta página crie mais caixas de diálogo" (opção que o Chrome oferece
// depois de alguns confirms), TODO confirm() seguinte nesse site retorna
// false na hora, sem mostrar nada. Resultado: clicar no botão parece não
// fazer absolutamente nada — sem erro, sem diálogo, sem log — exatamente o
// bug relatado em "Gerar movimentação" (Recorrência). Esse componente troca
// o diálogo nativo por uma confirmação inline dentro da própria tela, que
// nunca pode ser silenciada pelo navegador.
export function BotaoComConfirmacao({
  mensagem,
  children,
  className,
  onClickAntes
}: {
  // Texto de confirmação mostrado inline (ex.: "Excluir esta movimentação de
  // vez? Essa ação não pode ser desfeita.").
  mensagem: string;
  children: ReactNode;
  className: string;
  // Roda antes de entrar no modo confirmação — usado pra montar a prévia,
  // por exemplo. Se retornar false, cancela (equivalente a um guard-clause).
  onClickAntes?: () => boolean | void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <div className="flex items-center gap-2 flex-wrap bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        <span className="text-[11px] text-red-700">{mensagem}</span>
        <button
          type="submit"
          className="text-xs bg-red-600 text-white rounded-lg px-3 py-1.5 font-semibold hover:opacity-90"
        >
          Sim, confirmar
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="text-xs border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5 font-semibold hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (onClickAntes && onClickAntes() === false) return;
        setConfirmando(true);
      }}
      className={className}
    >
      {children}
    </button>
  );
}
