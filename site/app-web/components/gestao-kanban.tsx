"use client";

import { useMemo, useState } from "react";
import { DockArraste, useAutoRolagemArraste } from "@/components/dock-arraste";
import Link from "next/link";
import { formatMoeda } from "@/lib/format";
import { COLUNAS_KANBAN, CHAVE_POSSE_LABEL, TIPO_GESTAO_LABEL } from "@/lib/gestoes/opcoes";
import { useQuadroOtimista } from "@/components/use-quadro-otimista";
import { ConfirmarAnuncioModal } from "@/components/confirmar-anuncio-modal";
import type { AnuncioInformado } from "@/lib/gestoes/anuncio";

type GestaoKanban = {
  id: string;
  coluna: string;
  // "gestao" (contrato com exclusividade) ou "captacao" (ficha de captação, sem exclusividade)
  tipo: string;
  valor_venda: unknown;
  chave_posse: string;
  imoveis: { id: string; id_legado: string | null; endereco: string | null; anuncio_id: string | null; anuncio_url: string | null };
  clientes: { nome: string };
  parceiros: { nome: string } | null;
};

// Quadro Kanban de Gestões — mesmo mecanismo de arrastar e soltar do quadro
// de Manutenção (ver components/manutencao-kanban.tsx): moverColuna é uma
// server action chamada direto no onDrop, sem <form>.
export function GestaoKanban({
  gestoes: gestoesServidor,
  moverColuna
}: {
  gestoes: GestaoKanban[];
  // Indo para Comercialização, `anuncio` traz a confirmação do anúncio no site (o servidor recusa sem ela).
  moverColuna: (id: string, novaColuna: string, anuncio?: AnuncioInformado) => Promise<void | { ok: boolean; erro?: string }>;
}) {
  // O card muda de coluna na hora; o servidor grava em segundo plano.
  const { itens: gestoes, moverPara, erro, limparErro } = useQuadroOtimista<GestaoKanban, AnuncioInformado>(
    gestoesServidor,
    moverColuna,
    // o cadastro do imóvel já mostra o anúncio novo no card, sem esperar o servidor
    (g, _destino, anuncio) =>
      anuncio ? { imoveis: { ...g.imoveis, anuncio_id: anuncio.anunciado ? anuncio.id : null, anuncio_url: anuncio.anunciado ? anuncio.url : null } } : {}
  );
  // Janela "Imóvel já anunciado no site?" ao soltar um card em Comercialização.
  const [pedindoAnuncio, setPedindoAnuncio] = useState<{ id: string } | null>(null);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  // rolagem automática do quadro enquanto o card é arrastado até a borda
  useAutoRolagemArraste(arrastandoId !== null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<"" | "gestao" | "captacao">("");

  function onDrop(coluna: string) {
    setColunaAlvo(null);
    if (!arrastandoId) return;
    const id = arrastandoId;
    setArrastandoId(null);
    const card = gestoes.find((g) => g.id === id);
    if (coluna === "comercializacao" && card && card.coluna !== "comercializacao") {
      setPedindoAnuncio({ id });
      return;
    }
    moverPara(id, coluna);
  }

  const porColuna = useMemo(() => {
    const mapa = new Map<string, GestaoKanban[]>();
    for (const g of gestoes) {
      if (filtroTipo && g.tipo !== filtroTipo) continue;
      mapa.set(g.coluna, [...(mapa.get(g.coluna) ?? []), g]);
    }
    return mapa;
  }, [gestoes, filtroTipo]);

  return (
    <div className="flex flex-col gap-3">
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <span>{erro}</span>
          <button type="button" onClick={limparErro} className="text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(
          [
            { id: "", rotulo: "Todos" },
            { id: "gestao", rotulo: "Gestões (exclusividade)" },
            { id: "captacao", rotulo: "Captações (sem exclusividade)" }
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltroTipo(f.id)}
            className={`text-[11px] rounded-full border px-2.5 py-1 ${filtroTipo === f.id ? "bg-primary text-white border-primary font-semibold" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
          >
            {f.rotulo}
          </button>
        ))}
      </div>
    <DockArraste ativo={arrastandoId !== null} colunas={COLUNAS_KANBAN} aoSoltar={(id) => onDrop(id)} />
    <div className="flex flex-col md:flex-row gap-3 md:overflow-x-auto pb-2">
      {COLUNAS_KANBAN.map((coluna) => {
        const gestoesColuna = porColuna.get(coluna.id) ?? [];
        const emDestaque = colunaAlvo === coluna.id;
        return (
          <div
            key={coluna.id}
            onDragOver={(e) => {
              e.preventDefault();
              if (colunaAlvo !== coluna.id) setColunaAlvo(coluna.id);
            }}
            onDragLeave={() => setColunaAlvo((atual) => (atual === coluna.id ? null : atual))}
            onDrop={() => onDrop(coluna.id)}
            className={`md:w-72 md:shrink-0 rounded-xl border p-2 flex flex-col gap-2 transition-colors ${
              emDestaque ? "bg-primary/5 border-primary/40" : "bg-gray-50 border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-gray-700">{coluna.label}</span>
              <span className="text-[11px] text-gray-400">{gestoesColuna.length}</span>
            </div>

            <div className="flex flex-col gap-2 md:max-h-[65vh] md:overflow-y-auto">
              {gestoesColuna.map((g) => (
                <Link
                  key={g.id}
                  href={`/gestoes/${g.id}`}
                  draggable
                  onDragStart={() => setArrastandoId(g.id)}
                  onDragEnd={() => {
                    setArrastandoId(null);
                    setColunaAlvo(null);
                  }}
                  className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-1.5 hover:border-primary/40 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing"
                >
                  <div className="text-xs font-semibold text-gray-800 leading-snug truncate">
                    {g.imoveis.endereco ?? g.imoveis.id_legado ?? "Sem endereço"}
                  </div>
                  <span
                    className={`self-start text-[9px] font-bold rounded-full border px-1.5 py-0.5 ${
                      g.tipo === "captacao" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                    }`}
                  >
                    {TIPO_GESTAO_LABEL[g.tipo] ?? "Gestão"}
                  </span>
                  <div className="text-[11px] text-gray-500 truncate">Cliente: {g.clientes.nome}</div>
                  {g.parceiros?.nome && (
                    <div className="text-[11px] text-gray-500 truncate">Corretor: {g.parceiros.nome}</div>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
                    {g.valor_venda != null && (
                      <span className="text-[11px] font-medium text-gray-700">{formatMoeda(g.valor_venda)}</span>
                    )}
                    <span className="text-[10px] text-gray-400 ml-auto">
                      🔑 {CHAVE_POSSE_LABEL[g.chave_posse] ?? g.chave_posse}
                    </span>
                  </div>
                  {g.imoveis.anuncio_id && <div className="text-[10px] text-green-700 truncate">🌐 Anúncio {g.imoveis.anuncio_id}</div>}
                </Link>
              ))}
              {gestoesColuna.length === 0 && (
                <div className="text-[11px] text-gray-300 text-center py-4">Nenhum card aqui.</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
      {pedindoAnuncio &&
        (() => {
          const card = gestoes.find((g) => g.id === pedindoAnuncio.id);
          if (!card) return null;
          return (
            <ConfirmarAnuncioModal
              endereco={card.imoveis.endereco ?? card.imoveis.id_legado ?? "Imóvel"}
              inicial={{ id: card.imoveis.anuncio_id, url: card.imoveis.anuncio_url }}
              aoConfirmar={(anuncio) => {
                setPedindoAnuncio(null);
                moverPara(card.id, "comercializacao", anuncio);
              }}
              aoCancelar={() => setPedindoAnuncio(null)}
            />
          );
        })()}
    </div>
  );
}
