"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatMoeda } from "@/lib/format";
import { COLUNAS_KANBAN, CHAVE_POSSE_LABEL } from "@/lib/gestoes/opcoes";

type GestaoKanban = {
  id: string;
  coluna: string;
  valor_venda: unknown;
  chave_posse: string;
  imoveis: { id: string; id_legado: string | null; endereco: string | null };
  clientes: { nome: string };
  parceiros: { nome: string } | null;
};

// Quadro Kanban de Gestões — mesmo mecanismo de arrastar e soltar do quadro
// de Manutenção (ver components/manutencao-kanban.tsx): moverColuna é uma
// server action chamada direto no onDrop, sem <form>.
export function GestaoKanban({
  gestoes,
  moverColuna
}: {
  gestoes: GestaoKanban[];
  moverColuna: (id: string, novaColuna: string) => Promise<void>;
}) {
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onDrop(coluna: string) {
    setColunaAlvo(null);
    if (!arrastandoId) return;
    const id = arrastandoId;
    setArrastandoId(null);
    if (gestoes.find((g) => g.id === id)?.coluna === coluna) return;
    startTransition(() => {
      moverColuna(id, coluna);
    });
  }

  return (
    <div className="flex flex-col md:flex-row gap-3 md:overflow-x-auto pb-2">
      {COLUNAS_KANBAN.map((coluna) => {
        const gestoesColuna = gestoes.filter((g) => g.coluna === coluna.id);
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
                </Link>
              ))}
              {gestoesColuna.length === 0 && (
                <div className="text-[11px] text-gray-300 text-center py-4">Nenhuma gestão aqui.</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
