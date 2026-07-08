"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatMoeda } from "@/lib/format";
import {
  COLUNAS_KANBAN,
  URGENCIA_LABEL,
  URGENCIA_COR,
  CHAVE_POSSE_LABEL,
  iconeTipoServico
} from "@/lib/manutencao/opcoes";

type TicketKanban = {
  id: string;
  titulo: string;
  tipo_servico: string;
  urgencia: string;
  coluna: string;
  custo_estimado: unknown;
  chave_posse: string;
  imoveis: { id: string; id_legado: string | null; endereco: string | null };
  clientes: { nome: string } | null;
  parceiros: { nome: string } | null;
};

// Quadro Kanban de manutenção — arrastar e soltar entre colunas atualiza a
// coluna no banco (moverColuna é a server action passada como prop, chamada
// direto no onDrop, sem precisar de <form>). Em telas md- as colunas
// empilham em seções verticais (mesmo padrão responsivo do resto do
// sistema), em md+ viram um quadro horizontal com rolagem por coluna.
export function ManutencaoKanban({
  tickets,
  moverColuna
}: {
  tickets: TicketKanban[];
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
    if (tickets.find((t) => t.id === id)?.coluna === coluna) return;
    startTransition(() => {
      moverColuna(id, coluna);
    });
  }

  return (
    <div className="flex flex-col md:flex-row gap-3 md:overflow-x-auto pb-2">
      {COLUNAS_KANBAN.map((coluna) => {
        const ticketsColuna = tickets.filter((t) => t.coluna === coluna.id);
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
              <span className="text-[11px] text-gray-400">{ticketsColuna.length}</span>
            </div>

            <div className="flex flex-col gap-2 md:max-h-[65vh] md:overflow-y-auto">
              {ticketsColuna.map((t) => {
                const cor = URGENCIA_COR[t.urgencia] ?? URGENCIA_COR.media;
                return (
                  <Link
                    key={t.id}
                    href={`/manutencao/${t.id}`}
                    draggable
                    onDragStart={() => setArrastandoId(t.id)}
                    onDragEnd={() => {
                      setArrastandoId(null);
                      setColunaAlvo(null);
                    }}
                    className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-1.5 hover:border-primary/40 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="text-sm leading-none">{iconeTipoServico(t.tipo_servico)}</span>
                      <span className="text-xs font-semibold text-gray-800 leading-snug">{t.titulo}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {t.imoveis.id_legado ?? t.imoveis.id.slice(0, 8)} — {t.imoveis.endereco ?? "Sem endereço"}
                    </div>
                    {t.clientes?.nome && <div className="text-[11px] text-gray-500 truncate">Propr.: {t.clientes.nome}</div>}
                    {t.parceiros?.nome && (
                      <div className="text-[11px] text-gray-500 truncate">Prestador: {t.parceiros.nome}</div>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${cor.bg} ${cor.texto} ${cor.borda}`}>
                        {URGENCIA_LABEL[t.urgencia] ?? t.urgencia}
                      </span>
                      <span className="text-[10px] text-gray-400">🔑 {CHAVE_POSSE_LABEL[t.chave_posse] ?? t.chave_posse}</span>
                    </div>
                    {t.custo_estimado != null && (
                      <div className="text-[11px] font-medium text-gray-700">{formatMoeda(t.custo_estimado)}</div>
                    )}
                  </Link>
                );
              })}
              {ticketsColuna.length === 0 && (
                <div className="text-[11px] text-gray-300 text-center py-4">Nenhum ticket aqui.</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
