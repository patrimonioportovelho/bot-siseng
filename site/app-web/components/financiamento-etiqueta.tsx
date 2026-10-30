"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  COLUNAS_FIN,
  COLUNA_FIN_POR_ID,
  ENCERRAMENTOS,
  STATUS_CONFORMIDADE,
  TIPO_CONFORMIDADE,
  TIPO_CONTATO_FIN,
  TIPO_ETAPA,
  TIPO_INCONFORMIDADE,
  TIPO_NOTA_FIN,
  situacaoSla,
  type ColunaFinId
} from "@/lib/financiamento/quadro";
import {
  GRUPOS_CHECKLIST,
  MOTIVOS_INCONFORMIDADE,
  type EstadoChecklist,
  type VerificacaoAutomatica
} from "@/lib/financiamento/conformidade";
import { CampoDataAuto, CampoSelectAuto, CampoTextoAuto, Rotulo, type ResultadoSalvar } from "@/components/recrutamento-campos";
import { FinanciamentoWhatsapp, type PessoaContato } from "@/components/financiamento-whatsapp";
import { BotaoFichaCompleta } from "@/components/botao-ficha-completa";
import type { AtividadeFinTela } from "@/app/financiamento/quadro-actions";

export type DadosFin = {
  id: string;
  idLegado: string | null;
  cliente: PessoaContato & { telefoneFormatado: string | null };
  parceiro: (PessoaContato & { id: string }) | null;
  vendedor: PessoaContato | null;
  banco: string | null;
  tipoAvaliacao: string | null;
  statusAvaliacao: string;
  statusAndamento: string | null;
  coluna: ColunaFinId;
  imovel: string | null;
  tipoContrato: string | null;
  valorAprovado: string | null; // já formatado em R$
  valorFinanciamento: string | null;
  prestacao: string | null;
  validade: string | null; // yyyy-mm-dd
  usaFgts: boolean;
  responsavelId: string | null;
  proximaAcaoData: string | null;
  proximaAcaoTexto: string | null;
  notas: string | null;
  checklist: EstadoChecklist;
  diasNaEtapa: number;
  estimado: boolean;
  verificacoes: VerificacaoAutomatica[];
  atividades: AtividadeFinTela[];
};

type Acoes = {
  moverCard: (id: string, destino: ColunaFinId, opcoes?: { encerramento?: string | null; motivo?: string | null }) => Promise<void>;
  definirStatusAndamento: (id: string, status: string) => Promise<ResultadoSalvar>;
  salvarCampo: (id: string, campo: string, valor: string | null) => Promise<ResultadoSalvar>;
  alternarChecklist: (id: string, chave: string, feito: boolean) => Promise<ResultadoSalvar>;
  registrarConformidade: (
    id: string,
    resultado: "Conforme" | "Inconforme",
    motivo: string | null,
    nota: string | null
  ) => Promise<ResultadoSalvar>;
  resolverInconformidade: (id: string, atividadeId: string, nota: string | null) => Promise<ResultadoSalvar>;
  registrarContato: (
    id: string,
    dados: { tipo: string; resultado: string | null; nota: string | null }
  ) => Promise<{ ok: true; atividade: AtividadeFinTela } | { ok: false; erro: string }>;
};

const CARTAO = "bg-white border border-gray-200 rounded-xl p-4";
const TITULO = "text-sm font-bold text-gray-800 mb-3";
const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Porto_Velho",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function duracao(inicioIso: string, fimIso: string | null) {
  const ms = (fimIso ? new Date(fimIso).getTime() : Date.now()) - new Date(inicioIso).getTime();
  const horas = ms / 3600000;
  if (horas < 1) return "menos de 1 hora";
  if (horas < 24) return `${Math.floor(horas)} h`;
  const dias = Math.floor(horas / 24);
  return `${dias} dia${dias === 1 ? "" : "s"}`;
}

function dataBr(iso: string) {
  return iso.split("-").reverse().join("/");
}

export function FinanciamentoEtiqueta({
  d,
  responsaveis,
  remetenteLogado,
  responsavelPorColuna,
  acoes
}: {
  d: DadosFin;
  responsaveis: { id: string; nome: string }[];
  remetenteLogado: { id: string; primeiroNome: string };
  responsavelPorColuna: Record<string, string | null>;
  acoes: Acoes;
}) {
  const router = useRouter();
  const salvar = (campo: string) => (valor: string | null) => acoes.salvarCampo(d.id, campo, valor);

  const [colunaAtual, setColunaAtual] = useState<ColunaFinId>(d.coluna);
  const [statusAndamento, setStatusAndamento] = useState<string | null>(d.statusAndamento);
  const [atividades, setAtividades] = useState<AtividadeFinTela[]>(d.atividades);
  const [responsavelId, setResponsavelId] = useState<string | null>(d.responsavelId);
  useEffect(() => {
    setAtividades(d.atividades);
    setColunaAtual(d.coluna);
    setStatusAndamento(d.statusAndamento);
  }, [d.atividades, d.coluna, d.statusAndamento]);

  const coluna = COLUNA_FIN_POR_ID.get(colunaAtual);
  const grupo = coluna?.grupo;

  // ---- mover de etapa ----
  const [erroMover, setErroMover] = useState<string | null>(null);
  const [movendo, setMovendo] = useState(false);
  const [pedindoDesfecho, setPedindoDesfecho] = useState(false);
  const [desfecho, setDesfecho] = useState("");
  const [motivoDesfecho, setMotivoDesfecho] = useState("");
  async function mover(destino: ColunaFinId, opcoes?: { encerramento?: string | null; motivo?: string | null }) {
    setErroMover(null);
    setMovendo(true);
    try {
      await acoes.moverCard(d.id, destino, opcoes);
      setColunaAtual(destino);
      setPedindoDesfecho(false);
      router.refresh();
    } catch (e) {
      setErroMover(e instanceof Error ? e.message : "Não foi possível mover.");
    } finally {
      setMovendo(false);
    }
  }
  function aoMudarEtapa(destino: ColunaFinId) {
    if (destino === "encerrado") {
      setDesfecho("");
      setMotivoDesfecho("");
      setPedindoDesfecho(true);
      return;
    }
    setPedindoDesfecho(false);
    void mover(destino);
  }

  // ---- status do andamento (dentro da etapa) ----
  const [erroStatus, setErroStatus] = useState<string | null>(null);
  async function mudarStatus(novo: string) {
    setErroStatus(null);
    const r = await acoes.definirStatusAndamento(d.id, novo);
    if (!r.ok) {
      setErroStatus(r.erro);
      return;
    }
    setStatusAndamento(novo);
    router.refresh();
  }

  // ---- conformidade ----
  const inconformidadesAbertas = atividades.filter((a) => a.tipo === TIPO_INCONFORMIDADE && !a.fim);
  const [motivoInc, setMotivoInc] = useState("");
  const [notaInc, setNotaInc] = useState("");
  const [erroConf, setErroConf] = useState<string | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [notaResolucao, setNotaResolucao] = useState<Record<string, string>>({});
  async function registrarConf(resultado: "Conforme" | "Inconforme") {
    setErroConf(null);
    setTrabalhando(true);
    const r = await acoes.registrarConformidade(d.id, resultado, resultado === "Inconforme" ? motivoInc : null, notaInc || null);
    setTrabalhando(false);
    if (!r.ok) {
      setErroConf(r.erro);
      return;
    }
    setMotivoInc("");
    setNotaInc("");
    router.refresh();
  }
  async function resolver(id: string) {
    setErroConf(null);
    setTrabalhando(true);
    const r = await acoes.resolverInconformidade(d.id, id, notaResolucao[id] || null);
    setTrabalhando(false);
    if (!r.ok) {
      setErroConf(r.erro);
      return;
    }
    router.refresh();
  }
  const totalConformes = atividades.filter((a) => a.tipo === TIPO_CONFORMIDADE).length;
  const totalInconformes = atividades.filter((a) => a.tipo === TIPO_INCONFORMIDADE).length;
  const mostrarConformidade = colunaAtual === "conformidade" || totalConformes + totalInconformes > 0;

  // ---- checklist ----
  const [checklist, setChecklist] = useState<EstadoChecklist>(d.checklist);
  const [erroChecklist, setErroChecklist] = useState<string | null>(null);
  async function alternar(chave: string, feito: boolean) {
    setErroChecklist(null);
    const anterior = checklist;
    setChecklist({ ...checklist, [chave]: feito ? { feito: true, data: new Date().toISOString().slice(0, 10) } : { feito: false } });
    const r = await acoes.alternarChecklist(d.id, chave, feito);
    if (!r.ok) {
      setChecklist(anterior);
      setErroChecklist(r.erro);
    }
  }

  // ---- linha do tempo ----
  const tempoPorEtapa = useMemo(() => {
    const mapa = new Map<string, { passagens: number; ms: number }>();
    for (const a of atividades) {
      if (a.tipo !== TIPO_ETAPA || !a.etapa) continue;
      const fim = a.fim ? new Date(a.fim).getTime() : Date.now();
      const ms = Math.max(0, fim - new Date(a.inicio).getTime());
      const atual = mapa.get(a.etapa) ?? { passagens: 0, ms: 0 };
      atual.passagens += 1;
      atual.ms += ms;
      mapa.set(a.etapa, atual);
    }
    return [...mapa.entries()].map(([etapa, v]) => ({ etapa, passagens: v.passagens, dias: v.ms / 86400000 })).sort((x, y) => y.dias - x.dias);
  }, [atividades]);

  const sla = situacaoSla(colunaAtual, d.diasNaEtapa);
  const meta = coluna?.slaDias ?? null;
  const etapaLabel = statusAndamento && grupo === "processo" ? statusAndamento : d.statusAvaliacao;

  const statusDaColuna = (coluna?.statusAndamento ?? []).filter((s) => !STATUS_CONFORMIDADE.includes(s));
  const gruposChecklist = GRUPOS_CHECKLIST;

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      {/* Cabeçalho */}
      <div className={CARTAO}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-base font-bold text-gray-900">{d.cliente.nome}</div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${coluna?.cor ?? ""}`}>{coluna?.label}</span>
              {d.banco && <span>{d.banco}</span>}
              {d.tipoAvaliacao && <span>· {d.tipoAvaliacao}</span>}
              {d.idLegado && <span className="text-primary font-semibold">· Id {d.idLegado}</span>}
            </div>
            <div className="text-xs text-gray-600 mt-2 flex items-center gap-3 flex-wrap">
              {d.cliente.telefoneFormatado && <span>Cliente: {d.cliente.telefoneFormatado}</span>}
              {d.parceiro && <span>Corretor: {d.parceiro.nome}</span>}
              {d.imovel && <span>Imóvel: {d.imovel}</span>}
            </div>
            <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
              {d.valorAprovado && <span>Aprovado: {d.valorAprovado}</span>}
              {d.valorFinanciamento && <span>Financiamento: {d.valorFinanciamento}</span>}
              {d.prestacao && <span>Prestação: {d.prestacao}</span>}
              {d.validade && <span>Validade: {dataBr(d.validade)}</span>}
              {d.usaFgts && <span>Usa FGTS</span>}
            </div>
          </div>
          <BotaoFichaCompleta avaliacaoId={d.id} nome={d.cliente.nome} />
        </div>
      </div>

      {/* Mensagem de WhatsApp */}
      <FinanciamentoWhatsapp
        avaliacaoId={d.id}
        coluna={colunaAtual}
        statusAvaliacao={d.statusAvaliacao}
        cliente={{ nome: d.cliente.nome, telefone: d.cliente.telefone }}
        parceiro={d.parceiro ? { nome: d.parceiro.nome, telefone: d.parceiro.telefone } : null}
        vendedor={d.vendedor}
        remetentes={responsaveis}
        remetenteIdPadrao={
          responsavelId ?? responsavelPorColuna[colunaAtual] ?? (responsaveis.some((r) => r.id === remetenteLogado.id) ? remetenteLogado.id : null)
        }
        remetenteFallback={remetenteLogado.primeiroNome}
        banco={d.banco}
        imovel={d.imovel}
        validade={d.validade}
        etapaLabel={etapaLabel}
        pendencia={inconformidadesAbertas[0]?.motivo ?? null}
        proximoPasso={d.proximaAcaoTexto}
        inconformidadeAberta={inconformidadesAbertas.length > 0}
        registrarContato={acoes.registrarContato}
        aoRegistrar={(a) => {
          setAtividades((l) => [a, ...l]);
          router.refresh();
        }}
      />

      {/* Acompanhamento */}
      <div className={CARTAO}>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="text-sm font-bold text-gray-800">Acompanhamento</div>
          {grupo !== "fim" && (
            <div className={`text-[11px] ${sla === "atrasado" ? "text-red-600 font-semibold" : sla === "alerta" ? "text-amber-600" : "text-gray-500"}`}>
              Nesta etapa há {d.diasNaEtapa} dia(s){meta ? ` (meta ${meta})` : ""}
              {d.estimado ? " · estimado a partir das datas cadastradas" : ""}
            </div>
          )}
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Rotulo>Etapa</Rotulo>
            <select className={CAMPO} value={colunaAtual} disabled={movendo} onChange={(e) => aoMudarEtapa(e.target.value as ColunaFinId)}>
              {COLUNAS_FIN.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {movendo && <span className="text-[10px] text-gray-400">Movendo…</span>}
            {erroMover && <div className="text-[11px] text-red-600 mt-1">{erroMover}</div>}
          </div>
          {grupo === "processo" && (
            <div>
              <Rotulo>Status do andamento</Rotulo>
              <select className={CAMPO} value={statusAndamento ?? ""} onChange={(e) => void mudarStatus(e.target.value)}>
                {statusAndamento && STATUS_CONFORMIDADE.includes(statusAndamento) && <option value={statusAndamento}>{statusAndamento}</option>}
                {statusDaColuna.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {erroStatus && <div className="text-[11px] text-red-600 mt-1">{erroStatus}</div>}
            </div>
          )}
          <div>
            <Rotulo>Responsável pelo acompanhamento</Rotulo>
            <CampoSelectAuto
              valor={responsavelId}
              vazio="Sem responsável"
              opcoes={responsaveis.map((r) => ({ valor: r.id, rotulo: r.nome }))}
              salvar={(v) => {
                setResponsavelId(v);
                return salvar("responsavel_id")(v);
              }}
            />
          </div>
          <div>
            <Rotulo>Próximo retorno</Rotulo>
            <CampoDataAuto valor={d.proximaAcaoData} salvar={salvar("proxima_acao_data")} />
          </div>
          <div className="md:col-span-2">
            <Rotulo>O que fazer no próximo retorno</Rotulo>
            <CampoTextoAuto valor={d.proximaAcaoTexto} salvar={salvar("proxima_acao_texto")} placeholder="Ex.: cobrar o laudo do engenheiro" />
          </div>
        </div>

        {pedindoDesfecho && (
          <div className="mt-3 border border-amber-200 bg-amber-50 rounded-lg p-3 flex flex-col gap-2">
            <div className="text-xs font-semibold text-amber-800">Desfecho do encerramento</div>
            <select className={CAMPO} value={desfecho} onChange={(e) => setDesfecho(e.target.value)}>
              <option value="">Escolha o desfecho…</option>
              {ENCERRAMENTOS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <textarea className={CAMPO} rows={2} value={motivoDesfecho} onChange={(e) => setMotivoDesfecho(e.target.value)} placeholder="Motivo (opcional)" />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!desfecho || movendo}
                onClick={() => void mover("encerrado", { encerramento: desfecho, motivo: motivoDesfecho || null })}
                className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
              >
                Confirmar
              </button>
              <button type="button" onClick={() => setPedindoDesfecho(false)} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Conformidade */}
      {mostrarConformidade && (
        <div className={CARTAO}>
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="text-sm font-bold text-gray-800">Conformidade</div>
            <div className="text-[11px] text-gray-500">
              {totalConformes} conforme(s) · {totalInconformes} inconformidade(s)
            </div>
          </div>

          {colunaAtual === "conformidade" && (
            <div className="grid md:grid-cols-3 gap-3 mb-3">
              <div className="md:col-span-3 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={trabalhando}
                  onClick={() => void registrarConf("Conforme")}
                  className="text-xs bg-green-600 text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60"
                >
                  Marcar como Conforme
                </button>
                <span className="text-[11px] text-gray-400">ou registre a inconformidade apontada pelo banco:</span>
              </div>
              <div className="md:col-span-2">
                <Rotulo>Motivo da inconformidade</Rotulo>
                <select className={CAMPO} value={motivoInc} onChange={(e) => setMotivoInc(e.target.value)}>
                  <option value="">Escolha o motivo…</option>
                  {MOTIVOS_INCONFORMIDADE.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <Rotulo>Detalhe (opcional)</Rotulo>
                <input className={CAMPO} value={notaInc} onChange={(e) => setNotaInc(e.target.value)} />
              </div>
              <div className="md:col-span-3">
                <button
                  type="button"
                  disabled={!motivoInc || trabalhando}
                  onClick={() => void registrarConf("Inconforme")}
                  className="text-xs bg-red-600 text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
                >
                  Registrar inconformidade
                </button>
              </div>
            </div>
          )}
          {erroConf && <div className="text-[11px] text-red-600 mb-2">{erroConf}</div>}

          {inconformidadesAbertas.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {inconformidadesAbertas.map((a) => (
                <div key={a.id} className="border border-red-200 bg-red-50 rounded-lg p-2.5">
                  <div className="text-xs font-semibold text-red-700">
                    Inconformidade aberta há {duracao(a.inicio, null)} — {a.motivo}
                  </div>
                  {a.nota && <div className="text-[11px] text-red-700/80 mt-0.5 whitespace-pre-wrap">{a.nota}</div>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <input
                      className={`${CAMPO} md:max-w-xs`}
                      placeholder="O que foi feito para resolver"
                      value={notaResolucao[a.id] ?? ""}
                      onChange={(e) => setNotaResolucao((n) => ({ ...n, [a.id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      disabled={trabalhando}
                      onClick={() => void resolver(a.id)}
                      className="text-xs bg-white border border-red-300 text-red-700 rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60"
                    >
                      Marcar como resolvida
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col divide-y divide-gray-100 border-t border-gray-100">
            {atividades
              .filter((a) => a.tipo === TIPO_INCONFORMIDADE || a.tipo === TIPO_CONFORMIDADE)
              .map((a) => (
                <div key={a.id} className="py-1.5 text-xs flex items-center gap-2 flex-wrap">
                  <span className={`font-semibold ${a.tipo === TIPO_CONFORMIDADE ? "text-green-700" : "text-red-600"}`}>
                    {a.tipo === TIPO_CONFORMIDADE ? "Conforme" : "Inconformidade"}
                  </span>
                  {a.motivo && <span className="text-gray-600">· {a.motivo}</span>}
                  {a.tipo === TIPO_INCONFORMIDADE && a.fim && <span className="text-gray-400">· resolvida em {duracao(a.inicio, a.fim)}</span>}
                  <span className="text-[10px] text-gray-400 ml-auto">{formatarDataHora(a.inicio)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Verificações automáticas */}
      {d.verificacoes.length > 0 && (
        <div className={CARTAO}>
          <div className={TITULO}>Conferência automática</div>
          <div className="flex flex-col gap-1.5">
            {d.verificacoes.map((v) => (
              <div key={v.chave} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-0.5 inline-block w-2 h-2 rounded-full shrink-0 ${
                    v.situacao === "ok" ? "bg-green-500" : v.situacao === "alerta" ? "bg-red-500" : "bg-gray-300"
                  }`}
                />
                <div>
                  <span className="font-semibold text-gray-700">{v.titulo}:</span> <span className="text-gray-600">{v.detalhe}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Limites de referência (Lei 4.380/64 e normas do CMN/Caixa). Os manuais da Caixa mudam por circular: confirme na versão vigente.
          </p>
        </div>
      )}

      {/* Checklist */}
      <div className={CARTAO}>
        <div className={TITULO}>Checklist do processo</div>
        {erroChecklist && <div className="text-[11px] text-red-600 mb-2">{erroChecklist}</div>}
        <div className="flex flex-col gap-2">
          {gruposChecklist.map((g) => {
            const itens = g.itens.filter((i) => !i.soSeFgts || d.usaFgts);
            const feitos = itens.filter((i) => checklist[i.chave]?.feito).length;
            const aberto = g.coluna === colunaAtual;
            return (
              <details key={g.id} className="border border-gray-100 rounded-lg" open={aberto}>
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-700 flex items-center justify-between gap-2">
                  <span>{g.titulo}</span>
                  <span className={`text-[10px] ${feitos === itens.length ? "text-green-600" : "text-gray-400"}`}>
                    {feitos}/{itens.length}
                  </span>
                </summary>
                <div className="px-3 pb-2 flex flex-col">
                  {itens.map((i) => {
                    const feito = !!checklist[i.chave]?.feito;
                    return (
                      <label key={i.chave} className="flex items-start gap-2 py-1 text-xs text-gray-700 cursor-pointer hover:bg-gray-50 rounded px-1">
                        <input type="checkbox" className="mt-0.5" checked={feito} onChange={(e) => void alternar(i.chave, e.target.checked)} />
                        <span className={feito ? "text-gray-400 line-through" : ""}>
                          {i.titulo}
                          {i.ref && <span className="text-[10px] text-gray-400"> — {i.ref}</span>}
                        </span>
                        {feito && checklist[i.chave]?.data && (
                          <span className="text-[10px] text-gray-400 ml-auto shrink-0">{dataBr(checklist[i.chave]!.data!)}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      {/* Tempo por etapa + linha do tempo */}
      <div className={CARTAO}>
        <div className={TITULO}>Tempo por etapa</div>
        {tempoPorEtapa.length === 0 ? (
          <div className="text-[11px] text-gray-400">Ainda sem etapas registradas.</div>
        ) : (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-xs min-w-[320px]">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="font-normal py-1 border-b border-gray-100">Etapa / status</th>
                  <th className="font-normal py-1 border-b border-gray-100 text-right">Passagens</th>
                  <th className="font-normal py-1 border-b border-gray-100 text-right">Tempo total</th>
                </tr>
              </thead>
              <tbody>
                {tempoPorEtapa.map((t) => (
                  <tr key={t.etapa}>
                    <td className="py-1 border-b border-gray-50 text-gray-700">{t.etapa}</td>
                    <td className="py-1 border-b border-gray-50 text-right text-gray-500">{t.passagens}</td>
                    <td className="py-1 border-b border-gray-50 text-right font-medium text-gray-800">
                      {t.dias < 1 ? "menos de 1 dia" : `${t.dias.toFixed(1).replace(".", ",")} dias`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-xs font-semibold text-gray-700 mb-1">Linha do tempo</div>
        <div className="flex flex-col divide-y divide-gray-100 border-t border-gray-100">
          {atividades.length === 0 && <div className="text-[11px] text-gray-400 py-3">Nada registrado ainda.</div>}
          {atividades.map((a) => (
            <div key={a.id} className="py-2 text-xs text-gray-700">
              <div className="flex items-center gap-2 flex-wrap">
                {a.tipo === TIPO_ETAPA && (
                  <>
                    <span className="font-semibold">Etapa: {a.etapa}</span>
                    <span className="text-gray-500">
                      · {a.fim ? `ficou ${duracao(a.inicio, a.fim)}` : `em andamento há ${duracao(a.inicio, null)}`}
                      {a.estimado ? " (início estimado)" : ""}
                    </span>
                    {a.motivo && <span className="text-gray-500">· {a.motivo}</span>}
                  </>
                )}
                {a.tipo === TIPO_NOTA_FIN && <span className="font-semibold text-gray-600">{a.etapa}</span>}
                {a.tipo === TIPO_CONFORMIDADE && <span className="font-semibold text-green-700">Conforme</span>}
                {a.tipo === TIPO_INCONFORMIDADE && <span className="font-semibold text-red-600">Inconformidade: {a.motivo}</span>}
                {a.tipo === TIPO_CONTATO_FIN && (
                  <>
                    <span className="font-semibold">{a.etapa ?? "Contato"}</span>
                    {a.resultado && <span>· {a.resultado}</span>}
                  </>
                )}
                {a.resultado === "importado-log" && (
                  <span className="text-[9px] text-gray-400 border border-gray-200 rounded-full px-1.5" title="Reconstituído do histórico de alterações do sistema">
                    histórico
                  </span>
                )}
                <span className="text-[10px] text-gray-400 ml-auto">
                  {formatarDataHora(a.inicio)}
                  {a.por ? ` · ${a.por.split(" ")[0]}` : ""}
                </span>
              </div>
              {a.nota && a.tipo !== TIPO_ETAPA && <div className="text-[11px] text-gray-600 mt-0.5 whitespace-pre-wrap">{a.nota}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Notas */}
      <div className={CARTAO}>
        <div className={TITULO}>Anotações gerais</div>
        <CampoTextoAuto valor={d.notas} salvar={salvar("notas")} multilinha linhas={4} placeholder="Observações do processo, combinados com o banco, etc." />
      </div>

      <div className="text-[10px] text-gray-400">Tudo que você preenche aqui é salvo automaticamente.</div>
    </div>
  );
}
