"use client";

import { useMemo, useState } from "react";
import { TIPOS_MATERIAL, PRIORIDADE_OPCOES } from "@/lib/marketing/opcoes";
import { BotaoSubmit } from "@/components/botao-submit";

type ParceiroOpcao = { id: string; nome: string };
type EmpreendimentoOpcao = { id: string; nome: string };
type ImovelOpcao = { id: string; id_legado: string | null; endereco: string | null };

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

function labelImovel(i: ImovelOpcao): string {
  const partes = [i.id_legado ?? i.id.slice(0, 8), i.endereco].filter(Boolean);
  return partes.join(" — ");
}

// Formulário de criação de uma nova Ordem de Marketing (card do quadro).
// Fica só com o essencial pra nascer o card — briefing detalhado, checklist
// e atividades são preenchidos depois na ficha (app/marketing/[id]/page.tsx),
// igual ao padrão de Manutenção/Gestões.
export function MarketingForm({
  corretores,
  administrativos,
  empreendimentos,
  imoveis,
  imovelIdInicial,
  action
}: {
  corretores: ParceiroOpcao[];
  administrativos: ParceiroOpcao[];
  empreendimentos: EmpreendimentoOpcao[];
  imoveis: ImovelOpcao[];
  imovelIdInicial?: string | null;
  action: (formData: FormData) => void;
}) {
  // Vínculo opcional com um imóvel cadastrado — pedido do usuário
  // (09/08/2026): "essas questões de marketing que implementamos ir para os
  // imóveis como relatório". Sem esse campo, só Ordens nascidas de um pedido
  // da Agenda do corretor com imóvel escolhido ganhavam esse vínculo — aqui
  // dá pra linkar manualmente também. Autocomplete por Id/endereço, mesmo
  // padrão de components/manutencao-form.tsx. Quando chega de "+ Nova ordem"
  // na ficha do Imóvel (?imovel_id=), já vem pré-selecionado.
  const imovelInicial = imovelIdInicial ? imoveis.find((i) => i.id === imovelIdInicial) ?? null : null;
  const [imovelId, setImovelId] = useState(imovelInicial?.id ?? "");
  const [buscaImovel, setBuscaImovel] = useState(imovelInicial ? labelImovel(imovelInicial) : "");
  const [listaImovelAberta, setListaImovelAberta] = useState(false);

  const imoveisFiltrados = useMemo(() => {
    const t = buscaImovel.trim().toLowerCase();
    if (!t) return imoveis.slice(0, 30);
    return imoveis.filter((i) => labelImovel(i).toLowerCase().includes(t)).slice(0, 30);
  }, [buscaImovel, imoveis]);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="imovel_id" value={imovelId} />

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
          <div className="relative">
            <label className={LABEL}>Imóvel vinculado (opcional)</label>
            <input
              className={CAMPO}
              placeholder="Buscar por Id ou endereço..."
              value={buscaImovel}
              onChange={(e) => {
                setBuscaImovel(e.target.value);
                setImovelId("");
                setListaImovelAberta(true);
              }}
              onFocus={() => setListaImovelAberta(true)}
              onBlur={() => setTimeout(() => setListaImovelAberta(false), 150)}
            />
            {listaImovelAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-56 overflow-auto shadow-lg">
                {imoveisFiltrados.length === 0 && <p className="text-xs text-gray-400 p-3">Nenhum imóvel encontrado.</p>}
                {imoveisFiltrados.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onMouseDown={() => {
                      setImovelId(i.id);
                      setBuscaImovel(labelImovel(i));
                      setListaImovelAberta(false);
                    }}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {labelImovel(i)}
                  </button>
                ))}
              </div>
            )}
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
