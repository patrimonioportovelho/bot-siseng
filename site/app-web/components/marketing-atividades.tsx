"use client";

import { useRef, useState, useTransition } from "react";
import { formatDataCalendario, hojeInputDate, hojePortoVelho } from "@/lib/format";
import { TIPOS_ATIVIDADE, TIPO_ATIVIDADE_LABEL } from "@/lib/marketing/opcoes";
import { BotaoSubmit } from "@/components/botao-submit";

type Atividade = {
  id: string;
  tipo: string;
  titulo: string;
  data: Date | string;
  hora: string | null;
  feito: boolean;
  notas: string | null;
  cancelado: boolean;
  cancelado_motivo: string | null;
  cancelado_por_tipo: string | null;
};

const CANCELADO_POR_LABEL: Record<string, string> = {
  marketing: "Marketing",
  corretor: "Corretor"
};

// Mesmo componente de Gestões/Manutenção (components/gestao-atividades.tsx),
// só trocando ordemId no lugar de gestaoId. Essas atividades são a fonte
// que alimenta o calendário compartilhado (/manutencao/calendario).
export function MarketingAtividades({
  ordemId,
  atividades,
  adicionar,
  marcarFeita,
  remover
}: {
  ordemId: string;
  atividades: Atividade[];
  adicionar: (formData: FormData) => void;
  marcarFeita: (id: string, ordemId: string) => Promise<void>;
  remover: (id: string, ordemId: string) => Promise<void>;
}) {
  const [, startTransition] = useTransition();
  // Item sendo marcado/removido agora — mesmo padrão de feedback aplicado
  // em gestao-atividades.tsx/manutencao-atividades.tsx (pedido do usuário
  // 30/08/2026).
  const [idProcessando, setIdProcessando] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const agora = hojePortoVelho();

  function aoMarcarFeita(id: string) {
    setIdProcessando(id);
    startTransition(async () => {
      await marcarFeita(id, ordemId);
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

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-bold text-gray-800 mb-3">Nova atividade</div>

      <form
        ref={formRef}
        action={async (formData) => {
          await adicionar(formData);
          formRef.current?.reset();
        }}
        className="grid md:grid-cols-4 gap-2 mb-4"
      >
        <input type="hidden" name="ordemId" value={ordemId} />
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
        <input name="hora" type="time" className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary" title="Horário (opcional)" />
        <input
          name="notas"
          placeholder="Notas (opcional)"
          className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary md:col-span-3"
        />
        <BotaoSubmit className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap" carregandoTexto="Agendando...">
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
                a.cancelado ? "bg-red-50 border-red-200" : atrasada ? "bg-[#B14226]/5 border-[#B14226]/30" : "border-gray-100"
              }`}
            >
              {idProcessando === a.id ? (
                <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin border-gray-300 border-t-gray-600 shrink-0" />
              ) : (
                <input
                  type="checkbox"
                  checked={a.feito}
                  disabled={a.cancelado}
                  onChange={() => aoMarcarFeita(a.id)}
                  className="rounded"
                />
              )}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-xs ${
                    a.cancelado
                      ? "line-through text-red-500"
                      : a.feito
                        ? "line-through text-gray-400"
                        : atrasada
                          ? "text-[#B14226] font-medium"
                          : "text-gray-700"
                  }`}
                >
                  {TIPO_ATIVIDADE_LABEL[a.tipo] ?? a.tipo} — {a.titulo}
                </span>
                {a.notas && <div className="text-[11px] text-gray-400">{a.notas}</div>}
                {a.cancelado && (
                  <div className="text-[11px] text-red-600 mt-0.5">
                    Cancelado{a.cancelado_por_tipo ? ` por ${CANCELADO_POR_LABEL[a.cancelado_por_tipo] ?? a.cancelado_por_tipo}` : ""}
                    {a.cancelado_motivo ? `: "${a.cancelado_motivo}"` : ""}
                  </div>
                )}
              </div>
              <span className={`text-[11px] whitespace-nowrap ${a.cancelado ? "text-red-500" : atrasada ? "text-[#B14226]" : "text-gray-400"}`}>
                {formatDataCalendario(dataAtividade)}
                {a.hora ? ` às ${a.hora}` : ""}
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
