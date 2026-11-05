"use client";

import { memo, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DockArraste, useAutoRolagemArraste } from "@/components/dock-arraste";
import { useQuadroOtimista } from "@/components/use-quadro-otimista";
import { ETAPAS_FUNIL, ETAPA_FUNIL_POR_ID, movimentoPermitido, type EtapaFunilId } from "@/lib/clientes/funil";
import type { ClienteFunil } from "@/lib/clientes/funil-servidor";

// Quadro (Kanban) de Clientes. A etapa de cada cliente é calculada no servidor a partir dos
// vínculos, contratos, propostas e avaliações (ver lib/clientes/funil.ts), então o quadro e a
// lista concordam sempre; a tela se atualiza sozinha a cada 30 s e ao voltar para a aba, e um
// cliente novo (por exemplo, cadastrado pelo corretor no portal) aparece em Leads. Só dá para
// arrastar entre Leads e Em atendimento; as outras colunas são automáticas.

const POR_COLUNA_INICIAL = 40;
const ATUALIZAR_A_CADA_MS = 30_000;

function formatarDias(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export function ClientesKanban({
  cards: cardsServidor,
  mover
}: {
  cards: ClienteFunil[];
  mover: (id: string, destino: EtapaFunilId) => Promise<{ ok: boolean; erro?: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // O card muda de coluna na hora e a gravação roda em segundo plano (mesmo comportamento dos
  // outros quadros); se o servidor recusar, o card volta e o motivo aparece.
  const { itens: cards, moverPara, erro, limparErro } = useQuadroOtimista<ClienteFunil>(cardsServidor, mover as (id: string, destino: string) => Promise<{ ok: boolean; erro?: string }>, (c, destino) =>
    destino === "atendimento"
      ? { motivo: "Marcado em atendimento", voltaParaLeads: true, atendimentoDesde: new Date().toISOString() }
      : { motivo: "Apenas cadastrado", voltaParaLeads: false, atendimentoDesde: null }
  );

  const [avisoRegra, setAvisoRegra] = useState<string | null>(null);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  useAutoRolagemArraste(arrastandoId !== null);
  const [colunaAlvo, setColunaAlvo] = useState<EtapaFunilId | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroCorretor, setFiltroCorretor] = useState("");
  const [soSemContato, setSoSemContato] = useState(false);
  const [limites, setLimites] = useState<Partial<Record<EtapaFunilId, number>>>({});

  // Atualização automática: traz clientes novos e as mudanças de etapa que vierem de outras telas.
  useEffect(() => {
    const atualizar = () => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    };
    const timer = window.setInterval(atualizar, ATUALIZAR_A_CADA_MS);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [router]);

  const corretores = useMemo(
    () => [...new Set(cards.map((c) => c.corretorNome).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [cards]
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = busca.replace(/\D/g, "");
    return cards.filter((c) => {
      if (termo && !c.nome.toLowerCase().includes(termo) && !(c.idLegado ?? "").toLowerCase().includes(termo) && !(digitos && (c.telefoneDigitos ?? "").includes(digitos))) return false;
      if (filtroCorretor === "__sem") {
        if (c.corretorNome) return false;
      } else if (filtroCorretor === "__inativo") {
        if (c.corretorAtivo) return false; // sem corretor ativo: precisa de transferência
      } else if (filtroCorretor && c.corretorNome !== filtroCorretor) return false;
      if (soSemContato && c.ultimoContatoDias !== null && c.ultimoContatoDias < 7) return false;
      return true;
    });
  }, [cards, busca, filtroCorretor, soSemContato]);

  const iniciarArraste = useCallback((id: string) => setArrastandoId(id), []);
  const terminarArraste = useCallback(() => {
    setArrastandoId(null);
    setColunaAlvo(null);
  }, []);

  function aoSoltar(destino: EtapaFunilId) {
    setColunaAlvo(null);
    if (!arrastandoId) return;
    const id = arrastandoId;
    setArrastandoId(null);
    const c = cards.find((x) => x.id === id);
    if (!c || c.coluna === destino) return;
    const regra = movimentoPermitido({ etapa: c.coluna, motivo: c.motivo, papeis: c.papeis, voltaParaLeads: c.voltaParaLeads }, destino);
    if (!regra.ok) {
      setAvisoRegra(regra.erro);
      return;
    }
    setAvisoRegra(null);
    moverPara(id, destino);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, Id ou telefone..."
          className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full sm:w-64 outline-none focus:border-primary bg-white"
        />
        <select value={filtroCorretor} onChange={(e) => setFiltroCorretor(e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-primary">
          <option value="">Todos os corretores</option>
          <option value="__sem">Sem corretor</option>
          <option value="__inativo">Sem corretor ativo (precisa de transferência)</option>
          {corretores.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={soSemContato} onChange={(e) => setSoSemContato(e.target.checked)} />
          Sem contato há 7 dias ou mais
        </label>
        <span className="text-[11px] text-gray-400 ml-auto">{filtrados.length} de {cards.length} clientes · atualiza sozinho</span>
      </div>

      {(erro || avisoRegra) && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <span>{erro ?? avisoRegra}</span>
          <button
            type="button"
            onClick={() => {
              limparErro();
              setAvisoRegra(null);
            }}
            className="text-red-400 hover:text-red-600"
          >
            ×
          </button>
        </div>
      )}

      <DockArraste
        ativo={arrastandoId !== null}
        colunas={ETAPAS_FUNIL.filter((e) => e.manual).map((c) => ({ id: c.id, label: c.label, cor: c.cor }))}
        aoSoltar={(id) => aoSoltar(id as EtapaFunilId)}
      />
      <div className="flex flex-col md:flex-row gap-3 md:overflow-x-auto pb-2">
        {ETAPAS_FUNIL.map((coluna) => {
          const doGrupo = filtrados.filter((c) => c.coluna === coluna.id);
          const limite = limites[coluna.id] ?? POR_COLUNA_INICIAL;
          const visiveis = doGrupo.slice(0, limite);
          const emDestaque = colunaAlvo === coluna.id;
          return (
            <div
              key={coluna.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (colunaAlvo !== coluna.id) setColunaAlvo(coluna.id);
              }}
              onDragLeave={() => setColunaAlvo((a) => (a === coluna.id ? null : a))}
              onDrop={() => aoSoltar(coluna.id)}
              className={`md:w-72 md:shrink-0 rounded-xl border p-2 flex flex-col gap-2 transition-colors ${emDestaque ? "bg-primary/5 border-primary/40" : "bg-gray-50 border-gray-200"}`}
            >
              <div className={`rounded-lg border px-2 py-1.5 ${coluna.cor}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold truncate">{coluna.label}</span>
                  <span className="text-[11px] font-semibold shrink-0">{doGrupo.length}</span>
                </div>
                <div className="text-[10px] opacity-80 leading-snug mt-0.5">{coluna.dica}</div>
                {!coluna.manual && <div className="text-[10px] opacity-60 mt-0.5">Etapa automática</div>}
              </div>

              <div className="flex flex-col gap-2 md:max-h-[68vh] md:overflow-y-auto">
                {visiveis.map((c) => (
                  <Cartao key={c.id} c={c} arrastando={arrastandoId === c.id} aoArrastar={iniciarArraste} aoSoltarFim={terminarArraste} />
                ))}
                {doGrupo.length === 0 && <div className="text-[11px] text-gray-400 text-center py-4">Nenhum cliente</div>}
                {doGrupo.length > limite && (
                  <button
                    type="button"
                    onClick={() => setLimites((l) => ({ ...l, [coluna.id]: limite + POR_COLUNA_INICIAL }))}
                    className="text-[11px] text-primary border border-primary/30 rounded-lg py-1.5 hover:bg-primary/5"
                  >
                    Mostrar mais ({doGrupo.length - limite})
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const Cartao = memo(function Cartao({
  c,
  arrastando,
  aoArrastar,
  aoSoltarFim
}: {
  c: ClienteFunil;
  arrastando: boolean;
  aoArrastar: (id: string) => void;
  aoSoltarFim: () => void;
}) {
  const diasCadastro = formatarDias(c.criadoEm);
  const emAtendimento = c.coluna === "atendimento" && c.atendimentoDesde ? formatarDias(c.atendimentoDesde) : null;
  const precisaContato = c.coluna === "leads" || c.coluna === "atendimento" || c.coluna === "proposta" || c.coluna === "negocio";
  const outrosPapeis = c.papeis.filter((p) => ETAPA_FUNIL_POR_ID.get(c.coluna)?.label.replace(/s$/, "") !== p);

  return (
    <Link
      href={`/clientes/${c.id}/etiqueta`}
      draggable
      onDragStart={() => aoArrastar(c.id)}
      onDragEnd={aoSoltarFim}
      className={`bg-white border border-gray-200 hover:border-primary/40 rounded-lg p-2.5 flex flex-col gap-1 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing ${arrastando ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-gray-800 leading-snug">{c.nome}</span>
        <span className="text-[10px] text-gray-400 shrink-0" title="Dias desde o cadastro">
          {emAtendimento !== null ? `${emAtendimento}d` : `${diasCadastro}d`}
        </span>
      </div>
      <div className="text-[10px] text-gray-500 leading-snug">{c.motivo}</div>
      {outrosPapeis.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {outrosPapeis.map((p) => (
            <span key={p} className="text-[9px] font-bold rounded-full px-1.5 py-0.5 border bg-gray-50 text-gray-500 border-gray-200">
              {p}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
        <span className="truncate">{c.telefone ?? "Sem telefone"}</span>
        <span className="truncate shrink-0 max-w-[45%]">{c.corretorNome?.split(" ")[0] ?? "—"}</span>
      </div>
      {!c.corretorAtivo && <div className="text-[10px] text-red-600">Sem corretor ativo</div>}
      {precisaContato && (
        <div className={`text-[10px] ${c.ultimoContatoDias === null ? "text-amber-600" : c.ultimoContatoDias >= 7 ? "text-red-600" : "text-gray-400"}`}>
          {c.ultimoContatoDias === null ? "Nunca contatado" : `Contato há ${c.ultimoContatoDias}d`}
        </div>
      )}
    </Link>
  );
});
