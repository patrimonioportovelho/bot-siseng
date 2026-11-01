"use client";

import { useEffect, useState } from "react";

// Arrastar um card até uma coluna distante (ex.: "Sem interesse", no fim de um
// quadro largo) travava: a tela não rolava sozinha durante o arraste. Dois
// reforços valem para todos os quadros:
//  1) rolagem automática: segurando o card perto da borda do quadro (ou do topo
//     e da base da janela), a tela rola sozinha, mais rápido quanto mais perto;
//  2) uma barra no rodapé com TODAS as etapas: dá para soltar o card direto
//     nela, sem rolar nada (inclusive etapas escondidas, como Encerrados).

const BORDA_PX = 110;

function velocidade(distancia: number): number {
  const d = Math.min(Math.max(distancia, 0), BORDA_PX);
  return Math.round(8 + (1 - d / BORDA_PX) * 30);
}

function rolavelNaHorizontal(inicio: Element | null): HTMLElement | null {
  let el: Element | null = inicio;
  while (el && el !== document.body && el !== document.documentElement) {
    const h = el as HTMLElement;
    const overflowX = getComputedStyle(h).overflowX;
    if ((overflowX === "auto" || overflowX === "scroll") && h.scrollWidth > h.clientWidth + 2) return h;
    el = el.parentElement;
  }
  return null;
}

export function useAutoRolagemArraste(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    const pos = { x: -1, y: -1 };
    let raf = 0;
    const aoArrastar = (e: DragEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
    };
    const passo = () => {
      if (pos.x >= 0) {
        // horizontal: o quadro (contêiner com rolagem) sob o ponteiro
        const quadro = rolavelNaHorizontal(document.elementFromPoint(pos.x, pos.y));
        if (quadro) {
          const r = quadro.getBoundingClientRect();
          const esquerda = Math.max(r.left, 0);
          const direita = Math.min(r.right, window.innerWidth);
          if (pos.x < esquerda + BORDA_PX) quadro.scrollLeft -= velocidade(pos.x - esquerda);
          else if (pos.x > direita - BORDA_PX) quadro.scrollLeft += velocidade(direita - pos.x);
        }
        // vertical: a janela (a base fica acima da barra de etapas)
        if (pos.y < 90) window.scrollBy(0, -velocidade(pos.y));
        else if (pos.y > window.innerHeight - 170 && pos.y < window.innerHeight - 90) window.scrollBy(0, velocidade(window.innerHeight - 90 - pos.y));
      }
      raf = requestAnimationFrame(passo);
    };
    window.addEventListener("dragover", aoArrastar, true);
    raf = requestAnimationFrame(passo);
    return () => {
      window.removeEventListener("dragover", aoArrastar, true);
      cancelAnimationFrame(raf);
    };
  }, [ativo]);
}

export function DockArraste({
  ativo,
  colunas,
  aoSoltar
}: {
  ativo: boolean;
  colunas: { id: string; label: string; cor?: string }[];
  aoSoltar: (id: string) => void;
}) {
  const [sobre, setSobre] = useState<string | null>(null);
  useEffect(() => {
    if (!ativo) setSobre(null);
  }, [ativo]);
  if (!ativo) return null;
  return (
    <div className="hidden md:flex fixed bottom-3 left-1/2 -translate-x-1/2 z-[65] max-w-[96vw] flex-wrap justify-center gap-1.5 bg-gray-900/90 backdrop-blur rounded-2xl px-3 py-2 shadow-2xl">
      <span className="w-full text-center text-[10px] text-gray-300">Solte o card aqui em qualquer etapa</span>
      {colunas.map((c) => (
        <div
          key={c.id}
          onDragOver={(e) => {
            e.preventDefault();
            if (sobre !== c.id) setSobre(c.id);
          }}
          onDragLeave={() => setSobre((s) => (s === c.id ? null : s))}
          onDrop={(e) => {
            e.preventDefault();
            setSobre(null);
            aoSoltar(c.id);
          }}
          className={`text-[11px] font-semibold rounded-lg border px-2.5 py-1 whitespace-nowrap transition-transform ${c.cor ?? "bg-white text-gray-700 border-gray-200"} ${
            sobre === c.id ? "scale-110 ring-2 ring-primary shadow-lg" : ""
          }`}
        >
          {c.label}
        </div>
      ))}
    </div>
  );
}
