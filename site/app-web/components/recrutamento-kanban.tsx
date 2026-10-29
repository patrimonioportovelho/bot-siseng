"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { COLUNAS, type ColunaId } from "@/lib/recrutamento/opcoes";
import { CampoSelectAuto, type ResultadoSalvar } from "@/components/recrutamento-campos";

export type MetricasCard = {
  captacoes: number;
  captacoes90d: number;
  diasAtePrimeiraCaptacao: number | null;
  clientes: number;
  propostas: number;
  locacoes: number;
  vendas: number;
};

export type CardRecrutamento = {
  id: string;
  nome: string;
  telefone: string | null; // já formatado
  coluna: ColunaId;
  responsavelId: string | null;
  responsavelNome: string | null;
  proximaAcaoData: string | null; // yyyy-mm-dd
  proximaAcaoTexto: string | null;
  diasNaEtapa: number;
  ultimoContatoDias: number | null; // null = nunca
  totalContatos: number;
  diasNaCasa: number | null;
  dataSaida: string | null; // dd/mm/aaaa
  funcaoAtual: string;
  metricas: MetricasCard | null;
  treinamentoFeitos: number;
  treinamentoTotal: number;
};

type OpcaoResponsavel = { id: string; nome: string };

const META_CAPTACOES = 9;

function primeiroNome(nome: string | null) {
  return nome ? nome.split(" ")[0] : null;
}

function situacaoRetorno(data: string | null, hoje: string): "atrasado" | "hoje" | "futuro" | "sem" {
  if (!data) return "sem";
  if (data < hoje) return "atrasado";
  if (data === hoje) return "hoje";
  return "futuro";
}

function formatarData(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function RecrutamentoKanban({
  cards,
  hoje,
  responsaveis,
  responsavelPorEtapa,
  moverCard,
  definirResponsavelEtapa
}: {
  cards: CardRecrutamento[];
  hoje: string;
  responsaveis: OpcaoResponsavel[];
  responsavelPorEtapa: Record<string, string | null>;
  moverCard: (id: string, destino: ColunaId) => Promise<void>;
  definirResponsavelEtapa: (etapa: string, responsavelId: string | null) => Promise<ResultadoSalvar>;
}) {
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<ColunaId | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroResp, setFiltroResp] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);
  const [, startTransition] = useTransition();

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return cards.filter((c) => {
      if (termo && !c.nome.toLowerCase().includes(termo) && !(c.telefone ?? "").includes(termo)) return false;
      if (filtroResp === "__sem") {
        if (c.responsavelId) return false;
      } else if (filtroResp && c.responsavelId !== filtroResp) return false;
      if (soPendentes) {
        const s = situacaoRetorno(c.proximaAcaoData, hoje);
        if (s !== "atrasado" && s !== "hoje") return false;
      }
      return true;
    });
  }, [cards, busca, filtroResp, soPendentes, hoje]);

  // Faixa de resumo — só do funil (quem ainda está sendo recrutado).
  const resumo = useMemo(() => {
    const funil = cards.filter((c) => COLUNAS.find((x) => x.id === c.coluna)?.grupo === "funil");
    return {
      atrasados: funil.filter((c) => situacaoRetorno(c.proximaAcaoData, hoje) === "atrasado").length,
      hoje: funil.filter((c) => situacaoRetorno(c.proximaAcaoData, hoje) === "hoje").length,
      semRetorno: funil.filter((c) => c.coluna !== "Em treinamento" && !c.proximaAcaoData).length,
      nuncaContatados: funil.filter((c) => c.ultimoContatoDias === null).length,
      total: funil.length
    };
  }, [cards, hoje]);

  function aoSoltar(coluna: ColunaId) {
    setColunaAlvo(null);
    if (!arrastandoId) return;
    const id = arrastandoId;
    setArrastandoId(null);
    if (cards.find((c) => c.id === id)?.coluna === coluna) return;
    setErro(null);
    startTransition(() => {
      moverCard(id, coluna).catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : "Não foi possível mover o card.");
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Resumo do funil */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Resumo rotulo="No funil" valor={resumo.total} />
        <Resumo rotulo="Retornos atrasados" valor={resumo.atrasados} destaque={resumo.atrasados > 0 ? "vermelho" : undefined} />
        <Resumo rotulo="Retornos hoje" valor={resumo.hoje} destaque={resumo.hoje > 0 ? "ambar" : undefined} />
        <Resumo rotulo="Sem retorno agendado" valor={resumo.semRetorno} />
        <Resumo rotulo="Nunca contatados" valor={resumo.nuncaContatados} />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full sm:w-64 outline-none focus:border-primary bg-white"
        />
        <select
          value={filtroResp}
          onChange={(e) => setFiltroResp(e.target.value)}
          className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-primary"
        >
          <option value="">Todos os responsáveis</option>
          <option value="__sem">Sem responsável</option>
          {responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
          Só retornos de hoje ou atrasados
        </label>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <span>{erro}</span>
          <button type="button" onClick={() => setErro(null)} className="text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      )}

      {/* Quadro */}
      <div className="flex flex-col md:flex-row gap-3 md:overflow-x-auto pb-2">
        {COLUNAS.map((coluna) => {
          const doGrupo = filtrados.filter((c) => c.coluna === coluna.id);
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
              className={`md:w-72 md:shrink-0 rounded-xl border p-2 flex flex-col gap-2 transition-colors ${
                emDestaque ? "bg-primary/5 border-primary/40" : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className={`rounded-lg border px-2 py-1.5 ${coluna.cor}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold truncate">{coluna.label}</span>
                  <span className="text-[11px] font-semibold shrink-0">{doGrupo.length}</span>
                </div>
                <div className="text-[10px] opacity-80 leading-snug mt-0.5">{coluna.dica}</div>
                <div className="mt-1.5">
                  <CampoSelectAuto
                    valor={responsavelPorEtapa[coluna.id] ?? null}
                    vazio="Responsável da etapa…"
                    opcoes={responsaveis.map((r) => ({ valor: r.id, rotulo: r.nome }))}
                    salvar={(v) => definirResponsavelEtapa(coluna.id, v)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 md:max-h-[62vh] md:overflow-y-auto">
                {doGrupo.map((c) => (
                  <Cartao
                    key={c.id}
                    c={c}
                    hoje={hoje}
                    arrastando={arrastandoId === c.id}
                    aoArrastar={() => setArrastandoId(c.id)}
                    aoSoltarFim={() => {
                      setArrastandoId(null);
                      setColunaAlvo(null);
                    }}
                  />
                ))}
                {doGrupo.length === 0 && <div className="text-[11px] text-gray-400 text-center py-4">Nenhum card</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: "vermelho" | "ambar" }) {
  const cor =
    destaque === "vermelho"
      ? "bg-red-50 border-red-200 text-red-700"
      : destaque === "ambar"
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-white border-gray-200 text-gray-800";
  return (
    <div className={`border rounded-lg px-3 py-2 ${cor}`}>
      <div className="text-[10px] opacity-70">{rotulo}</div>
      <div className="text-base font-bold">{valor}</div>
    </div>
  );
}

function Cartao({
  c,
  hoje,
  arrastando,
  aoArrastar,
  aoSoltarFim
}: {
  c: CardRecrutamento;
  hoje: string;
  arrastando: boolean;
  aoArrastar: () => void;
  aoSoltarFim: () => void;
}) {
  const grupo = COLUNAS.find((x) => x.id === c.coluna)?.grupo;
  const retorno = situacaoRetorno(c.proximaAcaoData, hoje);
  const atrasado = grupo === "funil" && retorno === "atrasado";

  return (
    <Link
      href={`/recrutamento/${c.id}`}
      draggable
      onDragStart={aoArrastar}
      onDragEnd={aoSoltarFim}
      className={`bg-white border rounded-lg p-2.5 flex flex-col gap-1 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing ${
        arrastando ? "opacity-50" : ""
      } ${atrasado ? "border-red-300" : "border-gray-200 hover:border-primary/40"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-gray-800 leading-snug">{c.nome}</span>
        {grupo === "funil" && (
          <span className="text-[10px] text-gray-400 shrink-0" title="Tempo nesta etapa">
            {c.diasNaEtapa}d
          </span>
        )}
      </div>

      {c.telefone && grupo !== "equipe" && <div className="text-[11px] text-gray-500">{c.telefone}</div>}

      {grupo === "funil" && (
        <>
          <div className="flex items-center gap-1 flex-wrap">
            {retorno === "atrasado" && <Selo cor="vermelho">Retorno atrasado · {formatarData(c.proximaAcaoData!)}</Selo>}
            {retorno === "hoje" && <Selo cor="ambar">Retorno hoje</Selo>}
            {retorno === "futuro" && <Selo cor="cinza">Retorno {formatarData(c.proximaAcaoData!)}</Selo>}
            {retorno === "sem" && c.coluna !== "Em treinamento" && <Selo cor="cinza">Sem retorno agendado</Selo>}
          </div>
          {c.proximaAcaoTexto && <div className="text-[11px] text-gray-600 leading-snug">{c.proximaAcaoTexto}</div>}
          <div className="text-[10px] text-gray-400">
            {c.ultimoContatoDias === null
              ? "Nunca contatado"
              : c.ultimoContatoDias === 0
              ? "Contato hoje"
              : `Último contato há ${c.ultimoContatoDias} dia(s)`}
            {c.totalContatos > 0 && ` · ${c.totalContatos} contato(s)`}
          </div>
          {c.coluna === "Em treinamento" && c.treinamentoTotal > 0 && (
            <Barra rotulo={`Treinamentos ${c.treinamentoFeitos}/${c.treinamentoTotal}`} valor={c.treinamentoFeitos} total={c.treinamentoTotal} />
          )}
        </>
      )}

      {grupo === "equipe" && (
        <>
          <div className="text-[10px] text-gray-400">{c.diasNaCasa !== null ? `${c.diasNaCasa} dias na casa` : "Sem data de entrada"}</div>
          {c.metricas && (
            <>
              <Barra
                rotulo={`Captações ${c.metricas.captacoes} (90 dias: ${c.metricas.captacoes90d}/${META_CAPTACOES})`}
                valor={Math.min(c.metricas.captacoes90d, META_CAPTACOES)}
                total={META_CAPTACOES}
              />
              <div className="flex flex-wrap gap-1">
                <Chip rotulo="Clientes" valor={c.metricas.clientes} />
                <Chip rotulo="Propostas" valor={c.metricas.propostas} />
                <Chip rotulo="Locações" valor={c.metricas.locacoes} />
                <Chip rotulo="Vendas" valor={c.metricas.vendas} />
              </div>
              <div className="text-[10px] text-gray-400">
                {c.metricas.diasAtePrimeiraCaptacao !== null
                  ? `1ª captação em ${c.metricas.diasAtePrimeiraCaptacao} dia(s)`
                  : "Ainda sem captação"}
              </div>
            </>
          )}
        </>
      )}

      {c.coluna === "saida" && (
        <div className="text-[10px] text-gray-400">
          Saiu em {c.dataSaida ?? "—"} · agora {c.funcaoAtual}
        </div>
      )}

      {grupo !== "fim" && (
        <div className="text-[10px] text-gray-500">
          Responsável: <span className="font-medium">{primeiroNome(c.responsavelNome) ?? "—"}</span>
        </div>
      )}
    </Link>
  );
}

function Selo({ cor, children }: { cor: "vermelho" | "ambar" | "cinza"; children: React.ReactNode }) {
  const cls =
    cor === "vermelho"
      ? "bg-red-50 text-red-600 border-red-200"
      : cor === "ambar"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-gray-50 text-gray-500 border-gray-200";
  return <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 border ${cls}`}>{children}</span>;
}

function Chip({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <span className="text-[10px] bg-gray-50 border border-gray-200 text-gray-600 rounded px-1.5 py-0.5">
      {rotulo} <strong className="text-gray-800">{valor}</strong>
    </span>
  );
}

function Barra({ rotulo, valor, total }: { rotulo: string; valor: number; total: number }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div>
      <div className="text-[10px] text-gray-500 mb-0.5">{rotulo}</div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
