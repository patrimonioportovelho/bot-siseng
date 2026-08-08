"use client";

import { useState } from "react";
import Link from "next/link";
import type { Notificacao } from "@/lib/notificacoes";

function formatDataHora(data: Date) {
  return new Date(data).toLocaleString("pt-BR", {
    timeZone: "America/Porto_Velho",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Sino de notificações no Topbar do administrativo — pedido do usuário em
// 08/08/2026. Mesmo padrão visual/interação do seletor de Loja
// (components/loja-filtro-botao.tsx): botão + overlay pra fechar ao
// clicar fora + painel absoluto, sem lib de popover.
export function NotificacoesSino({ itens }: { itens: Notificacao[] }) {
  const [aberto, setAberto] = useState(false);
  const urgentes = itens.filter((i) => i.urgente).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white hover:bg-gray-50 shrink-0"
        aria-label="Notificações"
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-gray-500">
          <path
            d="M12 3a5 5 0 0 0-5 5v2.6c0 .5-.15 1-.44 1.4L5 15h14l-1.56-3c-.29-.4-.44-.9-.44-1.4V8a5 5 0 0 0-5-5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {itens.length > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${
              urgentes > 0 ? "bg-red-600" : "bg-primary"
            }`}
          >
            {itens.length > 9 ? "9+" : itens.length}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg w-80 max-w-[90vw] max-h-96 overflow-auto">
            <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-b border-gray-100 sticky top-0 bg-white">
              Notificações {itens.length > 0 && <span className="text-gray-400 font-normal">({itens.length})</span>}
            </div>
            {itens.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-4 text-center">Nada pendente por aqui.</p>
            ) : (
              <div className="flex flex-col">
                {itens.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setAberto(false)}
                    className="px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 flex flex-col gap-0.5"
                  >
                    <span className="flex items-center gap-1.5">
                      {item.urgente && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                      <span className="text-xs font-medium text-gray-800 truncate">{item.titulo}</span>
                    </span>
                    {item.detalhe && <span className="text-[11px] text-gray-500 truncate">{item.detalhe}</span>}
                    <span className="text-[10px] text-gray-400">{formatDataHora(item.data)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
