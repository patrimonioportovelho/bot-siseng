"use client";

import { useRef, useState, useTransition } from "react";
import { formatDataCalendario, hojeInputDate, hojePortoVelho } from "@/lib/format";
import { BotaoSubmit } from "@/components/botao-submit";
import { TIPOS_ATIVIDADE, TIPO_ATIVIDADE_LABEL } from "@/lib/manutencao/opcoes";

type Atividade = { id: string; tipo: string; titulo: string; data: Date | string; feito: boolean; notas: string | null };

export function ManutencaoAtividades({
  manutencaoId,
  atividades,
  adicionar,
  marcarFeita,
  remover
}: {
  manutencaoId: string;
  atividades: Atividade[];
  adicionar: (formData: FormData) => void;
  marcarFeita: (id: string, manutencaoId: string) => Promise<void>;
  remover: (id: string, manutencaoId: string) => Promise<void>;
}) {
  const [, startTransition] = useTransition();
  // Item sendo marcado/removido agora — mesmo padrão de feedback aplicado
  // em manutencao-checklist.tsx (pedido do usuário 30/08/2026).
  const [idProcessando, setIdProcessando] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const agora = hojePortoVelho();

  function aoMarcarFeita(id: string) {
    setIdProcessando(id);
    startTransition(async () => {
      await marcarFeita(id, manutencaoId);
      setIdProcessando(null);
    });
  }

  function aoRemover(id: string) {
    setIdProcessando(id);
    startTransition(async () => {
      await remover(id, manutencaoId);
      setIdProcessando(null);
    });
  }

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
        <input type="hidden" name="manutencaoId" value={manutencaoId} />
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
        <BotaoSubmit carregandoTexto="Agendando..." className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap">
          + Agendar
        </BotaoSubmit>
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
              {idProcessando === a.id ? (
                <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin border-gray-300 border-t-gray-600 shrink-0" />
              ) : (
                <input type="checkbox" checked={a.feito} onChange={() => aoMarcarFeita(a.id)} className="rounded" />
              )}
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
                onClick={() => aoRemover(a.id)}
                disabled={idProcessando === a.id}
                className="text-[11px] text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 disabled:cursor-wait"
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
