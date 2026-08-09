"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatData } from "@/lib/format";
import { COLUNAS_KANBAN, pilarImpactoDaColuna, PILAR_IMPACTO_COR, slaDaOrdem } from "@/lib/marketing/opcoes";

type OrdemKanban = {
  id: string;
  id_legado: string | null;
  titulo: string;
  coluna: string;
  tipo: string | null;
  prioridade: string;
  prazo_entrega: Date | string | null;
  coluna_atualizada_em: Date | string | null;
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
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onDrop(coluna: string) {
    setColunaAlvo(null);
    if (!arrastandoId) return;
    const id = arrastandoId;
    setArrastandoId(null);
    if (ordens.find((o) => o.id === id)?.coluna === coluna) return;
    setErro(null);
    startTransition(() => {
      // moverColuna pode recusar a troca (ex.: regra "sem briefing completo
      // não sai de Aguardando briefing") — sem <form> aqui, então o erro só
      // chega como rejeição da promise; mostramos numa faixa acima do
      // quadro pra não deixar o usuário sem saber por que o card voltou.
      moverColuna(id, coluna).catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : "Não foi possível mover o card.");
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <span>{erro}</span>
          <button type="button" onClick={() => setErro(null)} className="text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      )}
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
            <div className="flex items-center justify-between px-1 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-bold text-gray-700 truncate">{coluna.label}</span>
                <span
                  className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 border shrink-0 ${PILAR_IMPACTO_COR[pilarImpactoDaColuna(coluna.id).id]}`}
                  title={`Pilar IMPACTO: ${pilarImpactoDaColuna(coluna.id).label}`}
                >
                  {pilarImpactoDaColuna(coluna.id).letra}
                </span>
              </div>
              <span className="text-[11px] text-gray-400 shrink-0">{ordensColuna.length}</span>
            </div>

            <div className="flex flex-col gap-2 md:max-h-[65vh] md:overflow-y-auto">
              {ordensColuna.map((o) => {
                const sla = slaDaOrdem(o.coluna, o.tipo, o.coluna_atualizada_em);
                return (
                <Link
                  key={o.id}
                  href={`/marketing/${o.id}`}
                  draggable
                  onDragStart={() => setArrastandoId(o.id)}
                  onDragEnd={() => {
                    setArrastandoId(null);
                    setColunaAlvo(null);
                  }}
                  className={`bg-white border rounded-lg p-3 flex flex-col gap-1.5 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing ${
                    sla?.atrasado ? "border-red-300 hover:border-red-400" : "border-gray-200 hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-gray-400">{o.id_legado ?? "—"}</span>
                    <div className="flex items-center gap-1">
                      {o.tipo && <span className="text-[10px] text-gray-400">{o.tipo}</span>}
                      {sla?.atrasado && (
                        <span
                          className="text-[9px] font-bold rounded-full px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-200"
                          title="Etapa passou do prazo (SLA)"
                        >
                          Atrasado
                        </span>
                      )}
                    </div>
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
                );
              })}
              {ordensColuna.length === 0 && (
                <div className="text-[11px] text-gray-300 text-center py-4">Nenhuma ordem aqui.</div>
              )}
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}
