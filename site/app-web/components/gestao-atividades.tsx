"use client";

import { useRef, useTransition } from "react";
import { formatDataCalendario, hojeInputDate, hojePortoVelho } from "@/lib/format";
import { TIPOS_ATIVIDADE, TIPO_ATIVIDADE_LABEL } from "@/lib/gestoes/opcoes";

type Atividade = { id: string; tipo: string; titulo: string; data: Date | string; feito: boolean; notas: string | null };

// Mesmo componente de Manutenção (components/manutencao-atividades.tsx), só
// trocando gestaoId no lugar de manutencaoId.
export function GestaoAtividades({
  gestaoId,
  atividades,
  adicionar,
  marcarFeita,
  remover
}: {
  gestaoId: string;
  atividades: Atividade[];
  adicionar: (formData: FormData) => void;
  marcarFeita: (id: string, gestaoId: string) => Promise<void>;
  remover: (id: string, gestaoId: string) => Promise<void>;
}) {
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const agora = hojePortoVelho();

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-bold text-gray-800 mb-3">Nova atividade</div>

      <form
        ref={formRef}
        action={(formData) => {
          adicionar(formData);
          formRef.current?.reset();
        }}
        className="grid md:grid-cols-4 gap-2 mb-4"
      >
        <input type="hidden" name="gestaoId" value={gestaoId} />
        <select name="tipo" className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary bg-white" required defaultValue="">
          <option value="" disabled>
            Tipo...
          </option>
          {TIPOS_ATIVIDADE.map((t) => (
            <option key={t} value={t}>
              {TIPO_ATIVIDADE_LABEL[t]}
            </option>
          ))}
        </select>
        <input
          name="titulo"
          placeholder="Descrição"
          className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary md:col-span-2"
          required
        />
        <input name="data" type="date" defaultValue={hojeInputDate()} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary" required />
        <input
          name="notas"
          placeholder="Notas (opcional)"
          className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary md:col-span-3"
        />
        <button type="submit" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap">
          + Agendar
        </button>
      </form>

      <div className="flex flex-col gap-1.5">
        {atividades.map((a) => {
          const dataAtividade = new Date(a.data);
          const atrasada = !a.feito && dataAtividade < agora;
          return (
            <div
              key={a.id}
              className={`flex items-center gap-2 border rounded-lg px-2.5 py-1.5 group ${
                atrasada ? "bg-[#B14226]/5 border-[#B14226]/30" : "border-gray-100"
              }`}
            >
              <input
                type="checkbox"
                checked={a.feito}
                onChange={() => startTransition(() => marcarFeita(a.id, gestaoId))}
                className="rounded"
              />
              <div className="flex-1 min-w-0">
                <span className={`text-xs ${a.feito ? "line-through text-gray-400" : atrasada ? "text-[#B14226] font-medium" : "text-gray-700"}`}>
                  {TIPO_ATIVIDADE_LABEL[a.tipo] ?? a.tipo} — {a.titulo}
                </span>
                {a.notas && <div className="text-[11px] text-gray-400">{a.notas}</div>}
              </div>
              <span className={`text-[11px] whitespace-nowrap ${atrasada ? "text-[#B14226]" : "text-gray-400"}`}>
                {formatDataCalendario(dataAtividade)}
              </span>
              <button
                type="button"
                onClick={() => startTransition(() => remover(a.id, gestaoId))}
                className="text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
              >
                remover
              </button>
            </div>
          );
        })}
        {atividades.length === 0 && <p className="text-xs text-gray-400">Nenhuma atividade agendada ainda.</p>}
      </div>
    </div>
  );
}
