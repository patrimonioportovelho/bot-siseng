"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClienteWhatsapp } from "@/components/cliente-whatsapp";
import { ETAPAS_FUNIL, ETAPA_FUNIL_POR_ID, type EtapaFunilId } from "@/lib/clientes/funil";
import type { VinculoCliente } from "@/lib/clientes/vinculos-servidor";
import type { ContatoCliente } from "@/app/clientes/funil-actions";
import { CartaoAtividades, CartaoCanais, ProximaAtividade, type AcoesCrm } from "@/components/cliente-crm";
import { ClienteRoteiro, type AcoesRoteiro } from "@/components/cliente-roteiro";
import { ClienteFicha, type AcoesFicha } from "@/components/cliente-ficha";
import { AntesDeLigar } from "@/components/cliente-antes-de-ligar";
import type { EdicoesRoteiro } from "@/lib/crm/roteiro-edicoes";
import type { FichaDoCliente } from "@/lib/crm/ficha";
import type { Segmento } from "@/lib/crm/roteiro";
import type { AtendimentosDoCliente } from "@/lib/crm/atendimento-servidor";
import { ATIVIDADE_SUGERIDA, TEMPERATURAS, TIPOS_CONTATO_CRM, type AtividadeCliente, type CrmCliente } from "@/lib/crm/atividades";

export type DadosClienteEtiqueta = {
  id: string;
  idLegado: string | null;
  nome: string;
  telefone: string | null;
  telefoneDigitos: string | null;
  email: string | null;
  corretorNome: string | null;
  corretorId: string | null;
  corretorAtivo: boolean;
  criadoEm: string;
  etapa: EtapaFunilId;
  motivo: string;
  papeis: string[];
  movido: boolean;
  atendimentoDesde: string | null;
  imovelReferencia: string | null;
  // repassado ao corretor e ainda sem movimento dele (só no portal)
  repasseDesde?: string | null;
};

// Dia de hoje em Porto Velho (yyyy-mm-dd), vindo do servidor, para as atividades não trocarem de dia por causa do fuso.
export type CrmDaEtiqueta = {
  hoje: string;
  crm: CrmCliente;
  atividades: AtividadeCliente[];
  responsaveis: { id: string; nome: string }[];
  acoes: AcoesCrm;
  // roteiro de atendimento guiado
  roteiro: { segmentoSugerido: Segmento; assistente: string; inicial: AtendimentosDoCliente; edicoes: EdicoesRoteiro; acoes: AcoesRoteiro };
  // ficha de relacionamento e ganchos
  ficha: { inicial: FichaDoCliente; acoes: AcoesFicha };
};

type Acoes = {
  mover?: (id: string, destino: EtapaFunilId | "auto") => Promise<{ ok: true } | { ok: false; erro: string }>;
  registrarContato: (
    clienteId: string,
    dados: { tipo: string; resultado: string | null; nota: string | null }
  ) => Promise<{ ok: true; contato: ContatoCliente } | { ok: false; erro: string }>;
  transferir?: (
    clienteId: string,
    novoCorretorId: string,
    motivo: string | null
  ) => Promise<{ ok: true; corretorNome: string; contato: ContatoCliente } | { ok: false; erro: string }>;
};

const TIPOS_CONTATO = TIPOS_CONTATO_CRM;
const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";
const CARTAO = "bg-white border border-gray-200 rounded-xl p-4";

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Porto_Velho" });
const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho" });

// Etiqueta do cliente (mesmo desenho das etiquetas do Financiamento, Recrutamento e Manutenção): o
// cliente numa tela só, com a etapa, os vínculos, o gerador de WhatsApp e o histórico de contatos.
export function ClienteEtiqueta({
  d,
  vinculos,
  contatosIniciais,
  remetentes,
  remetenteLogado,
  podeTransferir = false,
  corretoresParaTransferir = [],
  modoCorretor = false,
  extra,
  crmEtiqueta,
  modeloInicial = null,
  acoes
}: {
  d: DadosClienteEtiqueta;
  vinculos: VinculoCliente[];
  contatosIniciais: ContatoCliente[];
  remetentes: { id: string; nome: string }[];
  remetenteLogado: { id: string; primeiroNome: string };
  podeTransferir?: boolean;
  corretoresParaTransferir?: { id: string; nome: string; funcao: string }[];
  // portal do corretor: sem mover etapa, sem ficha do administrativo e sem transferência
  modoCorretor?: boolean;
  // conteúdo extra logo depois do WhatsApp (ex.: "Complementar dados")
  extra?: ReactNode;
  // próxima atividade, canais e opt-out (CRM do cliente)
  crmEtiqueta: CrmDaEtiqueta;
  // modelo de WhatsApp pedido pelo link (ex.: aviso de aniversário no sino)
  modeloInicial?: string | null;
  acoes: Acoes;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [contatos, setContatos] = useState(contatosIniciais);
  // CRM: atividades agendadas, estado do relacionamento e o aviso "agende a próxima atividade" depois de cada contato.
  const [atividades, setAtividades] = useState<AtividadeCliente[]>(crmEtiqueta.atividades);
  const [crm, setCrm] = useState<CrmCliente>(crmEtiqueta.crm);
  const [prompt, setPrompt] = useState<{ titulo: string; tipo: string; origem: string; chave: number } | null>(null);
  const [modeloPedido, setModeloPedido] = useState<{ id: string; chave: number } | null>(null);
  const areaWhatsapp = useRef<HTMLDivElement>(null);
  const [ficha, setFicha] = useState<FichaDoCliente>(crmEtiqueta.ficha.inicial);
  // veio de um aviso: já deixa a mensagem sugerida aberta
  useEffect(() => {
    if (!modeloInicial) return;
    setModeloPedido({ id: modeloInicial, chave: Date.now() });
    const t = setTimeout(() => areaWhatsapp.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    return () => clearTimeout(t);
  }, [modeloInicial]);
  function pedirProximaAtividade(titulo: string, tipoContato: string, origem: string) {
    if (tipoContato === "Transferência") return;
    setPrompt({ titulo, tipo: ATIVIDADE_SUGERIDA[tipoContato] ?? "Ligar", origem, chave: Date.now() });
  }
  const [erro, setErro] = useState("");
  const etapa = ETAPA_FUNIL_POR_ID.get(d.etapa);

  const [tipo, setTipo] = useState("Nota");
  const [resultado, setResultado] = useState("");
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function mover(destino: EtapaFunilId | "auto") {
    setErro("");
    if (!acoes.mover) return;
    const r = await acoes.mover(d.id, destino);
    if (!r.ok) setErro(r.erro);
    else startTransition(() => router.refresh());
  }

  async function adicionar() {
    setSalvando(true);
    setErro("");
    const r = await acoes.registrarContato(d.id, { tipo, resultado: resultado.trim() || null, nota: nota.trim() || null });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setContatos((l) => [r.contato, ...l]);
    setNota("");
    setResultado("");
    pedirProximaAtividade("Contato registrado. Qual é a próxima atividade?", r.contato.tipo, "manual");
  }

  const jaContatado = contatos.some((c) => c.tipo !== "Nota" && c.tipo !== "Transferência");

  // ---- transferir para outro corretor
  const [corretorAtual, setCorretorAtual] = useState({ id: d.corretorId, nome: d.corretorNome, ativo: d.corretorAtivo });
  const [transferindo, setTransferindo] = useState(false);
  const [novoCorretor, setNovoCorretor] = useState("");
  const [motivoTransf, setMotivoTransf] = useState("");
  const [enviandoTransf, setEnviandoTransf] = useState(false);

  async function transferir() {
    if (!novoCorretor || !acoes.transferir) return;
    setEnviandoTransf(true);
    setErro("");
    const r = await acoes.transferir(d.id, novoCorretor, motivoTransf.trim() || null);
    setEnviandoTransf(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setCorretorAtual({ id: novoCorretor, nome: r.corretorNome, ativo: true });
    setContatos((l) => [r.contato, ...l]);
    setTransferindo(false);
    setNovoCorretor("");
    setMotivoTransf("");
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className={CARTAO}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-base font-bold text-gray-900">{d.nome}</div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {etapa && <span className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 border ${etapa.cor}`}>{etapa.label}</span>}
              <span className="text-[11px] text-gray-500">{d.motivo}</span>
              {crm.temperatura && TEMPERATURAS[crm.temperatura] && (
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${TEMPERATURAS[crm.temperatura].cor}`}>
                  {TEMPERATURAS[crm.temperatura].icone} {TEMPERATURAS[crm.temperatura].rotulo}
                </span>
              )}
              {crm.optOut && <span className="text-[10px] font-bold rounded-full px-2 py-0.5 border bg-red-50 text-red-700 border-red-200">⛔ Opt-out (não quer novidades)</span>}
              {crm.telefoneInvalido && <span className="text-[10px] font-bold rounded-full px-2 py-0.5 border bg-amber-50 text-amber-700 border-amber-200">Telefone inválido</span>}
              {d.papeis
                .filter((p) => etapa?.label.replace(/s$/, "") !== p)
                .map((p) => (
                  <span key={p} className="text-[10px] font-bold rounded-full px-2 py-0.5 border bg-gray-50 text-gray-500 border-gray-200">
                    também {p}
                  </span>
                ))}
            </div>
            <div className="text-xs text-gray-600 mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
              <span>{d.telefone ?? "Sem telefone"}</span>
              {d.email && <span>{d.email}</span>}
              <span>
                Corretor: {corretorAtual.nome ?? "—"}
                {!corretorAtual.ativo && <span className="ml-1 text-[10px] font-bold rounded-full px-1.5 py-0.5 border bg-red-50 text-red-600 border-red-200">sem corretor ativo</span>}
              </span>
              <span>Cadastrado em {dia(d.criadoEm)}</span>
              {d.idLegado && <span className="text-gray-400">Id {d.idLegado}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!modoCorretor && acoes.mover && (
              <label className="text-[11px] text-gray-500 flex items-center gap-1.5">
                Coluna no quadro
                <select value={d.etapa} onChange={(e) => void mover(e.target.value as EtapaFunilId)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white font-semibold text-gray-700">
                  {ETAPAS_FUNIL.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!modoCorretor && d.movido && (
              <button type="button" onClick={() => void mover("auto")} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-gray-600" title="O sistema volta a escolher a coluna">
                Voltar ao automático
              </button>
            )}
            {!modoCorretor && (
              <Link href={`/clientes/${d.id}`} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-gray-600 hover:bg-gray-50">
                Abrir ficha completa
              </Link>
            )}
          </div>
        </div>
        {modoCorretor && d.repasseDesde && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            📥 Este cliente foi passado para você em {dia(d.repasseDesde)}. Faça o primeiro movimento — registre um contato (use o WhatsApp abaixo), escreva uma nota ou complete os dados — e ele deixa de aparecer como novo.
          </div>
        )}
        {!modoCorretor && podeTransferir && (
          <div className={`mt-3 rounded-lg border px-3 py-2 ${corretorAtual.ativo ? "border-gray-200 bg-gray-50" : "border-red-200 bg-red-50/60"}`}>
            {!transferindo ? (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[11px] text-gray-600">
                  {corretorAtual.ativo
                    ? "Quer que outro corretor atenda este cliente?"
                    : "O corretor deste cliente não está mais ativo. Passe o cliente para um corretor em atividade."}
                </div>
                <button
                  type="button"
                  onClick={() => setTransferindo(true)}
                  className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Transferir para outro corretor
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2 flex-wrap">
                <label className="text-[11px] text-gray-600 flex-1 min-w-52">
                  Novo corretor (Corretor e Corretor Estagiário ativos)
                  <select value={novoCorretor} onChange={(e) => setNovoCorretor(e.target.value)} className={`${CAMPO} mt-0.5`}>
                    <option value="">Escolha...</option>
                    {corretoresParaTransferir
                      .filter((c) => c.id !== corretorAtual.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome} — {c.funcao}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="text-[11px] text-gray-600 flex-1 min-w-52">
                  Motivo (opcional)
                  <input value={motivoTransf} onChange={(e) => setMotivoTransf(e.target.value)} maxLength={1000} placeholder="Ex.: corretor anterior saiu da imobiliária" className={`${CAMPO} mt-0.5`} />
                </label>
                <button
                  type="button"
                  onClick={() => void transferir()}
                  disabled={!novoCorretor || enviandoTransf}
                  className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
                >
                  {enviandoTransf ? "Transferindo..." : "Transferir"}
                </button>
                <button type="button" onClick={() => setTransferindo(false)} className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5">
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}
        {erro && <div className="mt-3 text-xs text-red-600">{erro}</div>}
      </div>

      {/* WhatsApp */}
      <div ref={areaWhatsapp}>
      <ClienteWhatsapp
        modeloPedido={modeloPedido}
        clienteId={d.id}
        nome={d.nome}
        telefoneDigitos={d.telefoneDigitos}
        etapa={d.etapa}
        jaContatado={jaContatado}
        imovelReferencia={d.imovelReferencia}
        remetentes={remetentes}
        remetenteIdPadrao={d.corretorId && remetentes.some((r) => r.id === d.corretorId) ? d.corretorId : remetentes.some((r) => r.id === remetenteLogado.id) ? remetenteLogado.id : null}
        remetenteFallback={remetenteLogado.primeiroNome}
        registrar={acoes.registrarContato}
        bloqueado={crm.optOut ? "Este cliente pediu para não receber novidades (opt-out). Não envie mensagens de marketing." : null}
        aoRegistrar={(c) => {
          setContatos((l) => [c, ...l]);
          pedirProximaAtividade("Mensagem enviada. Qual é a próxima atividade?", c.tipo, "whatsapp");
        }}
      />
      </div>

      {prompt && (
        <ProximaAtividade
          key={prompt.chave}
          clienteId={d.id}
          clienteNome={d.nome}
          hoje={crmEtiqueta.hoje}
          titulo={prompt.titulo}
          tipoSugerido={prompt.tipo}
          origem={prompt.origem}
          responsaveis={crmEtiqueta.responsaveis}
          responsavelPadraoId={d.corretorId}
          acoes={crmEtiqueta.acoes}
          aoAgendar={(a) => {
            setAtividades((l) => [a, ...l]);
            setPrompt(null);
            startTransition(() => router.refresh());
          }}
          aoPular={(c) => {
            setContatos((l) => [c, ...l]);
            setPrompt(null);
          }}
          aoFechar={() => setPrompt(null)}
        />
      )}

      {extra}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <CartaoAtividades
          clienteId={d.id}
          hoje={crmEtiqueta.hoje}
          atividades={atividades}
          acoes={crmEtiqueta.acoes}
          aoConcluir={(a, c) => {
            setAtividades((l) => l.map((x) => (x.id === a.id ? a : x)));
            setContatos((l) => [c, ...l]);
            pedirProximaAtividade("Atividade concluída. Qual é a próxima atividade?", c.tipo, "atividade");
          }}
          aoAgendarNova={() => setPrompt({ titulo: "Agendar atividade", tipo: "Ligar", origem: "manual", chave: Date.now() })}
          aoRemover={(id) => setAtividades((l) => l.filter((x) => x.id !== id))}
        />
        <CartaoCanais
          clienteId={d.id}
          crm={crm}
          telefone={d.telefone}
          acoes={crmEtiqueta.acoes}
          aoMudar={setCrm}
          aoOptOut={(novo, c) => {
            setCrm(novo);
            setContatos((l) => [c, ...l]);
            startTransition(() => router.refresh());
          }}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Vínculos */}
        <div className={CARTAO}>
          <div className="text-sm font-bold text-gray-800 mb-2">Vínculos no sistema</div>
          {vinculos.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum imóvel, contrato, proposta ou avaliação ainda. É um lead.</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {vinculos.map((v) => {
                const conteudo = (
                  <div className="py-2 flex items-start gap-2">
                    <span className="text-[10px] font-bold rounded-full px-2 py-0.5 border bg-gray-50 text-gray-600 border-gray-200 shrink-0">{v.tipo}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">{v.titulo}</div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {v.detalhe}
                        {v.data ? ` · ${dia(v.data)}` : ""}
                      </div>
                    </div>
                  </div>
                );
                return v.href ? (
                  <Link key={v.id} href={v.href} className="hover:bg-gray-50 rounded-lg px-1 -mx-1">
                    {conteudo}
                  </Link>
                ) : (
                  <div key={v.id}>{conteudo}</div>
                );
              })}
            </div>
          )}
        </div>

        {/* Histórico de contatos e notas */}
        <div className={CARTAO}>
          <div className="text-sm font-bold text-gray-800 mb-2">Contatos e notas</div>
          <div className="flex flex-col gap-2 mb-3">
            <div className="grid grid-cols-2 gap-2">
              <select className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_CONTATO.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input className={CAMPO} value={resultado} onChange={(e) => setResultado(e.target.value)} placeholder="Resultado (opcional)" />
            </div>
            <textarea className={CAMPO} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder={tipo === "Nota" ? "Escreva a nota..." : "Anotação do contato (opcional)"} />
            <div>
              <button
                type="button"
                onClick={() => void adicionar()}
                disabled={salvando || (tipo === "Nota" && !nota.trim())}
                className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
              >
                {salvando ? "Salvando..." : "Registrar"}
              </button>
            </div>
          </div>
          {contatos.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum contato registrado.</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
              {contatos.map((c) => (
                <div key={c.id} className="border border-gray-100 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-gray-700">
                      {c.tipo}
                      {c.resultado ? ` · ${c.resultado}` : ""}
                    </span>
                    <span className="text-gray-400">
                      {dataHora(c.data)}
                      {c.por ? ` · ${c.por.split(" ")[0]}` : ""}
                    </span>
                  </div>
                  {c.nota && <div className="text-[11px] text-gray-600 mt-0.5 whitespace-pre-wrap">{c.nota}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ClienteRoteiro
        clienteId={d.id}
        nome={d.nome}
        assistente={crmEtiqueta.roteiro.assistente}
        imovel={d.imovelReferencia}
        hoje={crmEtiqueta.hoje}
        segmentoSugerido={crmEtiqueta.roteiro.segmentoSugerido}
        inicial={crmEtiqueta.roteiro.inicial}
        responsaveis={crmEtiqueta.responsaveis}
        corretorId={corretorAtual.ativo ? corretorAtual.id : null}
        acoes={crmEtiqueta.roteiro.acoes}
        edicoes={crmEtiqueta.roteiro.edicoes}
        ficha={ficha}
        antesDeLigar={<AntesDeLigar hoje={crmEtiqueta.hoje} segmento={crmEtiqueta.roteiro.segmentoSugerido} crm={crm} contatos={contatos} atividades={atividades} ficha={ficha} />}
        aoConcluir={(r) => {
          setFicha(r.ficha);
          setCrm(r.crm);
          setAtividades(r.atividades);
          setContatos((l) => [...r.contatos, ...l]);
          setPrompt(null);
          startTransition(() => router.refresh());
        }}
        aoPedirModelo={(id) => {
          setModeloPedido({ id, chave: Date.now() });
          areaWhatsapp.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      />

      <ClienteFicha
        clienteId={d.id}
        hoje={crmEtiqueta.hoje}
        ficha={ficha}
        optOut={crm.optOut}
        acoes={crmEtiqueta.ficha.acoes}
        aoMudar={(r) => {
          setFicha(r.ficha);
          setAtividades(r.atividades);
        }}
      />
    </div>
  );
}
