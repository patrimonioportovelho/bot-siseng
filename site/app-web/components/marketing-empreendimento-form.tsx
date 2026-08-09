"use client";

import { STATUS_EMPREENDIMENTO_OPCOES } from "@/lib/marketing/opcoes";

type ParceiroOpcao = { id: string; nome: string };

type EmpreendimentoExistente = {
  id: string;
  nome: string;
  construtora: string | null;
  categoria: string | null;
  diferenciais: string | null;
  publico_alvo: string | null;
  faixa_preco: string | null;
  localizacao: string | null;
  data_lancamento: Date | null;
  cta_principal: string | null;
  objecoes_principais: string | null;
  promessa_central: string | null;
  link_materiais: string | null;
  responsavel_parceiro_id: string | null;
  status: string;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const AREA = CAMPO + " min-h-[70px] resize-y";
const LABEL = "text-xs text-gray-600 block mb-1";

// Formulário de cadastro de Empreendimento (Fase 5a, 09/08/2026) — mesmo
// padrão visual dos outros formulários de Marketing. Serve tanto pra criar
// (empreendimento === null) quanto pra editar.
export function MarketingEmpreendimentoForm({
  empreendimento,
  administrativos,
  action
}: {
  empreendimento: EmpreendimentoExistente | null;
  administrativos: ParceiroOpcao[];
  action: (formData: FormData) => void;
}) {
  const e = empreendimento;

  return (
    <form action={action} className="flex flex-col gap-5">
      {e && <input type="hidden" name="empreendimentoId" value={e.id} />}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Dados gerais</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className={LABEL}>Nome</label>
            <input className={CAMPO} name="nome" defaultValue={e?.nome ?? ""} required />
          </div>
          <div>
            <label className={LABEL}>Construtora</label>
            <input className={CAMPO} name="construtora" defaultValue={e?.construtora ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Categoria</label>
            <input className={CAMPO} name="categoria" defaultValue={e?.categoria ?? ""} placeholder="Residencial, comercial, loteamento..." />
          </div>
          <div>
            <label className={LABEL}>Faixa de preço</label>
            <input className={CAMPO} name="faixa_preco" defaultValue={e?.faixa_preco ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Localização</label>
            <input className={CAMPO} name="localizacao" defaultValue={e?.localizacao ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Data de lançamento</label>
            <input type="date" className={CAMPO} name="data_lancamento" defaultValue={inputDate(e?.data_lancamento ?? null)} />
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select className={CAMPO} name="status" defaultValue={e?.status ?? "Ativo"}>
              {STATUS_EMPREENDIMENTO_OPCOES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Responsável</label>
            <select className={CAMPO} name="responsavel_parceiro_id" defaultValue={e?.responsavel_parceiro_id ?? ""}>
              <option value="">—</option>
              {administrativos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Público-alvo</label>
            <input className={CAMPO} name="publico_alvo" defaultValue={e?.publico_alvo ?? ""} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Mensagem e argumentos de venda</div>
        <div className="grid gap-3">
          <div>
            <label className={LABEL}>Promessa central</label>
            <textarea className={AREA} name="promessa_central" defaultValue={e?.promessa_central ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Diferenciais</label>
            <textarea className={AREA} name="diferenciais" defaultValue={e?.diferenciais ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Objeções principais</label>
            <textarea className={AREA} name="objecoes_principais" defaultValue={e?.objecoes_principais ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Chamada para ação (CTA) principal</label>
            <input className={CAMPO} name="cta_principal" defaultValue={e?.cta_principal ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Link de materiais</label>
            <input className={CAMPO} name="link_materiais" defaultValue={e?.link_materiais ?? ""} placeholder="Drive, WeTransfer..." />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold">
          {e ? "Salvar alterações" : "Cadastrar empreendimento"}
        </button>
      </div>
    </form>
  );
}
