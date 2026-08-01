"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirLojaFiltroAction } from "@/lib/lojas/actions";
import type { Loja } from "@/lib/lojas/filtro";

// Seletor de Loja no Topbar — pedido do usuário em 01/08/2026: antes era um
// botão fixo com o texto "Porto Velho" sem função nenhuma. Agora é um
// seletor de verdade (checkboxes), sempre com todas as lojas marcadas por
// padrão, valendo pra TODAS as páginas do admin (o filtro em si mora em
// lib/lojas/filtro.ts, aplicado página por página). Guarda a escolha num
// cookie de 1 ano e dá refresh na página atual pra já refletir.
export function LojaFiltroBotao({ lojas, selecionadas }: { lojas: Loja[]; selecionadas: string[] }) {
  const [aberto, setAberto] = useState(false);
  const [marcadas, setMarcadas] = useState<string[]>(selecionadas);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();

  const rotulo =
    marcadas.length === lojas.length
      ? "Todas as lojas"
      : lojas
          .filter((l) => marcadas.includes(l.id))
          .map((l) => l.nome)
          .join(", ") || "Nenhuma loja";

  function alternar(id: string) {
    const jaMarcada = marcadas.includes(id);
    // Não deixa desmarcar a última loja marcada — filtro vazio esconderia
    // tudo em todas as telas, o que confunde mais do que ajuda.
    if (jaMarcada && marcadas.length === 1) return;

    const novas = jaMarcada ? marcadas.filter((m) => m !== id) : [...marcadas, id];
    setMarcadas(novas);
    startTransition(async () => {
      await definirLojaFiltroAction(novas);
      router.refresh();
    });
  }

  if (lojas.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
      >
        <span>{rotulo}</span>
        <span className="text-gray-400">{pendente ? "…" : "▾"}</span>
      </button>
      {aberto && (
        <>
          {/* Overlay pra fechar ao clicar fora — sem lib de popover, é o
              jeito mais simples de conseguir esse comportamento aqui. */}
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[170px]">
            {lojas.map((loja) => (
              <label
                key={loja.id}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={marcadas.includes(loja.id)}
                  onChange={() => alternar(loja.id)}
                  className="accent-primary"
                />
                {loja.nome}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
