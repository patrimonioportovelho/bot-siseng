"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";

// Menu do sistema interno (ADM). Em telas md+ fica fixo do lado esquerdo,
// igual sempre foi. Abaixo de md vira uma barra fina com botão de menu (☰)
// que abre um painel deslizante por cima do conteúdo — antes disso o menu
// ficava sempre visível com largura fixa, espremendo qualquer tela de
// celular.
export function Sidebar() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  function Links({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <>
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={
                "text-sm rounded-lg px-3 py-2 transition-colors " +
                (active ? "bg-white/15" : "opacity-80 hover:opacity-100 hover:bg-white/10")
              }
            >
              {item.label}
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <>
      {/* Barra mobile: só aparece abaixo de md — sticky pra não sumir com o
          scroll da página (pedido do usuário: "vai lá pra baixo o menu fica
          em cima e depois precisa voltar pra selecionar"). */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between bg-primary text-white px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-192.png" alt="SisEng" className="h-8 w-8" />
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          className="text-white text-2xl leading-none px-2"
        >
          ☰
        </button>
      </div>

      {/* Painel deslizante mobile, só existe (e só recebe clique) quando aberto */}
      {aberto && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 max-w-[80vw] h-full bg-primary text-white flex flex-col gap-1 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-192.png" alt="SisEng" className="h-8 w-8" />
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="text-white text-2xl leading-none px-2"
              >
                ×
              </button>
            </div>
            <Links onNavigate={() => setAberto(false)} />
          </div>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setAberto(false)}
            className="flex-1 bg-black/40"
          />
        </div>
      )}

      {/* Menu fixo, só aparece em telas md+ — sticky no topo da viewport e
          com a própria rolagem interna, então acompanha o scroll da página
          em vez de sumir quando o conteúdo é mais alto que a tela (pedido
          do usuário, 10/08/2026). */}
      <aside className="hidden md:flex md:w-44 md:shrink-0 md:sticky md:top-0 md:h-screen md:overflow-y-auto bg-primary text-white flex-col gap-1 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-192.png" alt="SisEng" className="h-10 w-10 mb-4" />
        <Links />
      </aside>
    </>
  );
}
