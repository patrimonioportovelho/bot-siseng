"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatData } from "@/lib/format";
import { COLUNAS_KANBAN } from "@/lib/marketing/opcoes";

type OrdemKanban = {
  id: string;
  id_legado: string | null;
  titulo: string;
  coluna: string;
  tipo: string | null;
  prioridade: string;
  prazo_entrega: Date | string | null;
  parceiros_marketing_ordens_solicitante_parceiro_idToparceiros: { nome: string } | null;
  parceiros_marketing_ordens_responsavel_atual_idToparceiros: { nome: string } | null;
};

const PRIORIDADE_COR: Record<string, string> = {
  Urgente: "text-red-600",
  Alta: "text-[#B14226]",
  Normal: "text-gray-500",
  Baixa: "text-gray-400"
};

// Quadro Kanban de Marketing — mesmo mecanismo de arrastar e soltar dos
// quadros de Manutenção/Gestões (components/gestao-kanban.tsx): moverColuna
// é uma server action chamada direto no onDrop, sem <form>.
export function MarketingKanban({
  ordens,
  moverColuna
}: {
  ordens: OrdemKanban[];
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
    if (ordens.find((o) => o.id === id)?.coluna === coluna) return;
    startTransition(() => {
      moverColuna(id, coluna);
    });
  }

  return (
    <div className="flex flex-col md:flex-row gap-3 md:overflow-x-auto pb-2">
      {COLUNAS_KANBAN.map((coluna) => {
        const ordensColuna = ordens.filter((o) => o.coluna === coluna.id);
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
              <span className="text-[11px] text-gray-400">{ordensColuna.length}</span>
            </div>

            <div className="flex flex-col gap-2 md:max-h-[65vh] md:overflow-y-auto">
              {ordensColuna.map((o) => (
                <Link
                  key={o.id}
                  href={`/marketing/${o.id}`}
                  draggable
                  onDragStart={() => setArrastandoId(o.id)}
                  onDragEnd={() => {
                    setArrastandoId(null);
                    setColunaAlvo(null);
                  }}
                  className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-1.5 hover:border-primary/40 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-gray-400">{o.id_legado ?? "—"}</span>
                    {o.tipo && <span className="text-[10px] text-gray-400">{o.tipo}</span>}
                  </div>
                  <div className="text-xs font-semibold text-gray-800 leading-snug truncate">{o.titulo}</div>
                  {o.parceiros_marketing_ordens_solicitante_parceiro_idToparceiros?.nome && (
                    <div className="text-[11px] text-gray-500 truncate">
                      Solicitante: {o.parceiros_marketing_ordens_solicitante_parceiro_idToparceiros.nome}
                    </div>
                  )}
                  {o.parceiros_marketing_ordens_responsavel_atual_idToparceiros?.nome && (
                    <div className="text-[11px] text-gray-500 truncate">
                      Responsável: {o.parceiros_marketing_ordens_responsavel_atual_idToparceiros.nome}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
                    <span className={`text-[11px] font-medium ${PRIORIDADE_COR[o.prioridade] ?? "text-gray-500"}`}>
                      {o.prioridade}
                    </span>
                    {o.prazo_entrega && (
                      <span className="text-[10px] text-gray-400 ml-auto">
                        Entrega: {formatData(o.prazo_entrega)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
              {ordensColuna.length === 0 && (
                <div className="text-[11px] text-gray-300 text-center py-4">Nenhuma ordem aqui.</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
