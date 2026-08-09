"use client";

import { TIPOS_MATERIAL, PRIORIDADE_OPCOES } from "@/lib/marketing/opcoes";
import { BotaoSubmit } from "@/components/botao-submit";

type ParceiroOpcao = { id: string; nome: string };
type EmpreendimentoOpcao = { id: string; nome: string };

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Formulário de criação de uma nova Ordem de Marketing (card do quadro).
// Fica só com o essencial pra nascer o card — briefing detalhado, checklist
// e atividades são preenchidos depois na ficha (app/marketing/[id]/page.tsx),
// igual ao padrão de Manutenção/Gestões.
export function MarketingForm({
  corretores,
  administrativos,
  empreendimentos,
  action
}: {
  corretores: ParceiroOpcao[];
  administrativos: ParceiroOpcao[];
  empreendimentos: EmpreendimentoOpcao[];
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className={LABEL}>Título</label>
            <input className={CAMPO} name="titulo" placeholder="Ex.: Vídeo de captação — Rua das Flores, 123" required />
          </div>
          <div>
            <label className={LABEL}>Corretor solicitante</label>
            <select className={CAMPO} name="solicitante_parceiro_id" defaultValue="">
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
            <select className={CAMPO} name="tipo" defaultValue="">
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
            <select className={CAMPO} name="prioridade" defaultValue="Normal">
              {PRIORIDADE_OPCOES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Responsável atual</label>
            <select className={CAMPO} name="responsavel_atual_id" defaultValue="">
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
            <select className={CAMPO} name="responsavel_aprovacao_id" defaultValue="">
              <option value="">—</option>
              {administrativos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Empreendimento cadastrado</label>
            <select className={CAMPO} name="empreendimento_id" defaultValue="">
              <option value="">— nenhum / usar texto livre abaixo —</option>
              {empreendimentos.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Empreendimento (texto livre)</label>
            <input className={CAMPO} name="empreendimento" placeholder="Se não tiver cadastro" />
          </div>
          <div>
            <label className={LABEL}>Canal</label>
            <input className={CAMPO} name="canal" placeholder="Instagram, site, WhatsApp..." />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Público-alvo</label>
            <input className={CAMPO} name="publico" />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Objetivo</label>
            <input className={CAMPO} name="objetivo" placeholder="Ex.: gerar leads pra visita" />
          </div>
          <div>
            <label className={LABEL}>Prazo do roteiro</label>
            <input type="date" className={CAMPO} name="prazo_roteiro" />
          </div>
          <div>
            <label className={LABEL}>Prazo de entrega</label>
            <input type="date" className={CAMPO} name="prazo_entrega" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <BotaoSubmit className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold" carregandoTexto="Criando...">
          Criar ordem
        </BotaoSubmit>
      </div>
    </form>
  );
}
