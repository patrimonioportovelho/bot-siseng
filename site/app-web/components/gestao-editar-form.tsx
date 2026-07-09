"use client";

import { useState } from "react";
import { formatValorEditavel, formatPercentual } from "@/lib/format";
import { COLUNAS_KANBAN, CHAVE_POSSE, CHAVE_POSSE_LABEL } from "@/lib/gestoes/opcoes";

type ParceiroOpcao = { id: string; nome: string };

type GestaoExistente = {
  id: string;
  parceiro_id: string | null;
  valor_venda: unknown;
  porc_honorario: unknown;
  prazo_gestao_dias: number | null;
  data_assinatura: Date | null;
  chave_posse: string;
  chave_com: string | null;
  coluna: string;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Ficha de edição da Gestão — mesmo padrão visual do ManutencaoEditarForm,
// mas com os campos do contrato de gestão em vez dos campos de manutenção.
// Cliente principal e Imóvel não são editáveis aqui (mostrados só como
// leitura no cabeçalho da página) — nasceram do formulário do portal e
// mudar o vínculo é raro o bastante pra não precisar de UI dedicada agora.
export function GestaoEditarForm({
  gestao,
  parceiros,
  action
}: {
  gestao: GestaoExistente;
  parceiros: ParceiroOpcao[];
  action: (formData: FormData) => void;
}) {
  const g = gestao;
  const [chavePosse, setChavePosse] = useState(g.chave_posse);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="gestaoId" value={g.id} />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Contrato</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Etapa (quadro)</label>
            <select className={CAMPO} name="coluna" defaultValue={g.coluna}>
              {COLUNAS_KANBAN.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Corretor responsável</label>
            <select className={CAMPO} name="parceiro_id" defaultValue={g.parceiro_id ?? ""}>
              <option value="">—</option>
              {parceiros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Valor de venda (R$)</label>
            <input className={CAMPO} name="valor_venda" placeholder="350.000,00" defaultValue={formatValorEditavel(g.valor_venda)} />
          </div>
          <div>
            <label className={LABEL}>Porcentagem honorários (%)</label>
            <input className={CAMPO} name="porc_honorario" placeholder="6" defaultValue={formatPercentual(g.porc_honorario)} />
          </div>
          <div>
            <label className={LABEL}>Prazo da gestão (dias)</label>
            <input className={CAMPO} name="prazo_gestao_dias" placeholder="90" defaultValue={g.prazo_gestao_dias ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Data de assinatura</label>
            <input type="date" className={CAMPO} name="data_assinatura" defaultValue={inputDate(g.data_assinatura)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Chave</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Posse da chave</label>
            <select className={CAMPO} name="chave_posse" value={chavePosse} onChange={(e) => setChavePosse(e.target.value)}>
              {CHAVE_POSSE.map((c) => (
                <option key={c} value={c}>
                  {CHAVE_POSSE_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          {chavePosse !== "imobiliaria" && (
            <div>
              <label className={LABEL}>Com quem (nome)</label>
              <input className={CAMPO} name="chave_com" defaultValue={g.chave_com ?? ""} placeholder="Ex.: João (corretor)" />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold">
          Salvar alterações
        </button>
      </div>
    </form>
  );
}
