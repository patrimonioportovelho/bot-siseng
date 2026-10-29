"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  COLUNAS,
  CRECI_STATUS,
  INTERESSE_OPCOES,
  META_CAPTACOES,
  PRAZO_META_DIAS,
  RESULTADOS_CONTATO,
  STATUS_REUNIAO,
  TIPOS_CONTATO,
  TIPO_MOVIMENTACAO,
  TTI_STATUS,
  type ColunaId
} from "@/lib/recrutamento/opcoes";
import { GRUPOS_TREINAMENTO, type EstadoTreinamentos } from "@/lib/recrutamento/treinamentos";
import {
  CampoDataAuto,
  CampoSelectAuto,
  CampoTextoAuto,
  EstadoSalvo,
  Rotulo,
  type ResultadoSalvar
} from "@/components/recrutamento-campos";
import type { AtividadeRegistrada } from "@/app/recrutamento/actions";

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
  responsavelId: string | null;
  proximaAcaoData: string | null;
  proximaAcaoTexto: string | null;
  reuniao1: { data: string | null; status: string | null; notas: string | null };
  reuniao2: { data: string | null; status: string | null; notas: string | null };
  interesse: string | null;
  ttiStatus: string | null;
  creciStatus: string | null;
  inicioTreinamento: string | null;
  treinamentos: EstadoTreinamentos;
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

type Acoes = {
  moverCard: (id: string, destino: ColunaId) => Promise<void>;
  salvarCampo: (id: string, campo: string, valor: string | null) => Promise<ResultadoSalvar>;
  alternarTreinamento: (id: string, chave: string, feito: boolean) => Promise<ResultadoSalvar>;
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

export function RecrutamentoEtiqueta({
  d,
  responsaveis,
  acoes
}: {
  d: DadosEtiqueta;
  responsaveis: { id: string; nome: string }[];
  acoes: Acoes;
}) {
  const router = useRouter();
  const salvar = (campo: string) => (valor: string | null) => acoes.salvarCampo(d.id, campo, valor);
  const coluna = COLUNAS.find((c) => c.id === d.coluna);

  // ---- mover de etapa ----
  const [colunaAtual, setColunaAtual] = useState<ColunaId>(d.coluna);
  const [erroMover, setErroMover] = useState<string | null>(null);
  const [movendo, setMovendo] = useState(false);
  async function aoMudarEtapa(destino: ColunaId) {
    setErroMover(null);
    setMovendo(true);
    try {
      await acoes.moverCard(d.id, destino);
      setColunaAtual(destino);
      router.refresh();
    } catch (e) {
      setErroMover(e instanceof Error ? e.message : "Não foi possível mover.");
    } finally {
      setMovendo(false);
    }
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

  // ---- treinamentos ----
  const [treino, setTreino] = useState<EstadoTreinamentos>(d.treinamentos);
  const [erroTreino, setErroTreino] = useState<string | null>(null);
  const totalTreino = GRUPOS_TREINAMENTO.reduce((s, g) => s + g.itens.length, 0);
  const feitosTreino = GRUPOS_TREINAMENTO.reduce((s, g) => s + g.itens.filter((i) => treino[i.chave]?.feito).length, 0);
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

  const m = d.metricas;
  const diaDoPrograma =
    d.inicioTreinamento || d.dataEntrada
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(`${d.inicioTreinamento ?? d.dataEntrada}T00:00:00-04:00`).getTime()) / 86400000)
        )
      : null;

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
              onChange={(e) => void aoMudarEtapa(e.target.value as ColunaId)}
            >
              {COLUNAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {movendo && <span className="text-[10px] text-gray-400">Movendo…</span>}
            {erroMover && <div className="text-[11px] text-red-600 mt-1">{erroMover}</div>}
          </div>
          <div>
            <Rotulo>Responsável pelo acompanhamento</Rotulo>
            <CampoSelectAuto
              valor={d.responsavelId}
              vazio="Sem responsável"
              opcoes={responsaveis.map((r) => ({ valor: r.id, rotulo: r.nome }))}
              salvar={salvar("responsavel_id")}
            />
          </div>
          <div>
            <Rotulo>Próximo retorno</Rotulo>
            <CampoDataAuto valor={d.proximaAcaoData} salvar={salvar("proxima_acao_data")} />
          </div>
          <div className="md:col-span-3">
            <Rotulo>O que fazer no próximo retorno</Rotulo>
            <CampoTextoAuto
              valor={d.proximaAcaoTexto}
              salvar={salvar("proxima_acao_texto")}
              placeholder="Ex.: confirmar presença na 1ª reunião de quinta"
            />
          </div>
        </div>
      </div>

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
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => void registrar()}
            disabled={registrando}
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60"
          >
            {registrando ? "Registrando…" : "Registrar contato"}
          </button>
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

      {/* Reuniões */}
      <div className={CARTAO}>
        <div className={TITULO}>Reuniões</div>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { n: 1, titulo: "1ª reunião — conhecer e mostrar como somos", dados: d.reuniao1 },
            { n: 2, titulo: "2ª reunião — só para quem tem interesse", dados: d.reuniao2 }
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
              <div>
                <Rotulo>Anotações</Rotulo>
                <CampoTextoAuto valor={r.dados.notas} salvar={salvar(`reuniao${r.n}_notas`)} multilinha linhas={2} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 max-w-xs">
          <Rotulo>Interesse em ingressar</Rotulo>
          <CampoSelectAuto
            valor={d.interesse}
            vazio="—"
            opcoes={INTERESSE_OPCOES.map((s) => ({ valor: s, rotulo: s }))}
            salvar={salvar("interesse")}
          />
        </div>
      </div>

      {/* Treinamento */}
      <div className={CARTAO}>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="text-sm font-bold text-gray-800">Treinamento e CRECI</div>
          <div className="text-[11px] text-gray-500">
            {feitosTreino}/{totalTreino} acompanhados
            {diaDoPrograma !== null && ` · dia ${diaDoPrograma} de ${PRAZO_META_DIAS}`}
          </div>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-primary rounded-full" style={{ width: `${totalTreino ? (feitosTreino / totalTreino) * 100 : 0}%` }} />
        </div>
        <div className="grid md:grid-cols-3 gap-3 mb-4">
          <div>
            <Rotulo>Início do treinamento</Rotulo>
            <CampoDataAuto valor={d.inicioTreinamento} salvar={salvar("inicio_treinamento")} />
          </div>
          <div>
            <Rotulo>Curso TTI</Rotulo>
            <CampoSelectAuto
              valor={d.ttiStatus}
              opcoes={TTI_STATUS.map((s) => ({ valor: s, rotulo: s }))}
              salvar={salvar("tti_status")}
            />
          </div>
          <div>
            <Rotulo>CRECI</Rotulo>
            <CampoSelectAuto
              valor={d.creciStatus}
              opcoes={CRECI_STATUS.map((s) => ({ valor: s, rotulo: s }))}
              salvar={salvar("creci_status")}
            />
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
                        <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                          {treino[i.chave]!.data!.split("-").reverse().join("/")}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desenvolvimento */}
      <div className={CARTAO}>
        <div className={TITULO}>Desenvolvimento</div>
        {d.mostrarMetricas && m ? (
          <>
            <div className="mb-3">
              <div className="flex items-center justify-between text-[11px] text-gray-600 mb-1">
                <span>
                  Meta dos {PRAZO_META_DIAS} dias: {META_CAPTACOES} captações
                </span>
                <span className="font-semibold">
                  {Math.min(m.captacoes90d, META_CAPTACOES)}/{META_CAPTACOES}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${Math.min(100, (m.captacoes90d / META_CAPTACOES) * 100)}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Indicador rotulo="Imóveis captados" valor={String(m.captacoes)} />
              <Indicador
                rotulo="Tempo até a 1ª captação"
                valor={m.diasAtePrimeiraCaptacao !== null ? `${m.diasAtePrimeiraCaptacao} dia(s)` : "Ainda sem captação"}
              />
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
          </>
        ) : (
          <div className="text-[11px] text-gray-400">
            Os indicadores (captações, clientes, propostas, transações, tempo até a 1ª captação) aparecem quando a pessoa virar
            Corretor Estagiário ou Corretor.
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
