"use client";

import { useRef, useState, useTransition } from "react";
import { formatDataCalendario } from "@/lib/format";
import { PECA_TIPOS_SUGESTOES, STATUS_PRODUCAO_OPCOES } from "@/lib/marketing/opcoes";
import { BotaoSubmit } from "@/components/botao-submit";

type ParceiroOpcao = { id: string; nome: string };

type Producao = {
  id: string;
  peca: string;
  roteiro: string | null;
  arquivos_brutos_url: string | null;
  versao_aprovacao_url: string | null;
  arquivo_final_url: string | null;
  revisoes: number;
  responsavel_parceiro_id: string | null;
  prazo_entrega: Date | string | null;
  data_captacao: Date | string | null;
  local: string | null;
  referencia: string | null;
  status: string;
};

const STATUS_COR: Record<string, string> = {
  Pendente: "bg-gray-100 text-gray-500 border-gray-200",
  "Em produção": "bg-[#33587F]/10 text-[#33587F] border-[#33587F]/30",
  "Em revisão": "bg-[#A9822E]/10 text-[#A9822E] border-[#A9822E]/30",
  Aprovado: "bg-primary/10 text-primary border-primary/30",
  Entregue: "bg-green-50 text-green-700 border-green-200"
};

const CAMPO = "text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary bg-white";

// Pipeline de produção peça a peça, dentro da ficha da Ordem (Fase 5c,
// 09/08/2026) — Notion "Produção". Uma Ordem pode virar várias peças (1
// vídeo + 3 stories, por exemplo), cada uma com seu próprio prazo, arquivos
// e nº de revisões.
export function MarketingProducoes({
  ordemId,
  producoes,
  administrativos,
  criar,
  atualizarLinks,
  atualizarStatus,
  incrementarRevisao,
  remover
}: {
  ordemId: string;
  producoes: Producao[];
  administrativos: ParceiroOpcao[];
  criar: (formData: FormData) => void;
  atualizarLinks: (formData: FormData) => void;
  atualizarStatus: (id: string, ordemId: string, status: string) => Promise<void>;
  incrementarRevisao: (id: string, ordemId: string) => Promise<void>;
  remover: (id: string, ordemId: string) => Promise<void>;
}) {
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [linksAbertos, setLinksAbertos] = useState<string | null>(null);
  // Peça sendo processada agora (status/revisão/remover) — mesmo padrão de
  // feedback aplicado nas outras listas com Server Action fora de <form>
  // (pedido do usuário 30/08/2026).
  const [idProcessando, setIdProcessando] = useState<string | null>(null);

  function aoAtualizarStatus(id: string, status: string) {
    setIdProcessando(id);
    startTransition(async () => {
      await atualizarStatus(id, ordemId, status);
      setIdProcessando(null);
    });
  }

  function aoIncrementarRevisao(id: string) {
    setIdProcessando(id);
    startTransition(async () => {
      await incrementarRevisao(id, ordemId);
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
      <div className="text-sm font-bold text-gray-800 mb-3">Produção — peças</div>

      <form
        ref={formRef}
        action={async (formData) => {
          await criar(formData);
          formRef.current?.reset();
        }}
        className="grid md:grid-cols-4 gap-2 mb-4"
      >
        <input type="hidden" name="ordemId" value={ordemId} />
        {/* Lista fechada em vez de texto+sugestão (pedido do usuário,
            09/08/2026: "Em produção é melhor colocar uma lista definida,
            fica mais fácil") — "Outro" já cobre o caso fora da lista. */}
        <select className={CAMPO} name="peca" defaultValue="" required>
          <option value="" disabled>
            Peça...
          </option>
          {PECA_TIPOS_SUGESTOES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className={CAMPO} name="responsavel_parceiro_id" defaultValue="">
          <option value="">Responsável...</option>
          {administrativos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <input name="data_captacao" type="date" className={CAMPO} title="Data de captação" />
        <input name="prazo_entrega" type="date" className={CAMPO} title="Prazo de entrega" />
        <input name="local" placeholder="Local (opcional)" className={CAMPO} />
        <input name="referencia" placeholder="Referência/inspiração (opcional)" className={CAMPO} />
        <input name="roteiro" placeholder="Roteiro (opcional)" className={CAMPO + " md:col-span-2"} />
        <BotaoSubmit className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap md:col-span-4" carregandoTexto="Adicionando...">
          + Adicionar peça
        </BotaoSubmit>
      </form>

      <div className="flex flex-col gap-2">
        {producoes.map((p) => (
          <div key={p.id} className="border border-gray-100 rounded-lg p-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-gray-800">{p.peca}</span>
                {p.responsavel_parceiro_id && (
                  <span className="text-[11px] text-gray-400"> · {administrativos.find((a) => a.id === p.responsavel_parceiro_id)?.nome ?? "—"}</span>
                )}
                {p.prazo_entrega && <span className="text-[11px] text-gray-400"> · Entrega: {formatDataCalendario(p.prazo_entrega)}</span>}
                {p.revisoes > 0 && <span className="text-[11px] text-[#A9822E]"> · {p.revisoes} revisão(ões)</span>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {idProcessando === p.id && (
                  <span className="w-3 h-3 border-2 rounded-full animate-spin border-gray-300 border-t-gray-600 shrink-0" />
                )}
                <select
                  value={p.status}
                  disabled={idProcessando === p.id}
                  onChange={(e) => aoAtualizarStatus(p.id, e.target.value)}
                  className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${STATUS_COR[p.status] ?? STATUS_COR.Pendente} disabled:opacity-60`}
                >
                  {STATUS_PRODUCAO_OPCOES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => aoIncrementarRevisao(p.id)}
                  disabled={idProcessando === p.id}
                  className="text-[11px] text-gray-400 hover:text-[#A9822E] disabled:cursor-wait"
                  title="Registrar uma rodada de alteração"
                >
                  +1 revisão
                </button>
                <button
                  type="button"
                  onClick={() => setLinksAbertos((atual) => (atual === p.id ? null : p.id))}
                  className="text-[11px] text-gray-400 hover:text-primary"
                >
                  arquivos
                </button>
                <button
                  type="button"
                  onClick={() => aoRemover(p.id)}
                  disabled={idProcessando === p.id}
                  className="text-[11px] text-gray-300 hover:text-red-500 disabled:cursor-wait"
                >
                  remover
                </button>
              </div>
            </div>
            {p.roteiro && <div className="text-[11px] text-gray-500 mt-1">{p.roteiro}</div>}

            {linksAbertos === p.id && (
              <form action={atualizarLinks} className="grid md:grid-cols-3 gap-2 mt-2 pt-2 border-t border-gray-50">
                <input type="hidden" name="producaoId" value={p.id} />
                <input type="hidden" name="ordemId" value={ordemId} />
                <input
                  name="arquivos_brutos_url"
                  placeholder="Link — arquivos brutos"
                  defaultValue={p.arquivos_brutos_url ?? ""}
                  className={CAMPO}
                />
                <input
                  name="versao_aprovacao_url"
                  placeholder="Link — versão pra aprovação"
                  defaultValue={p.versao_aprovacao_url ?? ""}
                  className={CAMPO}
                />
                <input
                  name="arquivo_final_url"
                  placeholder="Link — arquivo final"
                  defaultValue={p.arquivo_final_url ?? ""}
                  className={CAMPO}
                />
                <BotaoSubmit className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold md:col-span-3" carregandoTexto="Salvando...">
                  Salvar links
                </BotaoSubmit>
              </form>
            )}
          </div>
        ))}
        {producoes.length === 0 && <p className="text-xs text-gray-400">Nenhuma peça de produção ainda.</p>}
      </div>
    </div>
  );
}
