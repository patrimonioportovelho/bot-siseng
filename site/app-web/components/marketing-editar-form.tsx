"use client";

import { TIPOS_MATERIAL, PRIORIDADE_OPCOES, APROVACAO_STATUS_OPCOES } from "@/lib/marketing/opcoes";

type ParceiroOpcao = { id: string; nome: string };

type OrdemExistente = {
  id: string;
  titulo: string;
  solicitante_parceiro_id: string | null;
  tipo: string | null;
  objetivo: string | null;
  publico: string | null;
  empreendimento: string | null;
  canal: string | null;
  prioridade: string;
  prazo_roteiro: Date | null;
  prazo_entrega: Date | null;
  data_publicacao: Date | null;
  responsavel_atual_id: string | null;
  responsavel_aprovacao_id: string | null;
  bloqueio: string | null;
  link_arquivos: string | null;
  aprovacao_status: string | null;
  resultados_texto: string | null;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Ficha de edição da Ordem de Marketing — mesmo padrão visual do
// GestaoEditarForm/ManutencaoEditarForm. A etapa (coluna) não é editada
// aqui — só pelo arrastar-e-soltar do quadro (components/marketing-kanban.tsx),
// igual ao resto do sistema. O responsável atual só pode vir da lista de
// Parceiros Administrativo + Ativo (pedido do usuário, 09/08/2026) — ver
// lib/parceiros/administrativos.ts.
export function MarketingEditarForm({
  ordem,
  corretores,
  administrativos,
  action
}: {
  ordem: OrdemExistente;
  corretores: ParceiroOpcao[];
  administrativos: ParceiroOpcao[];
  action: (formData: FormData) => void;
}) {
  const o = ordem;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="ordemId" value={o.id} />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Demanda</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className={LABEL}>Título</label>
            <input className={CAMPO} name="titulo" defaultValue={o.titulo} required />
          </div>
          <div>
            <label className={LABEL}>Corretor solicitante</label>
            <select className={CAMPO} name="solicitante_parceiro_id" defaultValue={o.solicitante_parceiro_id ?? ""}>
              <option value="">—</option>
              {corretores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Tipo de material</label>
            <select className={CAMPO} name="tipo" defaultValue={o.tipo ?? ""}>
              <option value="">—</option>
              {TIPOS_MATERIAL.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Prioridade</label>
            <select className={CAMPO} name="prioridade" defaultValue={o.prioridade}>
              {PRIORIDADE_OPCOES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Responsável atual</label>
            <select className={CAMPO} name="responsavel_atual_id" defaultValue={o.responsavel_atual_id ?? ""}>
              <option value="">—</option>
              {administrativos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Responsável pela aprovação</label>
            <select className={CAMPO} name="responsavel_aprovacao_id" defaultValue={o.responsavel_aprovacao_id ?? ""}>
              <option value="">—</option>
              {administrativos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Empreendimento</label>
            <input className={CAMPO} name="empreendimento" defaultValue={o.empreendimento ?? ""} placeholder="Nome do empreendimento (se houver)" />
          </div>
          <div>
            <label className={LABEL}>Canal</label>
            <input className={CAMPO} name="canal" defaultValue={o.canal ?? ""} placeholder="Instagram, site, WhatsApp..." />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Público-alvo</label>
            <input className={CAMPO} name="publico" defaultValue={o.publico ?? ""} />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Objetivo</label>
            <input className={CAMPO} name="objetivo" defaultValue={o.objetivo ?? ""} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Prazos</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Prazo do roteiro</label>
            <input type="date" className={CAMPO} name="prazo_roteiro" defaultValue={inputDate(o.prazo_roteiro)} />
          </div>
          <div>
            <label className={LABEL}>Prazo de entrega</label>
            <input type="date" className={CAMPO} name="prazo_entrega" defaultValue={inputDate(o.prazo_entrega)} />
          </div>
          <div>
            <label className={LABEL}>Data de publicação</label>
            <input type="date" className={CAMPO} name="data_publicacao" defaultValue={inputDate(o.data_publicacao)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Andamento</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Bloqueio (o que está travando)</label>
            <input className={CAMPO} name="bloqueio" defaultValue={o.bloqueio ?? ""} placeholder="Ex.: aguardando fotos do corretor" />
          </div>
          <div>
            <label className={LABEL}>Link dos arquivos</label>
            <input className={CAMPO} name="link_arquivos" defaultValue={o.link_arquivos ?? ""} placeholder="Drive, WeTransfer..." />
          </div>
          <div>
            <label className={LABEL}>Situação da aprovação</label>
            <select className={CAMPO} name="aprovacao_status" defaultValue={o.aprovacao_status ?? ""}>
              <option value="">—</option>
              {APROVACAO_STATUS_OPCOES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Resultados (métricas, observações)</label>
            <input className={CAMPO} name="resultados_texto" defaultValue={o.resultados_texto ?? ""} />
          </div>
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
