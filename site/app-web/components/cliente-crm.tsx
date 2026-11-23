"use client";

import { useEffect, useRef, useState } from "react";
import {
  ATALHOS_DE_DATA,
  MOTIVOS_SEM_PROXIMA_ATIVIDADE,
  TIPOS_ATIVIDADE_CRM,
  linkFacebook,
  linkInstagram,
  somarDias,
  type AtividadeCliente,
  type CrmCliente
} from "@/lib/crm/atividades";
import type { ContatoRegistrado } from "@/lib/crm/servidor";

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";
const LABEL = "text-[11px] text-gray-600 block mb-0.5";
const CARTAO = "bg-white border border-gray-200 rounded-xl p-4";

type Resp<T> = ({ ok: true } & T) | { ok: false; erro: string };

// Ações do CRM (as do administrativo e as do portal têm a mesma forma).
export type AcoesCrm = {
  agendar: (clienteId: string, d: { tipo: string; titulo: string; data: string; hora?: string | null; responsavelId?: string | null; contatoId?: string | null; origem?: string }) => Promise<Resp<{ atividade: AtividadeCliente }>>;
  concluir: (atividadeId: string, d: { resultado?: string | null; nota?: string | null }) => Promise<Resp<{ atividade: AtividadeCliente; contato: ContatoRegistrado }>>;
  remover: (atividadeId: string) => Promise<Resp<object>>;
  semProxima: (clienteId: string, motivo: string, observacao?: string | null) => Promise<Resp<{ contato: ContatoRegistrado }>>;
  salvarCanais: (clienteId: string, d: { instagram: string | null; facebook: string | null; fonteDado: string | null; telefoneInvalido: boolean }) => Promise<Resp<{ crm: CrmCliente }>>;
  optOut: (clienteId: string, optOut: boolean, motivo: string | null) => Promise<Resp<{ crm: CrmCliente; contato: ContatoRegistrado }>>;
};

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });

export function situacaoDaAtividade(a: AtividadeCliente, hoje: string): "atrasada" | "hoje" | "futura" | "feita" {
  if (a.feito) return "feita";
  if (a.data < hoje) return "atrasada";
  return a.data === hoje ? "hoje" : "futura";
}

// ---------------------------------------------------------------------------------------------------------
// Próxima atividade: aparece depois de TODO contato (nota, WhatsApp, ligação, atividade concluída).
// ---------------------------------------------------------------------------------------------------------
export function ProximaAtividade({
  clienteId,
  clienteNome,
  hoje,
  titulo,
  tipoSugerido,
  origem,
  responsaveis,
  responsavelPadraoId,
  acoes,
  aoAgendar,
  aoPular,
  aoFechar
}: {
  clienteId: string;
  clienteNome: string;
  hoje: string;
  titulo: string;
  tipoSugerido: string;
  origem: string;
  responsaveis: { id: string; nome: string }[];
  responsavelPadraoId: string | null;
  acoes: AcoesCrm;
  aoAgendar: (a: AtividadeCliente) => void;
  aoPular: (c: ContatoRegistrado) => void;
  aoFechar: () => void;
}) {
  const primeiroNome = clienteNome.trim().split(/\s+/)[0] ?? clienteNome;
  const [tipo, setTipo] = useState(TIPOS_ATIVIDADE_CRM.includes(tipoSugerido) ? tipoSugerido : "Ligar");
  const [descricao, setDescricao] = useState("");
  const [editouDescricao, setEditouDescricao] = useState(false);
  const [data, setData] = useState(somarDias(hoje, 2));
  const [hora, setHora] = useState("");
  const [responsavelId, setResponsavelId] = useState(responsavelPadraoId ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [pulando, setPulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const raiz = useRef<HTMLDivElement>(null);

  // quando aparece, rola até a janela para não passar despercebida
  useEffect(() => {
    raiz.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const tituloAuto = `${tipo} — ${primeiroNome}`;
  const tituloFinal = editouDescricao ? descricao : tituloAuto;

  async function agendar() {
    setSalvando(true);
    setErro("");
    const r = await acoes.agendar(clienteId, { tipo, titulo: tituloFinal, data, hora: hora || null, responsavelId: responsavelId || null, origem });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    aoAgendar(r.atividade);
  }

  async function pular() {
    setSalvando(true);
    setErro("");
    const r = await acoes.semProxima(clienteId, motivo, obs.trim() || null);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    aoPular(r.contato);
  }

  return (
    <div ref={raiz} className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-bold text-orange-900">{titulo}</div>
          <div className="text-[11px] text-orange-800 mt-0.5">Todo contato termina com a próxima atividade marcada. Ela vai para a Agenda.</div>
        </div>
      </div>

      {!pulando ? (
        <div className="mt-3 grid md:grid-cols-4 gap-2.5">
          <div>
            <label className={LABEL}>O que fazer</label>
            <select className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_ATIVIDADE_CRM.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Descrição</label>
            <input
              className={CAMPO}
              value={tituloFinal}
              onChange={(e) => {
                setDescricao(e.target.value);
                setEditouDescricao(true);
              }}
              maxLength={200}
            />
          </div>
          {responsaveis.length > 0 ? (
            <div>
              <label className={LABEL}>Responsável</label>
              <select className={CAMPO} value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
                <option value="">Eu</option>
                {responsaveis.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div />
          )}

          <div className="md:col-span-3">
            <label className={LABEL}>Quando</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {ATALHOS_DE_DATA.map((a) => {
                const d = somarDias(hoje, a.dias);
                return (
                  <button
                    key={a.dias}
                    type="button"
                    onClick={() => setData(d)}
                    className={`text-[11px] rounded-full border px-2.5 py-1 font-semibold ${data === d ? "bg-orange-600 text-white border-orange-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
                  >
                    {a.rotulo} <span className="opacity-70">({dia(d)})</span>
                  </button>
                );
              })}
              <input type="date" className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white" value={data} min={hoje} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={LABEL}>Hora (opcional)</label>
            <input type="time" className={CAMPO} value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="mt-3 grid md:grid-cols-2 gap-2.5">
          <div>
            <label className={LABEL}>Por que não há próxima atividade?</label>
            <select className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Escolha o motivo…</option>
              {MOTIVOS_SEM_PROXIMA_ATIVIDADE.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Observação (opcional)</label>
            <input className={CAMPO} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {!pulando ? (
          <>
            <button type="button" onClick={() => void agendar()} disabled={salvando || !data} className="text-xs bg-orange-600 text-white rounded-lg px-4 py-1.5 font-semibold disabled:opacity-50 hover:opacity-90">
              {salvando ? "Agendando..." : "Agendar próxima atividade"}
            </button>
            <button type="button" onClick={() => setPulando(true)} className="text-xs text-orange-900 underline">
              Não há próxima atividade
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => void pular()} disabled={salvando || !motivo} className="text-xs bg-gray-700 text-white rounded-lg px-4 py-1.5 font-semibold disabled:opacity-50">
              {salvando ? "Salvando..." : "Registrar sem próxima atividade"}
            </button>
            <button type="button" onClick={() => setPulando(false)} className="text-xs text-orange-900 underline">
              Voltar e agendar
            </button>
          </>
        )}
        <button type="button" onClick={aoFechar} className="text-xs text-gray-500 hover:text-gray-800 ml-auto">
          Decidir depois
        </button>
        {erro && <span className="text-[11px] text-red-600 w-full">{erro}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Atividades do cliente (pendentes primeiro; atrasadas em vermelho)
// ---------------------------------------------------------------------------------------------------------
const RESULTADOS = ["Atendeu", "Não atendeu", "Respondeu", "Sem resposta", "Visita realizada", "Enviado", "Outro"];

export function CartaoAtividades({
  clienteId,
  hoje,
  atividades,
  acoes,
  aoConcluir,
  aoAgendarNova,
  aoRemover
}: {
  clienteId: string;
  hoje: string;
  atividades: AtividadeCliente[];
  acoes: AcoesCrm;
  aoConcluir: (a: AtividadeCliente, c: ContatoRegistrado) => void;
  aoAgendarNova: () => void;
  aoRemover: (id: string) => void;
}) {
  const [concluindoId, setConcluindoId] = useState<string | null>(null);
  const [resultado, setResultado] = useState("");
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mostrarFeitas, setMostrarFeitas] = useState(false);

  const pendentes = atividades.filter((a) => !a.feito).sort((a, b) => (a.data + (a.hora ?? "")).localeCompare(b.data + (b.hora ?? "")));
  const feitas = atividades.filter((a) => a.feito).sort((a, b) => (b.feitoEm ?? "").localeCompare(a.feitoEm ?? ""));
  const atrasadas = pendentes.filter((a) => a.data < hoje).length;

  async function concluir(a: AtividadeCliente) {
    setSalvando(true);
    setErro("");
    const r = await acoes.concluir(a.id, { resultado: resultado || null, nota: nota.trim() || null });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setConcluindoId(null);
    setResultado("");
    setNota("");
    aoConcluir(r.atividade, r.contato);
  }

  async function remover(id: string) {
    setErro("");
    const r = await acoes.remover(id);
    if (!r.ok) setErro(r.erro);
    else aoRemover(id);
  }

  return (
    <div className={CARTAO}>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="text-sm font-bold text-gray-800">
          Atividades agendadas
          {atrasadas > 0 && <span className="ml-2 text-[10px] font-bold rounded-full px-2 py-0.5 border bg-red-50 text-red-700 border-red-200">{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</span>}
        </div>
        <button type="button" onClick={aoAgendarNova} className="text-xs border border-orange-300 bg-orange-50 text-orange-800 rounded-lg px-3 py-1.5 font-semibold hover:bg-orange-100">
          + Agendar atividade
        </button>
      </div>

      {pendentes.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhuma atividade pendente. Agende a próxima para este cliente não ficar sem retorno.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {pendentes.map((a) => {
            const s = situacaoDaAtividade(a, hoje);
            const cor = s === "atrasada" ? "border-red-300 bg-red-50/50" : s === "hoje" ? "border-amber-300 bg-amber-50/50" : "border-gray-200";
            return (
              <div key={a.id} className={`border rounded-lg px-3 py-2 ${cor}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold rounded-full px-2 py-0.5 border bg-white text-gray-600 border-gray-200">{a.tipo}</span>
                  <span className="text-xs font-semibold text-gray-800">{a.titulo}</span>
                  <span className={`text-[11px] ml-auto ${s === "atrasada" ? "text-red-600 font-bold" : s === "hoje" ? "text-amber-700 font-semibold" : "text-gray-500"}`}>
                    {s === "atrasada" ? "Atrasada · " : s === "hoje" ? "Hoje · " : ""}
                    {dia(a.data)}
                    {a.hora ? ` às ${a.hora}` : ""}
                    {a.responsavelNome ? ` · ${a.responsavelNome.split(" ")[0]}` : ""}
                  </span>
                </div>
                {concluindoId === a.id ? (
                  <div className="mt-2 grid md:grid-cols-3 gap-2 items-end">
                    <div>
                      <label className={LABEL}>Como foi?</label>
                      <select className={CAMPO} value={resultado} onChange={(e) => setResultado(e.target.value)}>
                        <option value="">Escolha…</option>
                        {RESULTADOS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className={LABEL}>Anotação (opcional)</label>
                      <input className={CAMPO} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} />
                    </div>
                    <div className="md:col-span-3 flex items-center gap-2">
                      <button type="button" onClick={() => void concluir(a)} disabled={salvando} className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50">
                        {salvando ? "Salvando..." : "Concluir e agendar a próxima"}
                      </button>
                      <button type="button" onClick={() => setConcluindoId(null)} className="text-xs text-gray-500">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-3">
                    <button type="button" onClick={() => setConcluindoId(a.id)} className="text-[11px] text-green-700 font-semibold hover:underline">
                      ✓ Feito
                    </button>
                    <button type="button" onClick={() => void remover(a.id)} className="text-[11px] text-gray-400 hover:text-red-600">
                      Remover
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {erro && <div className="text-[11px] text-red-600 mt-2">{erro}</div>}

      {feitas.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setMostrarFeitas((v) => !v)} className="text-[11px] text-gray-500 underline">
            {mostrarFeitas ? "Ocultar" : "Ver"} concluídas ({feitas.length})
          </button>
          {mostrarFeitas && (
            <div className="mt-2 flex flex-col gap-1">
              {feitas.map((a) => (
                <div key={a.id} className="text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
                  <span className="text-green-600">✓</span>
                  <span className="line-through">{a.titulo}</span>
                  <span className="ml-auto">
                    {dia(a.data)}
                    {a.responsavelNome ? ` · ${a.responsavelNome.split(" ")[0]}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Canais para achar o cliente + LGPD (opt-out)
// ---------------------------------------------------------------------------------------------------------
export function CartaoCanais({
  clienteId,
  crm,
  telefone,
  acoes,
  aoMudar,
  aoOptOut
}: {
  clienteId: string;
  crm: CrmCliente;
  telefone: string | null;
  acoes: AcoesCrm;
  aoMudar: (c: CrmCliente) => void;
  aoOptOut: (c: CrmCliente, contato: ContatoRegistrado) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [instagram, setInstagram] = useState(crm.instagram ?? "");
  const [facebook, setFacebook] = useState(crm.facebook ?? "");
  const [fonte, setFonte] = useState(crm.fonteDado ?? "");
  const [invalido, setInvalido] = useState(crm.telefoneInvalido);
  const [estado, setEstado] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [motivoOpt, setMotivoOpt] = useState("");

  const semTelefone = !telefone || crm.telefoneInvalido;
  const ig = linkInstagram(crm.instagram);
  const fb = linkFacebook(crm.facebook);

  async function salvar() {
    setSalvando(true);
    setEstado("");
    const r = await acoes.salvarCanais(clienteId, { instagram: instagram || null, facebook: facebook || null, fonteDado: fonte || null, telefoneInvalido: invalido });
    setSalvando(false);
    if (!r.ok) setEstado(r.erro);
    else {
      aoMudar(r.crm);
      setEstado("Salvo ✓");
    }
  }

  async function optOut(valor: boolean) {
    setSalvando(true);
    setEstado("");
    const r = await acoes.optOut(clienteId, valor, valor ? motivoOpt : null);
    setSalvando(false);
    if (!r.ok) setEstado(r.erro);
    else {
      setSaindo(false);
      setMotivoOpt("");
      aoOptOut(r.crm, r.contato);
    }
  }

  return (
    <div className={CARTAO}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-bold text-gray-800">Canais e consentimento</div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {semTelefone ? "Sem telefone utilizável: procure o cliente pelas redes sociais e registre onde encontrou." : "Onde mais encontrar este cliente e se ele aceita receber novidades."}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ig && (
            <a href={ig} target="_blank" rel="noreferrer" className="text-[11px] border border-pink-200 bg-pink-50 text-pink-700 rounded-full px-2.5 py-1 font-semibold">
              Instagram ↗
            </a>
          )}
          {fb && (
            <a href={fb} target="_blank" rel="noreferrer" className="text-[11px] border border-blue-200 bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 font-semibold">
              Facebook ↗
            </a>
          )}
          <button type="button" onClick={() => setAberto((v) => !v)} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-gray-600">
            {aberto ? "Fechar" : "Editar"}
          </button>
        </div>
      </div>

      {aberto && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid md:grid-cols-3 gap-2.5">
            <div>
              <label className={LABEL}>Instagram (@usuario ou link)</label>
              <input className={CAMPO} value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario" maxLength={200} />
            </div>
            <div>
              <label className={LABEL}>Facebook (link ou nome do perfil)</label>
              <input className={CAMPO} value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="facebook.com/..." maxLength={300} />
            </div>
            <div>
              <label className={LABEL}>Onde encontrou este contato?</label>
              <input className={CAMPO} value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="Ex.: perfil público no Instagram" maxLength={300} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={invalido} onChange={(e) => setInvalido(e.target.checked)} />
            Telefone inválido ou número de outra pessoa
          </label>
          <p className="text-[11px] text-gray-500">
            Registre só o que é público ou que o cliente informou. Na primeira abordagem por rede social, se identifique e diga de onde veio o contato. Se o cliente pedir para parar, marque
            abaixo.
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void salvar()} disabled={salvando} className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50">
              {salvando ? "Salvando..." : "Salvar canais"}
            </button>
            {estado && <span className={`text-[11px] ${estado.startsWith("Salvo") ? "text-green-600" : "text-red-600"}`}>{estado}</span>}
          </div>
        </div>
      )}

      {/* LGPD */}
      <div className={`mt-3 rounded-lg border px-3 py-2 ${crm.optOut ? "border-red-200 bg-red-50/60" : "border-gray-200 bg-gray-50"}`}>
        {crm.optOut ? (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] text-red-800">
              ⛔ <b>Não quer receber novidades</b>
              {crm.optOutEm ? ` desde ${new Date(crm.optOutEm).toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho" })}` : ""}
              {crm.optOutMotivo ? ` — ${crm.optOutMotivo}` : ""}. Os contatos de marketing (WhatsApp do gerador e e-mail em lote) estão bloqueados.
            </div>
            <button type="button" onClick={() => void optOut(false)} disabled={salvando} className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold text-gray-700 disabled:opacity-50">
              Voltou a aceitar contatos
            </button>
          </div>
        ) : !saindo ? (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] text-gray-600">O cliente pediu para não receber mais novidades?</div>
            <button type="button" onClick={() => setSaindo(true)} className="text-xs border border-red-200 bg-white text-red-700 rounded-lg px-3 py-1.5 font-semibold hover:bg-red-50">
              Marcar opt-out
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-[11px] text-gray-600 flex-1 min-w-52">
              O que o cliente disse?
              <input className={`${CAMPO} mt-0.5`} value={motivoOpt} onChange={(e) => setMotivoOpt(e.target.value)} maxLength={300} placeholder="Ex.: já resolveu e não quer mais contato" />
            </label>
            <button type="button" onClick={() => void optOut(true)} disabled={salvando || !motivoOpt.trim()} className="text-xs bg-red-600 text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50">
              Confirmar opt-out
            </button>
            <button type="button" onClick={() => setSaindo(false)} className="text-xs text-gray-500">
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
