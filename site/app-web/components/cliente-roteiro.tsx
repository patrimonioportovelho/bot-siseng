"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ATALHOS_DE_DATA, TEMPERATURAS, TIPOS_ATIVIDADE_CRM, somarDias } from "@/lib/crm/atividades";
import { DESFECHOS, ETAPAS, PRIMEIRA_PERGUNTA, SEGMENTOS, type Pergunta, type Segmento } from "@/lib/crm/roteiro";
import { aplicarEdicoes, type EdicoesRoteiro } from "@/lib/crm/roteiro-edicoes";
import { CAMPOS_FICHA, type FichaDoCliente } from "@/lib/crm/ficha";
import { CampoDaFicha, dataDoSistema } from "@/components/cliente-ficha";
import { MAXIMO_TENTATIVAS, avancar, criarMotor, desfechoFinal, temOptOut, type Motor, type Resposta, type Respostas } from "@/lib/crm/roteiro-motor";
import type { AtendimentoTela, AtendimentosDoCliente, Conclusao, ProximaEscolhida } from "@/lib/crm/atendimento-servidor";

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";
const LABEL = "text-[11px] text-gray-600 block mb-0.5";

type Resp<T> = ({ ok: true } & T) | { ok: false; erro: string };

export type AcoesRoteiro = {
  salvar: (clienteId: string, d: { id?: string | null; segmento: string; caminho: string[]; respostas: Respostas }) => Promise<Resp<{ id: string }>>;
  descartar: (clienteId: string, atendimentoId: string) => Promise<Resp<object>>;
  concluir: (clienteId: string, d: { id?: string | null; segmento: string; caminho: string[]; respostas: Respostas; proxima: ProximaEscolhida | null }) => Promise<Resp<Conclusao>>;
};

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Porto_Velho", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const diaMes = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const rotuloSegmento = (s: string) => SEGMENTOS.find((x) => x.id === s)?.rotulo ?? s;

function Selo({ desfecho }: { desfecho: keyof typeof DESFECHOS }) {
  const d = DESFECHOS[desfecho];
  return <span className={`text-[10px] font-bold rounded-full border px-2 py-0.5 ${d.cor}`}>{d.rotulo}</span>;
}

// Barra de etapas: a atual em destaque, as já respondidas em verde.
function Etapas({ atual, caminho, mapa }: { atual: string | null; caminho: string[]; mapa: Motor["mapa"] }) {
  const feitas = new Set(caminho.slice(0, -1).map((id) => mapa.get(id)?.etapa));
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {ETAPAS.map((e) => {
        const ativa = e.id === atual;
        const feita = !ativa && (atual === null || feitas.has(e.id));
        return (
          <div key={e.id} className="flex-1 min-w-[84px]">
            <div className={`h-1.5 rounded-full ${ativa ? "bg-orange-500" : feita && feitas.has(e.id) ? "bg-green-500" : "bg-gray-200"}`} />
            <div className={`text-[10px] mt-1 text-center ${ativa ? "font-bold text-orange-700" : "text-gray-400"}`}>{e.rotulo}</div>
          </div>
        );
      })}
    </div>
  );
}

function CampoData({ r, hoje, atalhos, comHora, aoMudar }: { r: Resposta; hoje: string; atalhos: number[]; comHora?: boolean; aoMudar: (p: Partial<Resposta>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {atalhos.map((dias) => {
        const d = somarDias(hoje, dias);
        return (
          <button
            key={dias}
            type="button"
            onClick={() => aoMudar({ data: d })}
            className={`text-xs rounded-full border px-3 py-1.5 font-semibold ${r.data === d ? "bg-orange-600 text-white border-orange-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            {dias === 0 ? "Hoje" : dias === 1 ? "Amanhã" : `${dias} dias`} <span className="opacity-70">({diaMes(d)})</span>
          </button>
        );
      })}
      <input type="date" min={hoje} value={r.data ?? ""} onChange={(e) => aoMudar({ data: e.target.value })} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white" />
      {comHora && <input type="time" value={r.hora ?? ""} onChange={(e) => aoMudar({ hora: e.target.value })} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white" aria-label="Horário" />}
    </div>
  );
}

// Roteiro de atendimento guiado: uma pergunta por vez, com fala sugerida; cada resposta leva à próxima; no fim, o
// resumo e a próxima atividade. Pode pausar e retomar depois. O conteúdo está em lib/crm/roteiro.ts.
export function ClienteRoteiro({
  clienteId,
  nome,
  assistente,
  imovel,
  hoje,
  segmentoSugerido,
  inicial,
  responsaveis,
  corretorId,
  acoes,
  edicoes,
  ficha,
  antesDeLigar,
  aoConcluir,
  aoPedirModelo
}: {
  clienteId: string;
  nome: string;
  assistente: string;
  imovel: string | null;
  hoje: string;
  segmentoSugerido: Segmento;
  inicial: AtendimentosDoCliente;
  responsaveis: { id: string; nome: string }[];
  corretorId: string | null;
  acoes: AcoesRoteiro;
  // textos e opções alterados pelo administrativo
  edicoes: EdicoesRoteiro;
  // ficha de relacionamento (preenchida na etapa "Relacionamento")
  ficha: FichaDoCliente;
  // resumo mostrado antes de começar
  antesDeLigar?: ReactNode;
  aoConcluir: (r: Conclusao) => void;
  aoPedirModelo: (modeloId: string) => void;
}) {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome;
  const [dados, setDados] = useState(inicial);
  const [modo, setModo] = useState<"inicio" | "perguntas" | "resumo" | "concluido">("inicio");
  const [segmento, setSegmento] = useState<Segmento>(inicial.aberto?.segmento ?? segmentoSugerido);
  const [caminho, setCaminho] = useState<string[]>([PRIMEIRA_PERGUNTA]);
  const [respostas, setRespostas] = useState<Respostas>({});
  const [proxima, setProxima] = useState<ProximaEscolhida | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<Conclusao | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const idRef = useRef<string | null>(inicial.aberto?.id ?? null);
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const raiz = useRef<HTMLDivElement>(null);
  const motor = useMemo(() => criarMotor(aplicarEdicoes(edicoes)), [edicoes]);

  const perguntaId = caminho[caminho.length - 1];
  const pergunta = motor.mapa.get(perguntaId) as Pergunta;
  const resposta: Resposta = respostas[perguntaId] ?? {};
  const ctx = motor.contextoDe(segmento, caminho, respostas);

  // Salvamentos em fila (um de cada vez), para nunca criar dois atendimentos abertos.
  function salvar(seg: Segmento, cam: string[], resp: Respostas) {
    fila.current = fila.current.then(async () => {
      const r = await acoes.salvar(clienteId, { id: idRef.current, segmento: seg, caminho: cam, respostas: resp });
      if (r.ok) idRef.current = r.id;
      else setErro(r.erro);
    }).catch(() => setErro("Não consegui salvar o andamento. Verifique a internet; suas respostas continuam na tela."));
    return fila.current;
  }

  const rolar = () => setTimeout(() => raiz.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

  const mudar = (parcial: Partial<Resposta>) => {
    setErro("");
    setRespostas((x) => ({ ...x, [perguntaId]: { ...(x[perguntaId] ?? {}), ...parcial } }));
  };

  function escolher(opcaoId: string) {
    if (pergunta.tipo !== "multipla") return mudar({ v: [opcaoId] });
    const atuais = resposta.v ?? [];
    // "Nada novo" não combina com os outros
    const exclusivas = ["Nada novo", "Nada específico", "Ainda não sabe"];
    let novas = atuais.includes(opcaoId) ? atuais.filter((v) => v !== opcaoId) : [...atuais, opcaoId];
    if (!atuais.includes(opcaoId)) novas = exclusivas.includes(opcaoId) ? [opcaoId] : novas.filter((v) => !exclusivas.includes(v));
    mudar({ v: novas });
  }

  // Preenche o que o caminho já sugere ao chegar numa pergunta (datas e a ação do "QUER").
  function preparar(id: string, cam: string[], resp: Respostas): Respostas {
    const p = motor.mapa.get(id);
    if (!p || resp[id]) return resp;
    const c = motor.contextoDe(segmento, cam, resp);
    if (p.tipo === "data") {
      const dias = id === "D_FUT_QUANDO" ? (c.diasRetorno ?? 30) : id === "C2" ? 1 : 0;
      return { ...resp, [id]: { data: somarDias(hoje, dias) } };
    }
    if (id === "D_QUER") {
      const sugestao = c.tags.includes("avaliacao") ? "avaliacao" : c.tags.includes("visita") ? "visita" : c.tags.includes("simulacao") ? "simulacao" : null;
      if (sugestao) return { ...resp, [id]: { v: [sugestao] } };
    }
    return resp;
  }

  function seguir() {
    const falha = motor.validarResposta(pergunta, respostas[perguntaId], respostas, hoje);
    if (falha) {
      setErro(falha);
      return;
    }
    setErro("");
    const prox = motor.proximaPergunta(segmento, caminho, respostas);
    if (prox === "FIM") {
      const c = motor.contextoDe(segmento, caminho, respostas);
      const desfecho = desfechoFinal(c, dados.tentativasSeguidas);
      const s = motor.sugerirProxima(c, desfecho, respostas, hoje, dados.tentativasSeguidas, primeiroNome);
      setProxima(s.obrigatoria ? { tipo: s.tipo, titulo: s.titulo, data: s.data, hora: s.hora, responsavelId: corretorId } : null);
      setModo("resumo");
      void salvar(segmento, caminho, respostas);
      rolar();
      return;
    }
    const novoCaminho = avancar(caminho, prox);
    let novas = respostas;
    // voltou para ajustar: a confirmação do resumo precisa ser respondida de novo
    if (caminho.includes(prox) && novas.Q_CONF) {
      novas = { ...novas };
      delete novas.Q_CONF;
    }
    novas = preparar(prox, novoCaminho, novas);
    setCaminho(novoCaminho);
    setRespostas(novas);
    void salvar(segmento, novoCaminho, novas);
    rolar();
  }

  function voltar() {
    setErro("");
    if (modo === "resumo") {
      setModo("perguntas");
      return;
    }
    if (caminho.length > 1) setCaminho(caminho.slice(0, -1));
  }

  function iniciar() {
    setErro("");
    setResultado(null);
    idRef.current = null;
    setCaminho([PRIMEIRA_PERGUNTA]);
    setRespostas({});
    setModo("perguntas");
    rolar();
  }

  function continuar(a: AtendimentoTela) {
    idRef.current = a.id;
    setSegmento(a.segmento);
    const cam = a.caminho.length && a.caminho.every((c) => motor.mapa.has(c)) ? a.caminho : [PRIMEIRA_PERGUNTA];
    setCaminho(cam);
    setRespostas(a.respostas);
    setResultado(null);
    setErro("");
    setModo("perguntas");
    rolar();
  }

  async function pausar() {
    setOcupado(true);
    await salvar(segmento, caminho, respostas);
    setOcupado(false);
    if (idRef.current) {
      const id = idRef.current;
      setDados((d) => ({
        ...d,
        aberto: { id, segmento, status: "em_andamento", caminho, respostas, desfecho: null, temperatura: null, resumo: null, por: assistente, criadoEm: d.aberto?.criadoEm ?? new Date().toISOString(), concluidoEm: null }
      }));
      setModo("inicio");
    }
  }

  async function descartar(id: string | null) {
    if (!window.confirm("Descartar este atendimento em andamento? As respostas serão perdidas.")) return;
    setOcupado(true);
    await fila.current;
    if (id) {
      const r = await acoes.descartar(clienteId, id);
      if (!r.ok) {
        setErro(r.erro);
        setOcupado(false);
        return;
      }
    }
    setOcupado(false);
    idRef.current = null;
    setDados((d) => ({ ...d, aberto: null }));
    setModo("inicio");
  }

  async function concluir() {
    setOcupado(true);
    setErro("");
    await fila.current;
    try {
      const r = await acoes.concluir(clienteId, { id: idRef.current, segmento, caminho, respostas, proxima });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      idRef.current = null;
      setDados(r.atendimentos);
      setResultado(r);
      setModo("concluido");
      aoConcluir(r);
      rolar();
    } catch {
      setErro("Não foi possível concluir agora. Suas respostas continuam na tela: tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  const desfechoPrevisto = desfechoFinal(ctx, dados.tentativasSeguidas);
  const temperatura = modo === "resumo" ? motor.temperaturaFinal(ctx, desfechoPrevisto, caminho, respostas, hoje) : null;
  const opcoesComObs = (pergunta?.opcoes ?? []).some((o) => o.obsObrigatoria && resposta.v?.includes(o.id));
  const respostaDaObjecao = pergunta?.opcoes?.find((o) => o.resposta && resposta.v?.includes(o.id))?.resposta;

  const camposDescobertos = perguntaId === "R1" ? CAMPOS_FICHA.filter((c) => resposta.v?.includes(c.descoberta)) : [];

  return (
    <div ref={raiz} className="bg-white border border-gray-200 rounded-xl p-4 scroll-mt-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="text-sm font-bold text-gray-800">Roteiro de atendimento</div>
        {modo === "perguntas" || modo === "resumo" ? (
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-400">{rotuloSegmento(ctx.segmento)}</span>
            <button type="button" onClick={() => void pausar()} disabled={ocupado} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-gray-600 disabled:opacity-50">
              ⏸ Pausar
            </button>
            <button type="button" onClick={() => void descartar(idRef.current)} disabled={ocupado} className="text-[11px] text-gray-400 hover:text-red-600">
              Descartar
            </button>
          </div>
        ) : null}
      </div>

      {/* ---------- Início ---------- */}
      {modo === "inicio" && (
        <div className="flex flex-col gap-3">
          {antesDeLigar}
          <p className="text-[11px] text-gray-500">Passo a passo para conduzir a conversa. Marque as respostas durante ou logo depois da ligação: o sistema registra o contato, a temperatura e a próxima atividade.</p>
          {dados.tentativasSeguidas > 0 && (
            <div className="text-[11px] rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
              {dados.tentativasSeguidas} de {MAXIMO_TENTATIVAS} tentativas sem resposta. {dados.tentativasSeguidas === MAXIMO_TENTATIVAS - 1 ? "Se não atender agora, vira “Sem contato” e volta em 60 dias." : ""}
            </div>
          )}
          {dados.aberto ? (
            <div className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-orange-900">
                <b>Atendimento pausado</b> · {rotuloSegmento(dados.aberto.segmento)} · começado em {dataHora(dados.aberto.criadoEm)}
                {dados.aberto.por ? ` por ${dados.aberto.por.split(" ")[0]}` : ""}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => continuar(dados.aberto as AtendimentoTela)} className="text-xs bg-orange-600 text-white rounded-lg px-4 py-1.5 font-semibold">
                  Continuar
                </button>
                <button type="button" onClick={() => void descartar(dados.aberto?.id ?? null)} disabled={ocupado} className="text-[11px] text-gray-500 hover:text-red-600">
                  Descartar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-2 flex-wrap">
              <div className="min-w-60">
                <label className={LABEL}>Segmento (roteiro)</label>
                <select className={CAMPO} value={segmento} onChange={(e) => setSegmento(e.target.value as Segmento)}>
                  {SEGMENTOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.rotulo}
                      {s.id === segmentoSugerido ? " (sugerido)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={iniciar} className="text-xs bg-orange-600 text-white rounded-lg px-5 py-2 font-semibold hover:opacity-90">
                ▶ Iniciar atendimento
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- Perguntas ---------- */}
      {modo === "perguntas" && pergunta && (
        <div className="flex flex-col gap-3">
          <Etapas atual={pergunta.etapa} caminho={caminho} mapa={motor.mapa} />

          {pergunta.fala && (
            <div className="rounded-lg border-l-4 border-blue-400 bg-blue-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-blue-500 font-bold">Fala sugerida</div>
              <div className="text-sm text-blue-900 mt-0.5">“{motor.preencherFala(pergunta.fala, { nome: primeiroNome, assistente, imovel, respostas })}”</div>
            </div>
          )}
          {pergunta.dica && <div className="text-[11px] text-gray-500">💡 {pergunta.dica}</div>}

          <div className="text-base font-bold text-gray-900">{pergunta.texto}</div>

          {(pergunta.tipo === "unica" || pergunta.tipo === "multipla" || pergunta.tipo === "indicacao") && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {pergunta.opcoes?.filter((o) => !o.oculta || resposta.v?.includes(o.id)).map((o) => {
                const marcada = !!resposta.v?.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={marcada}
                    onClick={() => escolher(o.id)}
                    className={`text-left text-sm rounded-xl border-2 px-3.5 py-3 font-semibold transition-colors ${marcada ? "border-orange-500 bg-orange-50 text-orange-900" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"}`}
                  >
                    <span className="mr-2">{pergunta.tipo === "multipla" ? (marcada ? "☑" : "☐") : marcada ? "◉" : "○"}</span>
                    {o.rotulo}
                  </button>
                );
              })}
            </div>
          )}

          {perguntaId === "R1" && camposDescobertos.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-[11px] font-bold text-gray-700 mb-2">Anote na ficha de relacionamento (opcional)</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {camposDescobertos.map((c) => (
                  <CampoDaFicha
                    key={c.id}
                    campo={c}
                    valor={resposta.ficha?.[c.id] ?? ficha.dados[c.id]}
                    travado={dataDoSistema(c.id, ficha)}
                    aoMudar={(v) => mudar({ ficha: { ...(resposta.ficha ?? {}), [c.id]: v } })}
                  />
                ))}
              </div>
            </div>
          )}

          {respostaDaObjecao && (
            <div className="rounded-lg border-l-4 border-green-400 bg-green-50 px-3 py-2 text-sm text-green-900">
              <span className="text-[10px] uppercase tracking-wide text-green-600 font-bold block">Resposta sugerida</span>“{respostaDaObjecao}”
            </div>
          )}

          {pergunta.tipo === "indicacao" && resposta.v?.includes("indicou") && (
            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <label className={LABEL}>Nome da pessoa indicada *</label>
                <input className={CAMPO} value={resposta.nome ?? ""} onChange={(e) => mudar({ nome: e.target.value })} maxLength={120} />
              </div>
              <div>
                <label className={LABEL}>Telefone com DDD *</label>
                <input className={CAMPO} value={resposta.telefone ?? ""} onChange={(e) => mudar({ telefone: e.target.value })} maxLength={25} inputMode="tel" placeholder="(69) 90000-0000" />
              </div>
            </div>
          )}

          {pergunta.tipo === "texto" && (
            <textarea className={CAMPO} rows={3} value={resposta.texto ?? ""} onChange={(e) => mudar({ texto: e.target.value })} maxLength={600} placeholder={pergunta.opcional ? "Opcional" : "Escreva aqui"} />
          )}

          {pergunta.tipo === "data" && <CampoData r={resposta} hoje={hoje} atalhos={pergunta.atalhosDias ?? [1, 7, 30]} comHora={pergunta.comHora} aoMudar={mudar} />}

          {pergunta.tipo === "gancho" && (
            <div className="grid md:grid-cols-3 gap-2">
              <div className="md:col-span-2">
                <label className={LABEL}>Gancho {respostas.R1?.v?.includes("Nada novo") ? "(opcional)" : "*"}</label>
                <input className={CAMPO} value={resposta.texto ?? ""} onChange={(e) => mudar({ texto: e.target.value })} maxLength={200} placeholder="Ex.: vai para Portugal em março" />
              </div>
              <div>
                <label className={LABEL}>Lembrar em (opcional)</label>
                <input type="date" min={hoje} className={CAMPO} value={resposta.lembrar ?? ""} onChange={(e) => mudar({ lembrar: e.target.value })} />
              </div>
            </div>
          )}

          <input
            className={CAMPO}
            value={resposta.obs ?? ""}
            onChange={(e) => mudar({ obs: e.target.value })}
            maxLength={600}
            placeholder={opcoesComObs ? "Observação (obrigatória nesta resposta) *" : "Observação (opcional)"}
          />

          {erro && <div className="text-xs text-red-600">{erro}</div>}

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={voltar} disabled={caminho.length <= 1} className="text-xs border border-gray-300 rounded-lg px-4 py-2 font-semibold text-gray-600 disabled:opacity-40">
              ← Voltar
            </button>
            <button type="button" onClick={seguir} className="text-sm bg-orange-600 text-white rounded-lg px-6 py-2 font-semibold hover:opacity-90">
              Próxima →
            </button>
          </div>
        </div>
      )}

      {/* ---------- Resumo ---------- */}
      {modo === "resumo" && (
        <div className="flex flex-col gap-3">
          <Etapas atual={null} caminho={[...caminho, ""]} mapa={motor.mapa} />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Desfecho:</span>
            <Selo desfecho={desfechoPrevisto} />
            {temperatura && (
              <span className={`text-[10px] font-bold rounded-full border px-2 py-0.5 ${TEMPERATURAS[temperatura].cor}`}>
                {TEMPERATURAS[temperatura].icone} {TEMPERATURAS[temperatura].rotulo}
              </span>
            )}
            {temOptOut(ctx) && <span className="text-[10px] font-bold rounded-full border px-2 py-0.5 bg-red-50 text-red-700 border-red-300">⛔ Opt-out</span>}
          </div>

          <div className="rounded-lg border border-gray-100 divide-y divide-gray-100">
            {motor.resumoDoAtendimento(caminho, respostas).map((l) => (
              <div key={l.id} className="px-3 py-1.5 text-xs flex gap-2">
                <span className="text-gray-500 w-40 shrink-0">{l.rotulo}</span>
                <span className="text-gray-800">{l.texto}</span>
              </div>
            ))}
          </div>

          <ul className="text-[11px] text-gray-600 list-disc pl-4">
            {desfechoPrevisto === "quer" && <li>{corretorId ? "O corretor responsável será avisado e terá “Ligar” para hoje." : "Cliente sem corretor: a equipe será avisada para transferir."}</li>}
            {ctx.adm.map((a) => (
              <li key={a}>O administrativo será avisado: {a}.</li>
            ))}
            {ctx.telefoneInvalido && <li>O telefone será marcado como inválido.</li>}
            {temOptOut(ctx) && <li>Os contatos de marketing serão bloqueados (opt-out). Não há próxima atividade.</li>}
            {respostas.IND?.v?.includes("indicou") && caminho.includes("IND") && <li>A pessoa indicada será cadastrada como lead.</li>}
          </ul>

          {proxima && (
            <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-3">
              <div className="text-xs font-bold text-orange-900 mb-2">Próxima atividade (obrigatória)</div>
              <div className="grid md:grid-cols-4 gap-2">
                <div>
                  <label className={LABEL}>O que fazer</label>
                  <select className={CAMPO} value={proxima.tipo} onChange={(e) => setProxima({ ...proxima, tipo: e.target.value })}>
                    {TIPOS_ATIVIDADE_CRM.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={LABEL}>Descrição</label>
                  <input className={CAMPO} value={proxima.titulo} onChange={(e) => setProxima({ ...proxima, titulo: e.target.value })} maxLength={200} />
                </div>
                {responsaveis.length > 0 && (
                  <div>
                    <label className={LABEL}>Responsável</label>
                    <select className={CAMPO} value={proxima.responsavelId ?? ""} onChange={(e) => setProxima({ ...proxima, responsavelId: e.target.value || null })}>
                      <option value="">Corretor do cliente / eu</option>
                      {responsaveis.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="md:col-span-4">
                  <label className={LABEL}>Quando</label>
                  <CampoData r={{ data: proxima.data, hora: proxima.hora ?? "" }} hoje={hoje} atalhos={[0, ...ATALHOS_DE_DATA.map((a) => a.dias)]} comHora aoMudar={(p) => setProxima({ ...proxima, ...(p.data !== undefined ? { data: p.data } : {}), ...(p.hora !== undefined ? { hora: p.hora } : {}) })} />
                </div>
              </div>
            </div>
          )}

          {erro && <div className="text-xs text-red-600">{erro}</div>}

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={voltar} disabled={ocupado} className="text-xs border border-gray-300 rounded-lg px-4 py-2 font-semibold text-gray-600">
              ← Voltar
            </button>
            <button type="button" onClick={() => void concluir()} disabled={ocupado} className="text-sm bg-green-600 text-white rounded-lg px-6 py-2 font-semibold disabled:opacity-50 hover:opacity-90">
              {ocupado ? "Gravando..." : "✓ Concluir atendimento"}
            </button>
          </div>
        </div>
      )}

      {/* ---------- Concluído ---------- */}
      {modo === "concluido" && resultado && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <div className="text-sm font-bold text-green-800">Atendimento concluído ✓</div>
          <ul className="text-xs text-green-900 list-disc pl-4 mt-1">
            {resultado.feito.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {resultado.modelo && !resultado.crm.optOut && (
              <button type="button" onClick={() => aoPedirModelo(resultado.modelo as string)} className="text-xs bg-green-600 text-white rounded-lg px-3 py-1.5 font-semibold">
                Abrir a mensagem sugerida no WhatsApp
              </button>
            )}
            <button type="button" onClick={() => setModo("inicio")} className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold text-gray-600">
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* ---------- Histórico ---------- */}
      {modo !== "perguntas" && modo !== "resumo" && dados.historico.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="text-xs font-bold text-gray-800 mb-1.5">Atendimentos anteriores ({dados.historico.length})</div>
          <div className="flex flex-col divide-y divide-gray-100">
            {dados.historico.map((a) => (
              <div key={a.id} className="py-1.5">
                <button type="button" onClick={() => setAberto(aberto === a.id ? null : a.id)} className="w-full flex items-center gap-2 flex-wrap text-[11px] text-gray-600 text-left">
                  <span className="text-gray-400">
                    {dataHora(a.concluidoEm ?? a.criadoEm)}
                    {a.por ? ` · ${a.por.split(" ")[0]}` : ""}
                  </span>
                  <span>{rotuloSegmento(a.segmento)}</span>
                  {a.desfecho && <Selo desfecho={a.desfecho} />}
                  <span className="ml-auto text-primary underline">{aberto === a.id ? "ocultar" : "ver respostas"}</span>
                </button>
                {aberto === a.id && <pre className="text-[11px] text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-2.5 mt-1.5">{a.resumo}</pre>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
