"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AVISO_PRIMEIRO_CONTATO,
  CANAIS,
  COLUNAS,
  CRECI_STATUS,
  DIAGNOSTICO_PERGUNTAS,
  INTERESSE_OPCOES,
  JANELA_ACOMPANHAMENTO_DIAS,
  MOTIVOS_DESISTENCIA,
  PRAZO_ACOLHIDA_DIAS,
  RESULTADOS_CONTATO,
  ROTEIRO_PRIMEIRO_CONTATO,
  STATUS_REUNIAO,
  TIPOS_CONTATO,
  TIPO_CHECKIN,
  TIPO_MOVIMENTACAO,
  TTI_STATUS,
  type ColunaId
} from "@/lib/recrutamento/opcoes";
import { CHAVES_PRESENCA, GRUPOS_TREINAMENTO, type EstadoTreinamentos } from "@/lib/recrutamento/treinamentos";
import {
  CampoDataAuto,
  CampoSelectAuto,
  CampoTextoAuto,
  EstadoSalvo,
  Rotulo,
  type ResultadoSalvar
} from "@/components/recrutamento-campos";
import type { AtividadeRegistrada } from "@/app/recrutamento/actions";
import { RecrutamentoWhatsapp } from "@/components/recrutamento-whatsapp";

export type PassoFollowupTela = { chave: string; titulo: string; vence: string; feito: boolean; atrasoDias: number };

export type DadosEtiqueta = {
  id: string;
  nome: string;
  telefone: string | null; // formatado
  telefoneDigitos: string | null;
  email: string | null;
  funcao: string;
  statusFuncao: string;
  coluna: ColunaId;
  linkDrive: string | null;
  canal: string | null;
  responsavelId: string | null;
  proximaAcaoData: string | null;
  proximaAcaoTexto: string | null;
  reuniao1: { data: string | null; status: string | null; notas: string | null };
  reuniao2: { data: string | null; status: string | null; notas: string | null };
  aprovacaoBrokerEm: string | null;
  interesse: string | null;
  motivoDesistencia: string | null;
  motivoObs: string | null;
  diagnostico: Record<string, string>;
  followups: PassoFollowupTela[];
  turmaId: string | null;
  ttiStatus: string | null;
  creciStatus: string | null;
  inicioTreinamento: string | null;
  treinamentos: EstadoTreinamentos;
  acolhidaEm: string | null;
  notas: string | null;
  dataEntrada: string | null; // yyyy-mm-dd
  diasNaCasa: number | null;
  atividades: AtividadeRegistrada[];
  mostrarMetricas: boolean;
  metricas: {
    captacoes: number;
    captacoes90d: number;
    diasAtePrimeiraCaptacao: number | null;
    clientes: number;
    propostas: number;
    locacoes: number;
    vendas: number;
    administracoes: number;
    avaliacoes: number;
    gestoes: number;
    honorarioRecebido: string; // já formatado em R$
    ultimoAcessoPortal: string | null; // dd/mm/aaaa
  } | null;
};

export type TurmaOpcao = {
  id: string;
  nome: string;
  inicio: string;
  acolhida: string | null;
  passosInicio: string | null;
  passosFim: string | null;
  especificosA: string | null;
  especificosB: string | null;
};

type Acoes = {
  moverCard: (
    id: string,
    destino: ColunaId,
    opcoes?: { motivo?: string | null; motivoObs?: string | null; forcar?: boolean }
  ) => Promise<void>;
  salvarCampo: (id: string, campo: string, valor: string | null) => Promise<ResultadoSalvar>;
  alternarTreinamento: (id: string, chave: string, feito: boolean) => Promise<ResultadoSalvar>;
  alternarFollowup: (id: string, chave: string, feito: boolean) => Promise<ResultadoSalvar>;
  salvarDiagnostico: (id: string, chave: string, texto: string | null) => Promise<ResultadoSalvar>;
  registrarAtividade: (
    id: string,
    dados: { tipo: string; resultado: string | null; nota: string | null; proximaAcaoData: string | null }
  ) => Promise<{ ok: true; atividade: AtividadeRegistrada } | { ok: false; erro: string }>;
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

function dataBr(iso: string) {
  return iso.split("-").reverse().join("/");
}

export function RecrutamentoEtiqueta({
  d,
  responsaveis,
  turmas,
  remetenteLogado,
  responsavelPorEtapa,
  acoes
}: {
  d: DadosEtiqueta;
  responsaveis: { id: string; nome: string }[];
  turmas: TurmaOpcao[];
  // Quem está logado (assina a mensagem de WhatsApp quando o item não tem
  // responsável nem a etapa tem um padrão).
  remetenteLogado: { id: string; primeiroNome: string };
  // Responsável padrão de cada etapa (configurado no quadro).
  responsavelPorEtapa: Record<string, string | null>;
  acoes: Acoes;
}) {
  const router = useRouter();
  const salvar = (campo: string) => (valor: string | null) => acoes.salvarCampo(d.id, campo, valor);
  // O responsável do item também alimenta o remetente da mensagem de WhatsApp.
  const [responsavelId, setResponsavelId] = useState<string | null>(d.responsavelId);
  const coluna = COLUNAS.find((c) => c.id === d.coluna);

  // ---- mover de etapa ----
  const [colunaAtual, setColunaAtual] = useState<ColunaId>(d.coluna);
  const [erroMover, setErroMover] = useState<string | null>(null);
  const [destinoRecusado, setDestinoRecusado] = useState<ColunaId | null>(null);
  const [movendo, setMovendo] = useState(false);
  const [motivoPendente, setMotivoPendente] = useState(false);
  const [motivoEscolhido, setMotivoEscolhido] = useState("");
  const [motivoObsEscolhido, setMotivoObsEscolhido] = useState("");

  async function mover(destino: ColunaId, opcoes?: { motivo?: string | null; motivoObs?: string | null; forcar?: boolean }) {
    setErroMover(null);
    setDestinoRecusado(null);
    setMovendo(true);
    try {
      await acoes.moverCard(d.id, destino, opcoes);
      setColunaAtual(destino);
      setMotivoPendente(false);
      router.refresh();
    } catch (e) {
      setErroMover(e instanceof Error ? e.message : "Não foi possível mover.");
      setDestinoRecusado(destino);
    } finally {
      setMovendo(false);
    }
  }
  function aoMudarEtapa(destino: ColunaId) {
    if (destino === "sem_interesse") {
      setMotivoEscolhido("");
      setMotivoObsEscolhido("");
      setMotivoPendente(true);
      return;
    }
    setMotivoPendente(false);
    void mover(destino);
  }

  // ---- contatos ----
  const [atividades, setAtividades] = useState<AtividadeRegistrada[]>(d.atividades);
  const [tipo, setTipo] = useState(TIPOS_CONTATO[0]);
  const [resultado, setResultado] = useState("");
  const [nota, setNota] = useState("");
  const [proxima, setProxima] = useState("");
  const [erroContato, setErroContato] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  async function registrar() {
    setErroContato(null);
    setRegistrando(true);
    const r = await acoes.registrarAtividade(d.id, {
      tipo,
      resultado: resultado || null,
      nota: nota || null,
      proximaAcaoData: proxima || null
    });
    setRegistrando(false);
    if (!r.ok) {
      setErroContato(r.erro);
      return;
    }
    setAtividades((a) => [r.atividade, ...a]);
    setResultado("");
    setNota("");
    setProxima("");
    router.refresh();
  }

  // ---- checklists (documentação, turma, acolhida) ----
  const [treino, setTreino] = useState<EstadoTreinamentos>(d.treinamentos);
  const [erroTreino, setErroTreino] = useState<string | null>(null);
  async function alternar(chave: string, feito: boolean) {
    setErroTreino(null);
    const anterior = treino;
    setTreino({ ...treino, [chave]: feito ? { feito: true, data: new Date().toISOString().slice(0, 10) } : { feito: false } });
    const r = await acoes.alternarTreinamento(d.id, chave, feito);
    if (!r.ok) {
      setTreino(anterior);
      setErroTreino(r.erro);
    }
  }
  const presencasFeitas = CHAVES_PRESENCA.filter((c) => treino[c]?.feito).length;
  const presencaCompleta = presencasFeitas === CHAVES_PRESENCA.length;
  const turma = turmas.find((t) => t.id === d.turmaId) ?? null;
  const diasDesdeInicioTurma = turma
    ? Math.floor((Date.now() - new Date(`${turma.inicio}T00:00:00-04:00`).getTime()) / 86400000)
    : null;

  // ---- follow-up ----
  const [passos, setPassos] = useState<PassoFollowupTela[]>(d.followups);
  async function alternarPasso(chave: string, feito: boolean) {
    setPassos((lista) => lista.map((p) => (p.chave === chave ? { ...p, feito, atrasoDias: feito ? 0 : p.atrasoDias } : p)));
    const r = await acoes.alternarFollowup(d.id, chave, feito);
    if (!r.ok) setPassos((lista) => lista.map((p) => (p.chave === chave ? { ...p, feito: !feito } : p)));
  }

  const m = d.metricas;
  const ehEquipe = d.coluna === "estagiario" || d.coluna === "corretor";
  const emAcompanhamento = ehEquipe && d.diasNaCasa !== null && d.diasNaCasa <= JANELA_ACOMPANHAMENTO_DIAS;
  const faltou = d.reuniao1.status === "Não compareceu" || d.reuniao2.status === "Não compareceu";
  const ehFunil = coluna?.grupo === "funil";

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      {/* Cabeçalho */}
      <div className={CARTAO}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-base font-bold text-gray-900">{d.nome}</div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${coluna?.cor ?? ""}`}>
                {COLUNAS.find((c) => c.id === colunaAtual)?.label}
              </span>
              <span>
                {d.funcao} · {d.statusFuncao}
              </span>
              {d.canal && <span className="rounded-full border border-blue-200 bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold">{d.canal}</span>}
            </div>
            <div className="text-xs text-gray-600 mt-2 flex items-center gap-3 flex-wrap">
              {d.telefone && (
                <span>
                  {d.telefone}
                  {d.telefoneDigitos && (
                    <>
                      {" · "}
                      <a
                        href={`https://wa.me/55${d.telefoneDigitos}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        WhatsApp
                      </a>
                    </>
                  )}
                </span>
              )}
              {d.email && <span>{d.email}</span>}
              {d.linkDrive && (
                <a href={d.linkDrive} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Currículo / pasta
                </a>
              )}
            </div>
          </div>
          <Link href={`/parceiros/${d.id}`} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">
            Abrir cadastro completo
          </Link>
        </div>
      </div>

      {/* Gerador de mensagem de WhatsApp (registra o contato ao abrir) */}
      <RecrutamentoWhatsapp
        id={d.id}
        nome={d.nome}
        telefoneDigitos={d.telefoneDigitos}
        coluna={colunaAtual}
        remetentes={responsaveis}
        remetenteIdPadrao={
          responsavelId ?? responsavelPorEtapa[colunaAtual] ?? (responsaveis.some((r) => r.id === remetenteLogado.id) ? remetenteLogado.id : null)
        }
        remetenteFallback={remetenteLogado.primeiroNome}
        reuniao1={{ data: d.reuniao1.data, status: d.reuniao1.status }}
        reuniao2={{ data: d.reuniao2.data, status: d.reuniao2.status }}
        turma={
          turma
            ? {
                nome: turma.nome,
                inicio: turma.inicio,
                passosInicio: turma.passosInicio,
                passosFim: turma.passosFim,
                especificosA: turma.especificosA,
                especificosB: turma.especificosB,
                acolhida: turma.acolhida
              }
            : null
        }
        acolhidaEm={d.acolhidaEm}
        faltou={faltou}
        followupPendente={passos.find((p) => !p.feito)?.chave ?? null}
        registrarAtividade={acoes.registrarAtividade}
        aoRegistrar={(a) => {
          setAtividades((lista) => [a, ...lista]);
          router.refresh();
        }}
      />

      {/* Acompanhamento */}
      <div className={CARTAO}>
        <div className={TITULO}>Acompanhamento</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Rotulo>Etapa</Rotulo>
            <select
              className={CAMPO}
              value={colunaAtual}
              disabled={movendo}
              onChange={(e) => aoMudarEtapa(e.target.value as ColunaId)}
            >
              {COLUNAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {movendo && <span className="text-[10px] text-gray-400">Movendo…</span>}
            {erroMover && (
              <div className="text-[11px] text-red-600 mt-1">
                {erroMover}
                {destinoRecusado && erroMover.startsWith("Presença incompleta") && (
                  <button
                    type="button"
                    onClick={() => void mover(destinoRecusado, { forcar: true })}
                    className="block mt-1 underline font-semibold"
                  >
                    Liberar mesmo assim (decisão dos gestores)
                  </button>
                )}
              </div>
            )}
          </div>
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
            <Rotulo>Canal de origem</Rotulo>
            <CampoSelectAuto
              valor={d.canal}
              vazio="Não informado"
              opcoes={CANAIS.map((c) => ({ valor: c, rotulo: c }))}
              salvar={salvar("canal")}
            />
          </div>
          <div>
            <Rotulo>Próximo retorno</Rotulo>
            <CampoDataAuto valor={d.proximaAcaoData} salvar={salvar("proxima_acao_data")} />
          </div>
          <div className="md:col-span-2">
            <Rotulo>O que fazer no próximo retorno</Rotulo>
            <CampoTextoAuto
              valor={d.proximaAcaoTexto}
              salvar={salvar("proxima_acao_texto")}
              placeholder="Ex.: confirmar presença na 1ª reunião de quinta"
            />
          </div>
        </div>

        {motivoPendente && (
          <div className="mt-3 border border-amber-200 bg-amber-50 rounded-lg p-3 flex flex-col gap-2">
            <div className="text-xs font-semibold text-amber-800">Motivo da desistência (obrigatório)</div>
            <select className={CAMPO} value={motivoEscolhido} onChange={(e) => setMotivoEscolhido(e.target.value)}>
              <option value="">Escolha o motivo…</option>
              {MOTIVOS_DESISTENCIA.map((mo) => (
                <option key={mo}>{mo}</option>
              ))}
            </select>
            <textarea
              className={CAMPO}
              rows={2}
              value={motivoObsEscolhido}
              onChange={(e) => setMotivoObsEscolhido(e.target.value)}
              placeholder="Detalhe (opcional)"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!motivoEscolhido || movendo}
                onClick={() => void mover("sem_interesse", { motivo: motivoEscolhido, motivoObs: motivoObsEscolhido || null })}
                className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
              >
                Confirmar
              </button>
              <button type="button" onClick={() => setMotivoPendente(false)} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Roteiro do 1º contato */}
      {(d.coluna === "Lead" || d.coluna === "Em contato") && (
        <details className={CARTAO} open={d.coluna === "Lead"}>
          <summary className="text-sm font-bold text-gray-800 cursor-pointer">Roteiro do 1º contato (em até 1 hora útil)</summary>
          <ol className="list-decimal pl-5 mt-3 flex flex-col gap-1.5 text-xs text-gray-700">
            {ROTEIRO_PRIMEIRO_CONTATO.map((passo) => (
              <li key={passo}>{passo}</li>
            ))}
          </ol>
          <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mt-3">{AVISO_PRIMEIRO_CONTATO}</p>
        </details>
      )}

      {/* Contatos */}
      <div className={CARTAO}>
        <div className={TITULO}>Contatos e retornos</div>
        <div className="grid md:grid-cols-4 gap-2 mb-2">
          <div>
            <Rotulo>Tipo</Rotulo>
            <select className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_CONTATO.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <Rotulo>Resultado</Rotulo>
            <select className={CAMPO} value={resultado} onChange={(e) => setResultado(e.target.value)}>
              <option value="">—</option>
              {RESULTADOS_CONTATO.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Rotulo>Próximo retorno (opcional)</Rotulo>
            <input type="date" className={CAMPO} value={proxima} onChange={(e) => setProxima(e.target.value)} />
          </div>
          <div className="md:col-span-4">
            <Rotulo>Anotação</Rotulo>
            <textarea className={CAMPO} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que foi conversado" />
          </div>
        </div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button
            type="button"
            onClick={() => void registrar()}
            disabled={registrando}
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60"
          >
            {registrando ? "Registrando…" : "Registrar contato"}
          </button>
          {ehEquipe && (
            <button type="button" onClick={() => setTipo(TIPO_CHECKIN)} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600">
              Preparar check-in semanal
            </button>
          )}
          {erroContato && <span className="text-[11px] text-red-600">{erroContato}</span>}
        </div>
        <div className="flex flex-col divide-y divide-gray-100 border-t border-gray-100">
          {atividades.length === 0 && <div className="text-[11px] text-gray-400 py-3">Nenhum contato registrado ainda.</div>}
          {atividades.map((a) => (
            <div key={a.id} className={`py-2 text-xs ${a.tipo === TIPO_MOVIMENTACAO ? "text-gray-400" : "text-gray-700"}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{a.tipo}</span>
                {a.resultado && <span>· {a.resultado}</span>}
                <span className="text-[10px] text-gray-400 ml-auto">
                  {formatarDataHora(a.data)}
                  {a.por ? ` · ${a.por.split(" ")[0]}` : ""}
                </span>
              </div>
              {a.nota && <div className="text-[11px] text-gray-600 mt-0.5 whitespace-pre-wrap">{a.nota}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Cadência de follow-up */}
      {ehFunil && (
        <div className={CARTAO}>
          <div className={TITULO}>Cadência de follow-up (quem ainda não decidiu)</div>
          {passos.length === 0 ? (
            <div className="text-[11px] text-gray-400">
              A cadência (D+1, D+3, D+7, D+15 e D+30) começa a contar a partir da data de uma reunião marcada como “Realizada”.
            </div>
          ) : (
            <div className="flex flex-col">
              {passos.map((p) => (
                <label key={p.chave} className="flex items-center gap-2 py-1 text-xs text-gray-700 cursor-pointer hover:bg-gray-50 rounded px-1">
                  <input type="checkbox" checked={p.feito} onChange={(e) => void alternarPasso(p.chave, e.target.checked)} />
                  <span className={p.feito ? "text-gray-400 line-through" : ""}>{p.titulo}</span>
                  <span className={`ml-auto text-[10px] ${!p.feito && p.atrasoDias > 0 ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                    {!p.feito && p.atrasoDias > 0 ? `atrasado ${p.atrasoDias} dia(s) · ` : ""}
                    {dataBr(p.vence)}
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-2">Quem for reprovado recebe a resposta com empatia e segue na lista para indicações.</p>
        </div>
      )}

      {/* Reuniões */}
      <div className={CARTAO}>
        <div className={TITULO}>Reuniões</div>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { n: 1, titulo: "1ª reunião — diagnóstico (30 a 45 min)", dados: d.reuniao1 },
            { n: 2, titulo: "2ª reunião — modelo de negócio (60 min, presencial)", dados: d.reuniao2 }
          ].map((r) => (
            <div key={r.n} className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-gray-700">{r.titulo}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Rotulo>Data</Rotulo>
                  <CampoDataAuto valor={r.dados.data} salvar={salvar(`reuniao${r.n}_data`)} />
                </div>
                <div>
                  <Rotulo>Situação</Rotulo>
                  <CampoSelectAuto
                    valor={r.dados.status}
                    opcoes={STATUS_REUNIAO.map((s) => ({ valor: s, rotulo: s }))}
                    salvar={salvar(`reuniao${r.n}_status`)}
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-400">Confirmar presença na véspera e no dia. Faltou? Ligar no mesmo dia e registrar o motivo.</p>
              <div>
                <Rotulo>Anotações</Rotulo>
                <CampoTextoAuto valor={r.dados.notas} salvar={salvar(`reuniao${r.n}_notas`)} multilinha linhas={2} />
              </div>
              {r.n === 2 && (
                <div>
                  <Rotulo>Broker aprovou a associação em</Rotulo>
                  <CampoDataAuto valor={d.aprovacaoBrokerEm} salvar={salvar("aprovacao_broker_em")} />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-4">
          <div>
            <Rotulo>Interesse em ingressar</Rotulo>
            <CampoSelectAuto
              valor={d.interesse}
              vazio="—"
              opcoes={INTERESSE_OPCOES.map((s) => ({ valor: s, rotulo: s }))}
              salvar={salvar("interesse")}
            />
          </div>
          <div>
            <Rotulo>Motivo de falta ou desistência</Rotulo>
            <CampoSelectAuto
              valor={d.motivoDesistencia}
              vazio="—"
              opcoes={MOTIVOS_DESISTENCIA.map((s) => ({ valor: s, rotulo: s }))}
              salvar={salvar("motivo_desistencia")}
            />
            {faltou && !d.motivoDesistencia && <div className="text-[10px] text-red-600">Faltou e ainda sem motivo registrado.</div>}
          </div>
          <div>
            <Rotulo>Detalhe do motivo</Rotulo>
            <CampoTextoAuto valor={d.motivoObs} salvar={salvar("motivo_obs")} />
          </div>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="text-xs font-semibold text-gray-700 mb-2">Diagnóstico da 1ª reunião</div>
          <div className="flex flex-col gap-2.5">
            {DIAGNOSTICO_PERGUNTAS.map((q) => (
              <div key={q.chave}>
                <Rotulo>{q.texto}</Rotulo>
                <CampoTextoAuto
                  valor={d.diagnostico[q.chave] ?? null}
                  salvar={(v) => acoes.salvarDiagnostico(d.id, q.chave, v)}
                  multilinha
                  linhas={2}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Documentação / Turma / Acolhida */}
      <div className={CARTAO}>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="text-sm font-bold text-gray-800">Turma, documentação e acolhida</div>
          <div className={`text-[11px] font-semibold ${presencaCompleta ? "text-green-600" : "text-gray-500"}`}>
            Presença {presencasFeitas}/{CHAVES_PRESENCA.length}
            {presencaCompleta ? " · 100% — liberado para a acolhida" : ""}
          </div>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full ${presencaCompleta ? "bg-green-500" : "bg-primary"}`}
            style={{ width: `${(presencasFeitas / CHAVES_PRESENCA.length) * 100}%` }}
          />
        </div>
        <div className="grid md:grid-cols-4 gap-3 mb-3">
          <div className="md:col-span-2">
            <Rotulo>Turma (inscrições fecham 3 dias antes)</Rotulo>
            <CampoSelectAuto
              valor={d.turmaId}
              vazio="Sem turma"
              opcoes={turmas.map((t) => ({ valor: t.id, rotulo: `${t.nome} — início ${dataBr(t.inicio)}` }))}
              salvar={salvar("turma_id")}
            />
          </div>
          <div>
            <Rotulo>Início do treinamento</Rotulo>
            <CampoDataAuto valor={d.inicioTreinamento} salvar={salvar("inicio_treinamento")} />
          </div>
          <div>
            <Rotulo>Acolhida em</Rotulo>
            <CampoDataAuto valor={d.acolhidaEm} salvar={salvar("acolhida_em")} />
          </div>
        </div>
        {turma && (
          <div className="text-[11px] text-gray-500 mb-3">
            {turma.acolhida ? `Acolhida prevista: ${dataBr(turma.acolhida)}. ` : ""}
            {diasDesdeInicioTurma !== null && diasDesdeInicioTurma >= 0 && (
              <span className={diasDesdeInicioTurma > PRAZO_ACOLHIDA_DIAS && !d.acolhidaEm ? "text-red-600 font-semibold" : ""}>
                {diasDesdeInicioTurma} dia(s) desde o início da turma (acolhida em até {PRAZO_ACOLHIDA_DIAS}).
                {diasDesdeInicioTurma > PRAZO_ACOLHIDA_DIAS && !d.acolhidaEm ? " Prazo estourado: os gestores decidem se continua." : ""}
              </span>
            )}
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <div>
            <Rotulo>Curso TTI</Rotulo>
            <CampoSelectAuto valor={d.ttiStatus} opcoes={TTI_STATUS.map((s) => ({ valor: s, rotulo: s }))} salvar={salvar("tti_status")} />
          </div>
          <div>
            <Rotulo>CRECI</Rotulo>
            <CampoSelectAuto valor={d.creciStatus} opcoes={CRECI_STATUS.map((s) => ({ valor: s, rotulo: s }))} salvar={salvar("creci_status")} />
          </div>
        </div>
        {erroTreino && <div className="text-[11px] text-red-600 mb-2">{erroTreino}</div>}
        <div className="flex flex-col gap-4">
          {GRUPOS_TREINAMENTO.map((g) => (
            <div key={g.id}>
              <div className="text-xs font-semibold text-gray-700 mb-1">{g.titulo}</div>
              <div className="flex flex-col">
                {g.itens.map((i) => {
                  const feito = !!treino[i.chave]?.feito;
                  return (
                    <label key={i.chave} className="flex items-start gap-2 py-1 text-xs text-gray-700 cursor-pointer hover:bg-gray-50 rounded px-1">
                      <input type="checkbox" className="mt-0.5" checked={feito} onChange={(e) => void alternar(i.chave, e.target.checked)} />
                      <span className={feito ? "text-gray-400 line-through" : ""}>{i.titulo}</span>
                      {feito && treino[i.chave]?.data && (
                        <span className="text-[10px] text-gray-400 ml-auto shrink-0">{dataBr(treino[i.chave]!.data!)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          Sem 100%, a pessoa repõe o que faltou na turma seguinte e só é acolhida depois (limite de {PRAZO_ACOLHIDA_DIAS} dias do início da turma).
        </p>
      </div>

      {/* Desenvolvimento */}
      <div className={CARTAO}>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="text-sm font-bold text-gray-800">Desenvolvimento</div>
          {emAcompanhamento && (
            <div className="text-[11px] text-blue-700">
              Acompanhamento de {JANELA_ACOMPANHAMENTO_DIAS} dias · semana {Math.floor((d.diasNaCasa ?? 0) / 7) + 1} de 13 · 1 contato por semana
            </div>
          )}
        </div>
        {d.mostrarMetricas && m ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Indicador rotulo="Imóveis captados" valor={String(m.captacoes)} />
            <Indicador
              rotulo="Tempo até a 1ª captação"
              valor={m.diasAtePrimeiraCaptacao !== null ? `${m.diasAtePrimeiraCaptacao} dia(s)` : "Ainda sem captação"}
            />
            <Indicador rotulo={`Captações nos ${JANELA_ACOMPANHAMENTO_DIAS} dias`} valor={String(m.captacoes90d)} />
            <Indicador rotulo="Clientes cadastrados" valor={String(m.clientes)} />
            <Indicador rotulo="Propostas" valor={String(m.propostas)} />
            <Indicador rotulo="Locações" valor={String(m.locacoes)} />
            <Indicador rotulo="Compra e Venda" valor={String(m.vendas)} />
            <Indicador rotulo="Administrações captadas" valor={String(m.administracoes)} />
            <Indicador rotulo="Financiamentos (avaliações)" valor={String(m.avaliacoes)} />
            <Indicador rotulo="Gestões" valor={String(m.gestoes)} />
            <Indicador rotulo="Honorário recebido" valor={m.honorarioRecebido} />
            <Indicador rotulo="Dias na casa" valor={d.diasNaCasa !== null ? String(d.diasNaCasa) : "—"} />
            <Indicador rotulo="Último acesso ao portal" valor={m.ultimoAcessoPortal ?? "Nunca acessou"} />
          </div>
        ) : (
          <div className="text-[11px] text-gray-400">
            Os indicadores (captações, clientes, propostas, transações, tempo até a 1ª captação) aparecem depois da acolhida, quando a
            pessoa virar Corretor Estagiário ou Corretor.
          </div>
        )}
      </div>

      {/* Notas */}
      <div className={CARTAO}>
        <div className={TITULO}>Anotações gerais</div>
        <CampoTextoAuto valor={d.notas} salvar={salvar("notas")} multilinha linhas={4} placeholder="Observações sobre a pessoa, perfil, combinados..." />
      </div>

      <div className="text-[10px] text-gray-400 flex items-center gap-1">
        <EstadoSalvo estado="ocioso" erro="" />
        Tudo que você preenche aqui é salvo automaticamente.
      </div>
    </div>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
      <div className="text-[10px] text-gray-500">{rotulo}</div>
      <div className="text-sm font-bold text-gray-800">{valor}</div>
    </div>
  );
}
