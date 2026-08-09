"use client";

import { useRef, useTransition } from "react";

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
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Checklist</div>
        <form action={adicionarPadrao}>
          <input type="hidden" name="ordemId" value={ordemId} />
          <button type="submit" className="text-[11px] text-primary font-semibold hover:underline">
            + Checklist do pilar atual ({pilarAtualLabel})
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-1.5 mb-3">
        {itens.map((item) => (
          <div key={item.id} className="flex items-center gap-2 group">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => startTransition(() => marcar(item.id, ordemId))}
              className="rounded"
            />
            <span className={`text-xs flex-1 ${item.done ? "line-through text-gray-400" : "text-gray-700"}`}>
              {item.label}
            </span>
            <button
              type="button"
              onClick={() => startTransition(() => remover(item.id, ordemId))}
              className="text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
            >
              remover
            </button>
          </div>
        ))}
        {itens.length === 0 && <p className="text-xs text-gray-400">Nenhum item ainda.</p>}
      </div>

      <form
        ref={formRef}
        action={(formData) => {
          adicionar(formData);
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
        <button type="submit" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap">
          + Adicionar
        </button>
      </form>
    </div>
  );
}
