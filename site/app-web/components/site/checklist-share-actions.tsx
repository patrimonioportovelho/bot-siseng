"use client";

import { useState } from "react";

// Ações extras que só fazem sentido pra Checklist: o corretor quer copiar o
// texto inteiro (título + corpo) pra colar numa conversa, ou já abrir direto
// o WhatsApp com a mensagem pronta pro cliente. O ShareButton normal só
// compartilha o link — aqui a ideia é mandar o conteúdo em si.
export function ChecklistShareActions({ titulo, corpo, url }: { titulo: string; corpo: string; url: string }) {
  const [copiado, setCopiado] = useState(false);

  const mensagem = `${titulo}\n\n${corpo}\n\n${url}`;

  async function copiarMensagem() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // navegadores mais antigos / sem permissão de clipboard: sem drama,
      // só não mostra o feedback de "copiado".
    }
  }

  function enviarWhatsapp() {
    const link = `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
    window.open(link, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      <button
        type="button"
        onClick={copiarMensagem}
        className="text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg px-3 py-2 hover:bg-gray-200"
      >
        {copiado ? "Mensagem copiada ✓" : "Copiar mensagem"}
      </button>
      <button
        type="button"
        onClick={enviarWhatsapp}
        className="text-xs font-semibold bg-green-600 text-white rounded-lg px-3 py-2 hover:bg-green-700"
      >
        Enviar no WhatsApp
      </button>
    </div>
  );
}
