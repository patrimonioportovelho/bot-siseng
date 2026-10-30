"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { COLUNAS_FIN, COLUNA_FIN_POR_ID, ENCERRAMENTOS, situacaoSla, type ColunaFinId } from "@/lib/financiamento/quadro";
import { CampoSelectAuto, type ResultadoSalvar } from "@/components/recrutamento-campos";

export type CardFinanciamento = {
  id: string;
  idLegado: string | null;
  cliente: string;
  telefone: string | null;
  banco: string | null;
  parceiroId: string | null;
  parceiroNome: string | null;
  tipoAvaliacao: string | null;
  statusAvaliacao: string;
  statusAndamento: string | null; // normalizado
  coluna: ColunaFinId;
  imovel: string | null;
  valor: number | null;
  validade: string | null; // yyyy-mm-dd
  responsavelId: string | null;
  responsavelNome: string | null;
  proximaAcaoData: string | null;
  proximaAcaoTexto: string | null;
  diasNaEtapa: number;
  estimado: boolean;
  inconformidadeAberta: string | null; // motivo
  ultimoContatoDias: number | null;
  temAndamento: boolean;
};

type Opcao = { id: string; nome: string };
type OpcoesMover = { encerramento?: string | null; motivo?: string | null };

const grupoDe = (id: ColunaFinId) => COLUNA_FIN_POR_ID.get(id)?.grupo;

function formatarMoeda(v: number | null) {
  if (v === null) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function situacaoRetorno(data: string | null, hoje: string): "atrasado" | "hoje" | "futuro" | "sem" {
  if (!data) return "sem";
  if (data < hoje) return "atrasado";
  if (data === hoje) return "hoje";
  return "futuro";
}

function diasAte(iso: string, hoje: string) {
  return Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${hoje}T00:00:00Z`).getTime()) / 86400000);
}

export function FinanciamentoKanban({
  cards: cardsServidor,
  hoje,
  diasAlertaValidade,
  responsaveis,
  bancos,
  parceiros,
  responsavelPorColuna,
  moverCard,
  definirResponsavelColuna
}: {
  cards: CardFinanciamento[];
  hoje: string;
  diasAlertaValidade: number;
  responsaveis: Opcao[];
  bancos: string[];
  parceiros: Opcao[];
  responsavelPorColuna: Record<string, string | null>;
  moverCard: (id: string, destino: ColunaFinId, opcoes?: OpcoesMover) => Promise<void>;
  definirResponsavelColuna: (coluna: string, responsavelId: string | null) => Promise<ResultadoSalvar>;
}) {
  const router = useRouter();
  // Cópia local: o card muda de coluna NA HORA e a gravação roda em segundo plano
  // (mesma lógica do quadro de Recrutamento). Se o servidor recusar, o card volta.
  const [cards, setCards] = useState(cardsServidor);
  const pendentes = useRef(0);
  useEffect(() => {
    if (pendentes.current === 0) setCards(cardsServidor);
  }, [cardsServidor]);

  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<ColunaFinId | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroResp, setFiltroResp] = useState("");
  const [filtroBanco, setFiltroBanco] = useState("");
  const [filtroParceiro, setFiltroParceiro] = useState("");
  const [soAlertas, setSoAlertas] = useState(false);
  const [mostrarFim, setMostrarFim] = useState(true);
  const [pedindoDesfecho, setPedindoDesfecho] = useState<{ id: string } | null>(null);
  const [desfecho, setDesfecho] = useState("");
  const [motivo, setMotivo] = useState("");
  const [, startTransition] = useTransition();

  function cardEmAlerta(c: CardFinanciamento) {
    if (grupoDe(c.coluna) === "fim") return false;
    if (situacaoSla(c.coluna, c.diasNaEtapa) === "atrasado") return true;
    if (c.inconformidadeAberta) return true;
    const r = situacaoRetorno(c.proximaAcaoData, hoje);
    if (r === "atrasado" || r === "hoje") return true;
    if (c.coluna === "aprovado" && c.validade && diasAte(c.validade, hoje) <= diasAlertaValidade) return true;
    return false;
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = busca.replace(/\D/g, "");
    return cards.filter((c) => {
      if (termo && !c.cliente.toLowerCase().includes(termo) && !(c.idLegado ?? "").toLowerCase().includes(termo) && !(digitos && (c.telefone ?? "").includes(digitos))) return false;
      if (filtroResp === "__sem") {
        if (c.responsavelId) return false;
      } else if (filtroResp && c.responsavelId !== filtroResp) return false;
      if (filtroBanco && c.banco !== filtroBanco) return false;
      if (filtroParceiro && c.parceiroId !== filtroParceiro) return false;
      if (soAlertas && !cardEmAlerta(c)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, busca, filtroResp, filtroBanco, filtroParceiro, soAlertas, hoje]);

  const resumo = useMemo(() => {
    const ativos = cards.filter((c) => grupoDe(c.coluna) !== "fim");
    return {
      ativos: ativos.length,
      noProcesso: ativos.filter((c) => grupoDe(c.coluna) === "processo").length,
      atrasados: ativos.filter((c) => situacaoSla(c.coluna, c.diasNaEtapa) === "atrasado").length,
      inconformes: ativos.filter((c) => c.inconformidadeAberta).length,
      validade: ativos.filter((c) => c.coluna === "aprovado" && c.validade && diasAte(c.validade, hoje) <= diasAlertaValidade).length,
      retornos: ativos.filter((c) => {
        const r = situacaoRetorno(c.proximaAcaoData, hoje);
        return r === "atrasado" || r === "hoje";
      }).length
    };
  }, [cards, hoje, diasAlertaValidade]);

  const executarMover = useCallback(
    (id: string, coluna: ColunaFinId, opcoes?: OpcoesMover) => {
      const anterior = cards.find((c) => c.id === id);
      if (!anterior || anterior.coluna === coluna) return;
      setErro(null);
      setCards((lista) =>
        lista.map((c) =>
          c.id === id
            ? {
                ...c,
                coluna,
                diasNaEtapa: 0,
                estimado: false,
                statusAvaliacao: coluna === "encerrado" ? (opcoes?.encerramento ?? c.statusAvaliacao) : c.statusAvaliacao,
                temAndamento: grupoDe(coluna) === "processo" ? true : c.temAndamento
              }
            : c
        )
      );
      // Entrar no processo cria o andamento no servidor: atualiza o quadro depois
      // (em segundo plano) pra trazer os dados novos.
      const precisaAtualizar = grupoDe(coluna) === "processo" && anterior.coluna === "aprovado";
      pendentes.current += 1;
      moverCard(id, coluna, opcoes)
        .then(() => {
          pendentes.current -= 1;
          if (precisaAtualizar) startTransition(() => router.refresh());
        })
        .catch((e: unknown) => {
          pendentes.current -= 1;
          setCards((lista) => lista.map((c) => (c.id === id ? anterior : c)));
          setErro(e instanceof Error ? e.message : "Não foi possível mover o card.");
        });
    },
    [cards, moverCard, router]
  );

  function aoSoltar(coluna: ColunaFinId) {
    setColunaAlvo(null);
    if (!arrastandoId) return;
    const id = arrastandoId;
    setArrastandoId(null);
    const atual = cards.find((c) => c.id === id);
    if (!atual || atual.coluna === coluna) return;
    if (coluna === "encerrado") {
      setDesfecho("");
      setMotivo("");
      setPedindoDesfecho({ id });
      return;
    }
    executarMover(id, coluna);
  }

  function confirmarDesfecho() {
    if (!pedindoDesfecho || !desfecho) return;
    const { id } = pedindoDesfecho;
    setPedindoDesfecho(null);
    executarMover(id, "encerrado", { encerramento: desfecho, motivo: motivo || null });
  }

  const iniciarArraste = useCallback((id: string) => setArrastandoId(id), []);
  const terminarArraste = useCallback(() => {
    setArrastandoId(null);
    setColunaAlvo(null);
  }, []);

  const colunasVisiveis = mostrarFim ? COLUNAS_FIN : COLUNAS_FIN.filter((c) => c.grupo !== "fim");

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Resumo rotulo="Em andamento" valor={resumo.ativos} />
        <Resumo rotulo="No processo" valor={resumo.noProcesso} />
        <Resumo rotulo="Acima da meta de tempo" valor={resumo.atrasados} destaque={resumo.atrasados > 0 ? "vermelho" : undefined} />
        <Resumo rotulo="Inconformidades abertas" valor={resumo.inconformes} destaque={resumo.inconformes > 0 ? "vermelho" : undefined} />
        <Resumo rotulo={`Aprovação vence em ${diasAlertaValidade} dias`} valor={resumo.validade} destaque={resumo.validade > 0 ? "ambar" : undefined} />
        <Resumo rotulo="Retornos hoje/atrasados" valor={resumo.retornos} destaque={resumo.retornos > 0 ? "ambar" : undefined} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente, Id ou telefone..."
          className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full sm:w-64 outline-none focus:border-primary bg-white"
        />
        <select value={filtroResp} onChange={(e) => setFiltroResp(e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-primary">
          <option value="">Todos os responsáveis</option>
          <option value="__sem">Sem responsável</option>
          {responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </select>
        <select value={filtroBanco} onChange={(e) => setFiltroBanco(e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-primary">
          <option value="">Todos os bancos</option>
          {bancos.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select value={filtroParceiro} onChange={(e) => setFiltroParceiro(e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-primary">
          <option value="">Todos os corretores</option>
          {parceiros.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={soAlertas} onChange={(e) => setSoAlertas(e.target.checked)} />
          Só com alerta
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={mostrarFim} onChange={(e) => setMostrarFim(e.target.checked)} />
          Mostrar concluídos e encerrados
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

      <div className="flex flex-col md:flex-row gap-3 md:overflow-x-auto pb-2">
        {colunasVisiveis.map((coluna) => {
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
                {coluna.slaDias && <div className="text-[10px] opacity-70 mt-0.5">Meta: até {coluna.slaDias} dia(s) nesta etapa</div>}
                <div className="mt-1.5">
                  <CampoSelectAuto
                    valor={responsavelPorColuna[coluna.id] ?? null}
                    vazio="Responsável da etapa…"
                    opcoes={responsaveis.map((r) => ({ valor: r.id, rotulo: r.nome }))}
                    salvar={(v) => definirResponsavelColuna(coluna.id, v)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 md:max-h-[62vh] md:overflow-y-auto">
                {doGrupo.map((c) => (
                  <Cartao
                    key={c.id}
                    c={c}
                    hoje={hoje}
                    diasAlertaValidade={diasAlertaValidade}
                    arrastando={arrastandoId === c.id}
                    aoArrastar={iniciarArraste}
                    aoSoltarFim={terminarArraste}
                  />
                ))}
                {doGrupo.length === 0 && <div className="text-[11px] text-gray-400 text-center py-4">Nenhum card</div>}
              </div>
            </div>
          );
        })}
      </div>

      {pedindoDesfecho && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-4 w-full max-w-sm flex flex-col gap-3">
            <div className="text-sm font-bold text-gray-800">Encerrar — {cards.find((c) => c.id === pedindoDesfecho.id)?.cliente}</div>
            <select
              className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white"
              value={desfecho}
              onChange={(e) => setDesfecho(e.target.value)}
            >
              <option value="">Escolha o desfecho…</option>
              {ENCERRAMENTOS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <textarea
              className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo (opcional)"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPedindoDesfecho(null)} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600">
                Cancelar
              </button>
              <button type="button" disabled={!desfecho} onClick={confirmarDesfecho} className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
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
      <div className="text-[10px] opacity-70 leading-tight">{rotulo}</div>
      <div className="text-base font-bold">{valor}</div>
    </div>
  );
}

const Cartao = memo(function Cartao({
  c,
  hoje,
  diasAlertaValidade,
  arrastando,
  aoArrastar,
  aoSoltarFim
}: {
  c: CardFinanciamento;
  hoje: string;
  diasAlertaValidade: number;
  arrastando: boolean;
  aoArrastar: (id: string) => void;
  aoSoltarFim: () => void;
}) {
  const grupo = grupoDe(c.coluna);
  const sla = situacaoSla(c.coluna, c.diasNaEtapa);
  const meta = COLUNA_FIN_POR_ID.get(c.coluna)?.slaDias ?? null;
  const retorno = situacaoRetorno(c.proximaAcaoData, hoje);
  const diasValidade = c.validade ? diasAte(c.validade, hoje) : null;
  const validadeEmAlerta = (c.coluna === "aprovado" || c.coluna === "condicionado") && diasValidade !== null && diasValidade <= diasAlertaValidade;
  const alerta = grupo !== "fim" && (sla === "atrasado" || !!c.inconformidadeAberta);

  return (
    <Link
      href={`/financiamento/${c.id}/etiqueta`}
      draggable
      onDragStart={() => aoArrastar(c.id)}
      onDragEnd={aoSoltarFim}
      className={`bg-white border rounded-lg p-2.5 flex flex-col gap-1 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing ${
        arrastando ? "opacity-50" : ""
      } ${alerta ? "border-red-300" : "border-gray-200 hover:border-primary/40"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-gray-800 leading-snug">{c.cliente}</span>
        {grupo !== "fim" && (
          <span
            className={`text-[10px] shrink-0 ${sla === "atrasado" ? "text-red-600 font-bold" : sla === "alerta" ? "text-amber-600" : "text-gray-400"}`}
            title={`Tempo nesta etapa${c.estimado ? " (estimado a partir das datas cadastradas)" : ""}${meta ? ` — meta ${meta}d` : ""}`}
          >
            {c.diasNaEtapa}d{meta ? `/${meta}` : ""}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {c.banco && <Selo cor="cinza">{c.banco}</Selo>}
        {c.coluna === "encerrado" && <Selo cor="vermelho">{c.statusAvaliacao}</Selo>}
        {c.statusAndamento && grupo === "processo" && <Selo cor="azul">{c.statusAndamento}</Selo>}
        {c.inconformidadeAberta && <Selo cor="vermelho">Inconforme</Selo>}
        {sla === "atrasado" && grupo !== "fim" && <Selo cor="vermelho">Acima da meta</Selo>}
        {validadeEmAlerta && diasValidade !== null && (
          <Selo cor={diasValidade < 0 ? "vermelho" : "ambar"}>{diasValidade < 0 ? `Vencida há ${-diasValidade}d` : `Vence em ${diasValidade}d`}</Selo>
        )}
        {grupo !== "fim" && retorno === "atrasado" && <Selo cor="vermelho">Retorno atrasado</Selo>}
        {grupo !== "fim" && retorno === "hoje" && <Selo cor="ambar">Retorno hoje</Selo>}
      </div>

      {c.inconformidadeAberta && <div className="text-[10px] text-red-600 leading-snug">{c.inconformidadeAberta}</div>}
      {c.imovel && <div className="text-[10px] text-gray-500 truncate">{c.imovel}</div>}
      {c.proximaAcaoTexto && grupo !== "fim" && <div className="text-[11px] text-gray-600 leading-snug">{c.proximaAcaoTexto}</div>}

      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
        <span className="truncate">Corretor: {c.parceiroNome?.split(" ")[0] ?? "—"}</span>
        {c.valor !== null && <span className="font-medium text-gray-700 shrink-0">{formatarMoeda(c.valor)}</span>}
      </div>
      {grupo !== "fim" && (
        <div className="text-[10px] text-gray-500">
          Responsável: <span className="font-medium">{c.responsavelNome?.split(" ")[0] ?? "—"}</span>
          {c.ultimoContatoDias !== null && ` · contato há ${c.ultimoContatoDias}d`}
        </div>
      )}
    </Link>
  );
});

function Selo({ cor, children }: { cor: "vermelho" | "ambar" | "cinza" | "azul"; children: React.ReactNode }) {
  const cls =
    cor === "vermelho"
      ? "bg-red-50 text-red-600 border-red-200"
      : cor === "ambar"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : cor === "azul"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-gray-50 text-gray-500 border-gray-200";
  return <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 border ${cls}`}>{children}</span>;
}
