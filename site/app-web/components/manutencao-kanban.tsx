"use client";

import { memo, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  COLUNAS_KANBAN,
  TIPOS_SERVICO,
  URGENCIA_LABEL,
  URGENCIA_COR,
  CHAVE_POSSE_LABEL,
  iconeTipoServico
} from "@/lib/manutencao/opcoes";
import {
  COLUNAS_ABERTAS,
  COLUNAS_PEDEM_PRESTADOR,
  COR_SLA_MAN,
  diasParado,
  situacaoSlaMan,
  textoMeta
} from "@/lib/manutencao/quadro";
import { useQuadroOtimista } from "@/components/use-quadro-otimista";

export type TicketKanban = {
  id: string;
  titulo: string;
  tipo_servico: string;
  urgencia: string;
  coluna: string;
  /** quando entrou na coluna atual (ISO) */
  desde: string;
  chave_posse: string;
  imovelId: string;
  imovelIdLegado: string | null;
  endereco: string | null;
  proprietario: string | null;
  prestadorId: string | null;
  prestador: string | null;
};

type Filtro = "" | "urgentes" | "atrasados" | "sem_prestador";

const CAMPO = "text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";

const CardTicket = memo(function CardTicket({
  t,
  agoraMs,
  aoComecarArrasto,
  aoTerminarArrasto
}: {
  t: TicketKanban;
  agoraMs: number;
  aoComecarArrasto: (id: string) => void;
  aoTerminarArrasto: () => void;
}) {
  const cor = URGENCIA_COR[t.urgencia] ?? URGENCIA_COR.media;
  const dias = diasParado(t.desde, agoraMs);
  const sla = situacaoSlaMan(t.coluna, t.urgencia, dias);
  const semPrestador = COLUNAS_PEDEM_PRESTADOR.has(t.coluna) && !t.prestadorId;
  const emergencial = t.urgencia === "emergencial" && COLUNAS_ABERTAS.has(t.coluna);

  return (
    <Link
      href={`/manutencao/${t.id}/etiqueta`}
      draggable
      onDragStart={() => aoComecarArrasto(t.id)}
      onDragEnd={aoTerminarArrasto}
      className={`bg-white border rounded-lg p-3 flex flex-col gap-1.5 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing ${
        sla === "atrasado" ? "border-red-300 hover:border-red-400" : emergencial ? "border-[#B14226]/50" : "border-gray-200 hover:border-primary/40"
      }`}
    >
      <div className="flex items-start gap-1.5">
        <span className="text-sm leading-none">{iconeTipoServico(t.tipo_servico)}</span>
        <span className="text-xs font-semibold text-gray-800 leading-snug">{t.titulo}</span>
      </div>
      <div className="text-[11px] text-gray-500 truncate">
        {t.imovelIdLegado ?? t.imovelId.slice(0, 8)} — {t.endereco ?? "Sem endereço"}
      </div>
      {t.proprietario && <div className="text-[11px] text-gray-500 truncate">Propr.: {t.proprietario}</div>}
      {t.prestador && <div className="text-[11px] text-gray-500 truncate">Prestador: {t.prestador}</div>}
      {semPrestador && (
        <div className="flex gap-1 flex-wrap">
          <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">Sem prestador</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
        <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${cor.bg} ${cor.texto} ${cor.borda}`}>
          {URGENCIA_LABEL[t.urgencia] ?? t.urgencia}
        </span>
        <span className="text-[10px] text-gray-400">🔑 {CHAVE_POSSE_LABEL[t.chave_posse] ?? t.chave_posse}</span>
      </div>
      <div className="flex items-center justify-end gap-2">
        {sla !== "sem_meta" && (
          <span className={`text-[10px] font-semibold ${COR_SLA_MAN[sla]}`} title={`Nesta etapa há ${dias} dia(s) — ${textoMeta(t.coluna, t.urgencia)}`}>
            {dias === 0 ? "hoje" : `parado há ${dias}d`}
          </span>
        )}
      </div>
    </Link>
  );
});

// Quadro Kanban de manutenção. Arrastar e soltar muda o card de coluna NA HORA
// (o servidor grava em segundo plano — antes a tela esperava a gravação e o
// recarregamento do quadro, e ficava lenta). Clicar no card abre a etiqueta
// (mensagens de WhatsApp, notas, tudo do ticket); a ficha completa abre de lá.
// Em telas md- as colunas empilham; em md+ viram um quadro horizontal.
export function ManutencaoKanban({
  tickets: ticketsServidor,
  moverColuna,
  agoraMs,
  ocultosAntigos
}: {
  tickets: TicketKanban[];
  moverColuna: (id: string, novaColuna: string) => Promise<void>;
  agoraMs: number;
  /** quantos tickets encerrados há muito tempo estão fora do quadro */
  ocultosAntigos: number;
}) {
  const { itens: tickets, moverPara, erro, limparErro } = useQuadroOtimista(ticketsServidor, moverColuna, () => ({
    desde: new Date().toISOString()
  }));
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [urgencia, setUrgencia] = useState("");
  const [prestador, setPrestador] = useState("");
  const [tipo, setTipo] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("");

  const comecarArrasto = useCallback((id: string) => setArrastandoId(id), []);
  const terminarArrasto = useCallback(() => {
    setArrastandoId(null);
    setColunaAlvo(null);
  }, []);

  function aoSoltar(coluna: string) {
    setColunaAlvo(null);
    if (!arrastandoId) return;
    const id = arrastandoId;
    setArrastandoId(null);
    moverPara(id, coluna);
  }

  const prestadores = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const t of tickets) if (t.prestadorId && t.prestador) mapa.set(t.prestadorId, t.prestador);
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tickets]);

  const ehAtrasado = useCallback(
    (t: TicketKanban) => situacaoSlaMan(t.coluna, t.urgencia, diasParado(t.desde, agoraMs)) === "atrasado",
    [agoraMs]
  );
  const ehUrgente = (t: TicketKanban) => (t.urgencia === "alta" || t.urgencia === "emergencial") && COLUNAS_ABERTAS.has(t.coluna);
  const semPrestador = (t: TicketKanban) => COLUNAS_PEDEM_PRESTADOR.has(t.coluna) && !t.prestadorId;

  const resumo = useMemo(
    () => ({
      urgentes: tickets.filter(ehUrgente).length,
      atrasados: tickets.filter(ehAtrasado).length,
      semPrestador: tickets.filter(semPrestador).length,
      emAberto: tickets.filter((t) => COLUNAS_ABERTAS.has(t.coluna)).length
    }),
    [tickets, ehAtrasado]
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return tickets.filter((t) => {
      if (termo) {
        const texto = `${t.titulo} ${t.endereco ?? ""} ${t.proprietario ?? ""} ${t.prestador ?? ""} ${t.imovelIdLegado ?? ""}`.toLowerCase();
        if (!texto.includes(termo)) return false;
      }
      if (urgencia && t.urgencia !== urgencia) return false;
      if (prestador === "__sem" ? !!t.prestadorId : prestador && t.prestadorId !== prestador) return false;
      if (tipo && t.tipo_servico !== tipo) return false;
      if (filtro === "urgentes" && !ehUrgente(t)) return false;
      if (filtro === "atrasados" && !ehAtrasado(t)) return false;
      if (filtro === "sem_prestador" && !semPrestador(t)) return false;
      return true;
    });
  }, [tickets, busca, urgencia, prestador, tipo, filtro, ehAtrasado]);

  const porColuna = useMemo(() => {
    const mapa = new Map<string, TicketKanban[]>();
    for (const t of filtrados) mapa.set(t.coluna, [...(mapa.get(t.coluna) ?? []), t]);
    // dentro da coluna: mais urgente primeiro, depois o mais parado
    const peso: Record<string, number> = { emergencial: 0, alta: 1, media: 2, baixa: 3 };
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (peso[a.urgencia] ?? 2) - (peso[b.urgencia] ?? 2) || new Date(a.desde).getTime() - new Date(b.desde).getTime());
    }
    return mapa;
  }, [filtrados]);

  const temFiltro = !!(busca || urgencia || prestador || tipo || filtro);

  const chips: { id: Filtro; rotulo: string; valor: number; tom: string }[] = [
    { id: "urgentes", rotulo: "Urgentes em aberto", valor: resumo.urgentes, tom: "red" },
    { id: "atrasados", rotulo: "Acima da meta de tempo", valor: resumo.atrasados, tom: "red" },
    { id: "sem_prestador", rotulo: "Sem prestador", valor: resumo.semPrestador, tom: "amber" }
  ];

  return (
    <div className="flex flex-col gap-3">
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <span>{erro}</span>
          <button type="button" onClick={limparErro} className="text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      )}

      {/* Resumo: cada indicador filtra o quadro ao clicar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="border border-gray-200 bg-white rounded-lg px-3 py-2">
          <div className="text-[10px] text-gray-400">Em aberto</div>
          <div className="text-lg font-bold text-gray-800 leading-tight">{resumo.emAberto}</div>
        </div>
        {chips.map((c) => {
          const ativo = filtro === c.id;
          const destaque = c.valor > 0;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setFiltro(ativo ? "" : c.id)}
              className={`text-left border rounded-lg px-3 py-2 transition-colors ${
                ativo
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : destaque
                    ? c.tom === "red"
                      ? "border-red-200 bg-red-50 hover:bg-red-100"
                      : "border-amber-200 bg-amber-50 hover:bg-amber-100"
                    : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <div className="text-[10px] text-gray-500">{c.rotulo}</div>
              <div className={`text-lg font-bold leading-tight ${destaque ? (c.tom === "red" ? "text-red-700" : "text-amber-700") : "text-gray-400"}`}>{c.valor}</div>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          className={`${CAMPO} flex-1 min-w-[200px] max-w-sm`}
          placeholder="Buscar por título, imóvel, proprietário, prestador..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select className={CAMPO} value={urgencia} onChange={(e) => setUrgencia(e.target.value)}>
          <option value="">Toda urgência</option>
          {Object.entries(URGENCIA_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todo serviço</option>
          {TIPOS_SERVICO.map((s) => (
            <option key={s.value} value={s.value}>
              {s.icone} {s.label}
            </option>
          ))}
        </select>
        <select className={CAMPO} value={prestador} onChange={(e) => setPrestador(e.target.value)}>
          <option value="">Todo prestador</option>
          <option value="__sem">Sem prestador</option>
          {prestadores.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
        {temFiltro && (
          <button
            type="button"
            onClick={() => {
              setBusca("");
              setUrgencia("");
              setPrestador("");
              setTipo("");
              setFiltro("");
            }}
            className="text-xs text-gray-400 hover:text-gray-700 underline"
          >
            limpar filtros
          </button>
        )}
        <span className="text-[11px] text-gray-400 ml-auto">
          {temFiltro ? `${filtrados.length} de ${tickets.length} tickets` : `${tickets.length} tickets`}
        </span>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:overflow-x-auto pb-2">
        {COLUNAS_KANBAN.map((coluna) => {
          const lista = porColuna.get(coluna.id) ?? [];
          const emDestaque = colunaAlvo === coluna.id;
          return (
            <div
              key={coluna.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (colunaAlvo !== coluna.id) setColunaAlvo(coluna.id);
              }}
              onDragLeave={() => setColunaAlvo((atual) => (atual === coluna.id ? null : atual))}
              onDrop={() => aoSoltar(coluna.id)}
              className={`md:w-72 md:shrink-0 rounded-xl border p-2 flex flex-col gap-2 transition-colors ${
                emDestaque ? "bg-primary/5 border-primary/40" : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="px-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700">{coluna.label}</span>
                  <span className="text-[11px] text-gray-400">{lista.length}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 md:max-h-[65vh] md:overflow-y-auto">
                {lista.map((t) => (
                  <CardTicket key={t.id} t={t} agoraMs={agoraMs} aoComecarArrasto={comecarArrasto} aoTerminarArrasto={terminarArrasto} />
                ))}
                {lista.length === 0 && (
                  <div className="text-[11px] text-gray-300 text-center py-4">{temFiltro ? "Nada com esse filtro." : "Nenhum ticket aqui."}</div>
                )}
                {coluna.id === "pago" && ocultosAntigos > 0 && (
                  <Link href="/manutencao?todos=1" className="text-[11px] text-primary text-center py-2 hover:underline">
                    + {ocultosAntigos} encerrado{ocultosAntigos === 1 ? "" : "s"} há mais de 45 dias — ver todos
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
