"use client";

import { useRef, useState, useTransition } from "react";
import { BotaoSubmit } from "@/components/botao-submit";

type ChecklistItem = { id: string; label: string; done: boolean };

// Mesmo componente de Gestões/Manutenção (components/gestao-checklist.tsx),
// só trocando o nome do id (ordemId em vez de gestaoId) e acrescentando o
// botão "+ Checklist do pilar atual", que insere os itens do Manual IMPACTO
// referentes ao pilar em que a Ordem está agora (derivado da coluna do
// Kanban — ver lib/marketing/opcoes.ts CHECKLIST_POR_PILAR). Fica sempre
// disponível (não só quando a lista está vazia) porque o card muda de pilar
// ao longo do tempo e cada mudança pode trazer um checklist novo.
export function MarketingChecklist({
  ordemId,
  itens,
  pilarAtualLabel,
  adicionar,
  adicionarPadrao,
  marcar,
  remover
}: {
  ordemId: string;
  itens: ChecklistItem[];
  pilarAtualLabel: string;
  adicionar: (formData: FormData) => void;
  adicionarPadrao: (formData: FormData) => void;
  marcar: (id: string, ordemId: string) => Promise<void>;
  remover: (id: string, ordemId: string) => Promise<void>;
}) {
  const [, startTransition] = useTransition();
  // Item sendo marcado/removido agora — mesmo padrão de feedback aplicado
  // em gestao-checklist.tsx/manutencao-checklist.tsx (pedido do usuário
  // 30/08/2026).
  const [idProcessando, setIdProcessando] = useState<string | null>(null);

  function aoMarcar(id: string) {
    setIdProcessando(id);
    startTransition(async () => {
      await marcar(id, ordemId);
      setIdProcessando(null);
    });
  }

  function aoRemover(id: string) {
    setIdProcessando(id);
    startTransition(async () => {
      await remover(id, ordemId);
      setIdProcessando(null);
    });
  }
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Checklist</div>
        <form action={adicionarPadrao}>
          <input type="hidden" name="ordemId" value={ordemId} />
          <BotaoSubmit className="text-[11px] text-primary font-semibold hover:underline" carregandoTexto="Adicionando..." variante="secundario">
            + Checklist do pilar atual ({pilarAtualLabel})
          </BotaoSubmit>
        </form>
      </div>

      <div className="flex flex-col gap-1.5 mb-3">
        {itens.map((item) => {
          const processando = idProcessando === item.id;
          return (
            <div key={item.id} className="flex items-center gap-2 group">
              {processando ? (
                <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin border-gray-300 border-t-gray-600 shrink-0" />
              ) : (
                <input type="checkbox" checked={item.done} onChange={() => aoMarcar(item.id)} className="rounded" />
              )}
              <span className={`text-xs flex-1 ${item.done ? "line-through text-gray-400" : "text-gray-700"}`}>
                {item.label}
              </span>
              <button
                type="button"
                onClick={() => aoRemover(item.id)}
                disabled={processando}
                className="text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 disabled:cursor-wait"
              >
                remover
              </button>
            </div>
          );
        })}
        {itens.length === 0 && <p className="text-xs text-gray-400">Nenhum item ainda.</p>}
      </div>

      <form
        ref={formRef}
        action={async (formData) => {
          await adicionar(formData);
          formRef.current?.reset();
        }}
        className="flex gap-2"
      >
        <input type="hidden" name="ordemId" value={ordemId} />
        <input
          name="label"
          placeholder="Novo item do checklist..."
          className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 flex-1 outline-none focus:border-primary"
          required
        />
        <BotaoSubmit className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap" carregandoTexto="Adicionando...">
          + Adicionar
        </BotaoSubmit>
      </form>
    </div>
  );
}
