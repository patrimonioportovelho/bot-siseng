"use client";

import { useState } from "react";

// Botão de compartilhar usado nas Notícias/Editais e no SAC do site
// público — usa a Web Share API nativa (abre o menu de compartilhamento do
// celular/navegador) quando disponível; se não tiver suporte (a maioria dos
// desktops), cai para copiar o link e avisa na hora com um texto temporário.
export function ShareButton({
  url,
  title,
  text
}: {
  url: string;
  title: string;
  text?: string;
}) {
  const [aviso, setAviso] = useState<string | null>(null);

  async function compartilhar() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (erro) {
        // Usuário cancelou o compartilhamento (AbortError) — não é erro, não
        // faz nada. Qualquer outro motivo (API indisponível no contexto,
        // bloqueada por política do navegador etc.) cai pro fallback de
        // copiar o link abaixo, em vez de falhar em silêncio sem nenhum
        // feedback pra quem clicou — era esse o bug relatado.
        if (erro instanceof Error && erro.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setAviso("Link copiado!");
    } catch {
      setAviso("Não foi possível copiar o link.");
    }
    setTimeout(() => setAviso(null), 2000);
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={compartilhar}
        className="text-[11px] border border-gray-300 text-gray-600 rounded-lg px-2 py-1 hover:bg-gray-50 whitespace-nowrap"
      >
        ↗ Compartilhar
      </button>
      {aviso && (
        <span className="absolute left-1/2 -translate-x-1/2 -top-7 bg-gray-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap">
          {aviso}
        </span>
      )}
    </div>
  );
}
