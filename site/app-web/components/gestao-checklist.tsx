"use client";

import { useRef, useTransition } from "react";

type ChecklistItem = { id: string; label: string; done: boolean };

// Mesmo componente de Manutenção (components/manutencao-checklist.tsx),
// só trocando o nome do id no formulário/callbacks (gestaoId em vez de
// manutencaoId) — módulos mantidos separados de propósito, sem abstrair
// um componente genérico compartilhado.
export function GestaoChecklist({
  gestaoId,
  itens,
  adicionar,
  marcar,
  remover
}: {
  gestaoId: string;
  itens: ChecklistItem[];
  adicionar: (formData: FormData) => void;
  marcar: (id: string, gestaoId: string) => Promise<void>;
  remover: (id: string, gestaoId: string) => Promise<void>;
}) {
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-bold text-gray-800 mb-3">Checklist</div>

      <div className="flex flex-col gap-1.5 mb-3">
        {itens.map((item) => (
          <div key={item.id} className="flex items-center gap-2 group">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => startTransition(() => marcar(item.id, gestaoId))}
              className="rounded"
            />
            <span className={`text-xs flex-1 ${item.done ? "line-through text-gray-400" : "text-gray-700"}`}>
              {item.label}
            </span>
            <button
              type="button"
              onClick={() => startTransition(() => remover(item.id, gestaoId))}
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
        <input type="hidden" name="gestaoId" value={gestaoId} />
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
