"use client";

import { useState } from "react";
import { BRIEFING_TIPOS, campoBriefing } from "@/lib/marketing/opcoes";

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Formulário de briefing dinâmico — a pessoa escolhe o tipo (5 modelos do
// Manual IMPACTO) e os campos daquele tipo aparecem na hora, sem recarregar
// a página. Salva tudo em briefing_dados (Json) via salvarBriefingAction,
// que também recalcula briefing_completo (regra: só sai de "Aguardando
// briefing" com todos os campos preenchidos — ver moverColunaAction).
export function MarketingBriefingForm({
  ordemId,
  briefingTipoAtual,
  briefingDadosAtuais,
  briefingCompleto,
  action
}: {
  ordemId: string;
  briefingTipoAtual: string | null;
  briefingDadosAtuais: Record<string, unknown> | null;
  briefingCompleto: boolean;
  action: (formData: FormData) => void;
}) {
  const [tipoSelecionado, setTipoSelecionado] = useState(briefingTipoAtual ?? "");
  const tipo = campoBriefing(tipoSelecionado);
  // Dados salvos só valem de referência pro MESMO tipo — trocar de tipo no
  // meio do caminho começa um briefing em branco (os campos são diferentes).
  const dadosParaExibir = tipoSelecionado === briefingTipoAtual ? briefingDadosAtuais : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Briefing</div>
        <span
          className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border ${
            briefingCompleto
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-[#A9822E]/10 text-[#A9822E] border-[#A9822E]/30"
          }`}
        >
          {briefingCompleto ? "Completo" : "Incompleto — só assim sai de Aguardando briefing"}
        </span>
      </div>

      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="ordemId" value={ordemId} />

        <div>
          <label className={LABEL}>Tipo de briefing</label>
          <select
            className={CAMPO}
            name="briefing_tipo"
            value={tipoSelecionado}
            onChange={(e) => setTipoSelecionado(e.target.value)}
          >
            <option value="">Escolha o tipo...</option>
            {BRIEFING_TIPOS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {tipo && (
          <div className="grid md:grid-cols-2 gap-3">
            {tipo.campos.map((campo) => {
              const valorAtual = (dadosParaExibir?.[campo.key] as string | undefined) ?? "";
              const full = campo.tipo === "textarea";
              return (
                <div key={campo.key} className={full ? "md:col-span-2" : undefined}>
                  <label className={LABEL}>{campo.label}</label>
                  {campo.tipo === "textarea" ? (
                    <textarea className={CAMPO} name={campo.key} defaultValue={valorAtual} rows={2} />
                  ) : (
                    <input
                      type={campo.tipo === "date" ? "date" : "text"}
                      className={CAMPO}
                      name={campo.key}
                      defaultValue={valorAtual}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tipo && (
          <div className="flex justify-end">
            <button type="submit" className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold">
              Salvar briefing
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
