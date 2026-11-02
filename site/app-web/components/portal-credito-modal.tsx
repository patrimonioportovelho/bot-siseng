"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ESTADOS_CIVIS,
  ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL,
  TIPOS_CONTA,
  TIPOS_PIX,
  TIPOS_CLIENTE,
  SEXO_OPCOES,
  CAT_PROFISSAO_OPCOES
} from "@/lib/clientes/opcoes";
import { validarCpfCnpj } from "@/lib/clientes/validacao";
import { buscarCep, UF_PARA_ESTADO } from "@/lib/enderecos";
import { formatCnpj, formatCpf, formatTelefone } from "@/lib/format";
import {
  converterEmAvaliacaoCreditoAction,
  prepararConversaoAction,
  prepararUploadDocumentoAvaliacaoAction
} from "@/app/portal/avaliacao-cpf/actions";
import {
  PERGUNTAS_CREDITO,
  camposFaltandoCredito,
  clienteVazio,
  respostasVazias,
  type ClienteAvaliacao,
  type RespostasCredito
} from "@/lib/financiamento/avaliacao-credito";
import { supabaseBrowser, BUCKET_DOCUMENTOS_PORTAL } from "@/lib/supabase-browser";

// Janela "Transformar em Avaliação de crédito" do quadro do corretor (aparece ao
// arrastar uma Consulta de CPF para "Montagem de processo", como o motivo de
// "Sem interesse" no Recrutamento). É o formulário completo da Avaliação de
// crédito, em passos para não precisar rolar uma tela enorme:
//   Perguntas → Identificação → Contato → Complemento (opcional) → Documentos
//  - cada passo cabe na janela (campos em 2–3 colunas) e mostra o que falta;
//  - o cadastro que o cliente já tem vem preenchido, e a janela abre no
//    primeiro passo que ainda tem campo obrigatório vazio;
//  - Enter pula para o próximo campo; CEP preenche o endereço; CPF, CNPJ e
//    telefone são formatados sozinhos;
//  - o que foi digitado fica salvo como rascunho neste navegador;
//  - os documentos podem ser arrastados para a área de anexos.

type Banco = { id: string; nome: string; codigo: string | null };
type Listas = {
  bancos: Banco[];
  estados: { id: string; nome: string }[];
  cidades: { id: string; nome: string; estado_id: string }[];
};
type PassoId = "perguntas" | "ident" | "contato" | "extra" | "docs";

const PASSOS: { id: PassoId; titulo: string }[] = [
  { id: "perguntas", titulo: "Perguntas" },
  { id: "ident", titulo: "Identificação" },
  { id: "contato", titulo: "Contato" },
  { id: "extra", titulo: "Complemento" },
  { id: "docs", titulo: "Documentos" }
];

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-[11px] text-gray-600 block mb-0.5";
const GRADE = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-2.5";
const TAMANHO_MAXIMO_TOTAL = 15 * 1024 * 1024;

// Rótulo devolvido por camposFaltandoCredito -> campo do formulário e o passo onde ele fica.
const POR_ROTULO: Record<string, { id: keyof ClienteAvaliacao; passo: PassoId }> = {
  "Nome completo": { id: "nome", passo: "ident" },
  "Razão social": { id: "nome", passo: "ident" },
  CNPJ: { id: "cnpj", passo: "ident" },
  CPF: { id: "cpf", passo: "ident" },
  RG: { id: "rg", passo: "ident" },
  "Estado de expedição": { id: "expedicao", passo: "ident" },
  Sexo: { id: "sexo", passo: "ident" },
  "Nome da mãe": { id: "nomeMae", passo: "ident" },
  "Nome do pai": { id: "nomePai", passo: "ident" },
  "Estado civil": { id: "estadoCivil", passo: "ident" },
  "União estável (sim/não)": { id: "uniaoEstavel", passo: "ident" },
  "Data de nascimento": { id: "dataNascimento", passo: "ident" },
  Telefone: { id: "telefone", passo: "contato" },
  "E-mail": { id: "email", passo: "contato" },
  CEP: { id: "cep", passo: "contato" },
  Logradouro: { id: "rua", passo: "contato" },
  "Número predial": { id: "nPredial", passo: "contato" },
  Bairro: { id: "bairro", passo: "contato" },
  Estado: { id: "estadoId", passo: "contato" },
  Cidade: { id: "cidadeId", passo: "contato" }
};

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatarCep(valor: string): string {
  const d = valor.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : valor;
}

function tipoAceito(arquivo: File): boolean {
  return arquivo.type === "application/pdf" || arquivo.type.startsWith("image/");
}

type Rascunho = { cliente: ClienteAvaliacao; respostas: RespostasCredito };
const chaveRascunho = (avaliacaoId: string) => `sis_rascunho_credito_${avaliacaoId}`;

// Primeiro passo com pendência (ou Documentos, quando tudo já está preenchido).
function passoInicial(cliente: ClienteAvaliacao, respostas: RespostasCredito): PassoId {
  if (PERGUNTAS_CREDITO.some((p) => !respostas[p.chave])) return "perguntas";
  const passos = camposFaltandoCredito(cliente).map((rot) => POR_ROTULO[rot]?.passo);
  if (passos.includes("ident")) return "ident";
  if (passos.includes("contato")) return "contato";
  return "docs";
}

export function PortalCreditoModal({
  avaliacaoId,
  clienteNome,
  fechar,
  concluir
}: {
  avaliacaoId: string;
  clienteNome: string;
  fechar: () => void;
  concluir: () => void;
}) {
  const [carga, setCarga] = useState<{ estado: "carregando" } | { estado: "erro"; erro: string } | { estado: "pronto" }>({ estado: "carregando" });
  const [listas, setListas] = useState<Listas>({ bancos: [], estados: [], cidades: [] });
  const [cliente, setCliente] = useState<ClienteAvaliacao>(clienteVazio());
  const [respostas, setRespostas] = useState<RespostasCredito>(respostasVazias());
  const [passo, setPasso] = useState<PassoId>("perguntas");
  const [documentos, setDocumentos] = useState<File[]>([]);
  const [erroAnexo, setErroAnexo] = useState("");
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
  const [destacar, setDestacar] = useState(false);
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [etapaEnvio, setEtapaEnvio] = useState("");
  const [erroEnvio, setErroEnvio] = useState("");
  const corpoRef = useRef<HTMLDivElement>(null);
  const navegouRef = useRef(false);

  // Carrega o cadastro do cliente e as listas; abre no primeiro passo com pendência.
  const carregar = useCallback(
    async (usarRascunho: boolean) => {
      setCarga({ estado: "carregando" });
      const r = await prepararConversaoAction(avaliacaoId).catch(() => null);
      if (!r) {
        setCarga({ estado: "erro", erro: "Não foi possível abrir a avaliação agora. Tente de novo." });
        return;
      }
      if (!r.ok) {
        setCarga({ estado: "erro", erro: r.erro });
        return;
      }
      let clienteInicial = r.cliente;
      let respostasIniciais = respostasVazias();
      let restaurou = false;
      if (usarRascunho) {
        try {
          const bruto = window.localStorage.getItem(chaveRascunho(avaliacaoId));
          if (bruto) {
            const rascunho = JSON.parse(bruto) as Rascunho;
            // o rascunho completa o cadastro: o que já está salvo no cliente não é apagado por campo vazio
            const mesclado = { ...r.cliente } as Record<string, unknown>;
            for (const [campo, valor] of Object.entries(rascunho.cliente ?? {})) {
              if (valor !== "" && valor !== undefined) mesclado[campo] = valor;
            }
            clienteInicial = { ...(mesclado as ClienteAvaliacao), clienteId: r.cliente.clienteId };
            respostasIniciais = { ...respostasVazias(), ...(rascunho.respostas ?? {}) };
            restaurou = true;
          }
        } catch {
          // rascunho corrompido ou localStorage indisponível: segue sem ele
        }
      }
      setRascunhoRestaurado(restaurou);
      setListas({ bancos: r.bancos, estados: r.estados, cidades: r.cidades });
      setCliente(clienteInicial);
      setRespostas(respostasIniciais);
      setPasso(passoInicial(clienteInicial, respostasIniciais));
      setCarga({ estado: "pronto" });
    },
    [avaliacaoId]
  );

  useEffect(() => {
    void carregar(true);
  }, [carregar]);

  // Trava a rolagem da página por trás.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  const pedirFechar = useCallback(() => {
    if (enviando) return;
    if (documentos.length > 0 && !window.confirm("Os documentos anexados ainda não foram enviados e serão descartados. Fechar mesmo assim?")) return;
    fechar();
  }, [enviando, documentos.length, fechar]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") pedirFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [pedirFechar]);

  // Rascunho automático (só os dados; documentos não ficam salvos).
  useEffect(() => {
    if (carga.estado !== "pronto") return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(chaveRascunho(avaliacaoId), JSON.stringify({ cliente, respostas } satisfies Rascunho));
      } catch {
        // localStorage cheio ou indisponível: não trava o formulário
      }
    }, 600);
    return () => clearTimeout(t);
  }, [cliente, respostas, carga.estado, avaliacaoId]);

  // Ao trocar de passo (por clique do corretor) a janela volta ao topo e o cursor
  // vai para o primeiro campo vazio.
  useEffect(() => {
    if (!navegouRef.current) return;
    corpoRef.current?.scrollTo({ top: 0 });
    const t = setTimeout(() => {
      const campos = Array.from(corpoRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input:not([type=file]):not([type=date]), select") ?? []);
      campos.find((c) => c.value === "")?.focus({ preventScroll: true });
    }, 50);
    return () => clearTimeout(t);
  }, [passo]);

  const mostrarCpf = cliente.tipoCliente !== "Pessoa Jurídica";
  const mostrarCnpj = cliente.tipoCliente !== "Pessoa Física";

  const faltas = useMemo(
    () => camposFaltandoCredito(cliente).map((rotulo) => ({ rotulo, ...(POR_ROTULO[rotulo] ?? { id: "nome" as const, passo: "ident" as const }) })),
    [cliente]
  );
  const faltandoIds = useMemo(() => new Set<string>(faltas.map((f) => f.id)), [faltas]);
  const perguntasFaltando = PERGUNTAS_CREDITO.filter((p) => !respostas[p.chave]);
  const totalObrigatorios = useMemo(
    () =>
      camposFaltandoCredito({ ...clienteVazio(), tipoCliente: cliente.tipoCliente, estadoCivil: cliente.estadoCivil }).length + PERGUNTAS_CREDITO.length,
    [cliente.tipoCliente, cliente.estadoCivil]
  );
  const faltam = faltas.length + perguntasFaltando.length;
  const preenchidos = Math.max(0, totalObrigatorios - faltam);
  const pct = totalObrigatorios > 0 ? Math.round((preenchidos / totalObrigatorios) * 100) : 0;
  const pendentesDoPasso = (p: PassoId) => (p === "perguntas" ? perguntasFaltando.length : faltas.filter((f) => f.passo === p).length);

  const atualizar = useCallback(<K extends keyof ClienteAvaliacao>(campo: K, valor: ClienteAvaliacao[K]) => {
    setCliente((atual) => ({ ...atual, [campo]: valor }));
  }, []);

  function irParaPasso(p: PassoId) {
    navegouRef.current = true;
    setPasso(p);
  }

  const indice = PASSOS.findIndex((p) => p.id === passo);

  function irPara(idCampo: string, p: PassoId) {
    navegouRef.current = false;
    setPasso(p);
    setTimeout(() => {
      const el = document.getElementById(`cc-${idCampo}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLElement) el.focus({ preventScroll: true });
    }, 60);
  }

  function irParaPrimeiraFalta() {
    if (perguntasFaltando.length > 0) {
      navegouRef.current = true;
      setPasso("perguntas");
      return;
    }
    if (faltas[0]) irPara(faltas[0].id, faltas[0].passo);
  }

  // Enter pula para o próximo campo do passo (em vez de não fazer nada).
  function aoTeclarNoCorpo(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter") return;
    const alvo = e.target as HTMLElement;
    if (alvo.tagName !== "INPUT" && alvo.tagName !== "SELECT") return;
    if ((alvo as HTMLInputElement).type === "file") return;
    e.preventDefault();
    const campos = Array.from(corpoRef.current?.querySelectorAll<HTMLElement>("input:not([type=file]), select, textarea") ?? []);
    const i = campos.indexOf(alvo);
    campos[i + 1]?.focus();
  }

  function selecionarBanco(bancoId: string) {
    const banco = listas.bancos.find((b) => b.id === bancoId);
    setCliente((atual) => ({ ...atual, bancoId, codigoBanco: banco?.codigo ?? atual.codigoBanco }));
  }

  async function buscarEnderecoPorCep() {
    setCliente((atual) => ({ ...atual, cep: formatarCep(atual.cep) }));
    const encontrado = await buscarCep(cliente.cep);
    if (!encontrado) return;
    const nomeEstado = UF_PARA_ESTADO[encontrado.uf] ?? "";
    const estadoEncontrado = listas.estados.find((e) => e.nome.toLowerCase() === nomeEstado.toLowerCase());
    const cidadeEncontrada = estadoEncontrado
      ? listas.cidades.find((c) => c.estado_id === estadoEncontrado.id && c.nome.toLowerCase() === encontrado.localidade.toLowerCase())
      : undefined;
    setCliente((atual) => ({
      ...atual,
      rua: encontrado.logradouro || atual.rua,
      bairro: encontrado.bairro || atual.bairro,
      estadoId: estadoEncontrado?.id ?? atual.estadoId,
      cidadeId: cidadeEncontrada?.id ?? ""
    }));
  }

  function adicionarDocumentos(lista: FileList | File[] | null) {
    if (!lista || lista.length === 0) return;
    setErroAnexo("");
    const novos = Array.from(lista);
    const invalido = novos.find((f) => !tipoAceito(f));
    if (invalido) {
      setErroAnexo(`"${invalido.name}" não é PDF nem imagem — só esses dois tipos são aceitos.`);
      return;
    }
    const totalAtual = documentos.reduce((acc, f) => acc + f.size, 0);
    const totalNovo = novos.reduce((acc, f) => acc + f.size, 0);
    if (totalAtual + totalNovo > TAMANHO_MAXIMO_TOTAL) {
      setErroAnexo(`O total dos anexos passaria de ${formatarTamanho(TAMANHO_MAXIMO_TOTAL)} — junte menos arquivos de uma vez ou reduza o tamanho.`);
      return;
    }
    setDocumentos((atual) => [...atual, ...novos]);
  }

  async function enviar() {
    if (enviando) return;
    if (faltam > 0) {
      setDestacar(true);
      setErroEnvio(`Ainda faltam ${faltam} campo${faltam === 1 ? "" : "s"} obrigatório${faltam === 1 ? "" : "s"} — levamos você até o primeiro.`);
      irParaPrimeiraFalta();
      return;
    }
    const erroDocumento = validarCpfCnpj(mostrarCpf ? cliente.cpf : cliente.cnpj);
    if (erroDocumento) {
      setDestacar(true);
      setErroEnvio(erroDocumento);
      irPara(mostrarCpf ? "cpf" : "cnpj", "ident");
      return;
    }

    setEnviando(true);
    setErroEnvio("");
    try {
      // Os anexos sobem em paralelo, direto para o armazenamento.
      let enviados = 0;
      const total = documentos.length;
      if (total > 0) setEtapaEnvio(`Enviando documentos (0 de ${total})...`);
      const documentosEnviados = await Promise.all(
        documentos.map(async (arquivo) => {
          const preparo = await prepararUploadDocumentoAvaliacaoAction(arquivo.name);
          if (!preparo.ok) throw new Error(`Falha ao preparar envio de "${arquivo.name}": ${preparo.erro}`);
          const { error } = await supabaseBrowser()
            .storage.from(BUCKET_DOCUMENTOS_PORTAL)
            .uploadToSignedUrl(preparo.caminho, preparo.token, arquivo, { contentType: arquivo.type });
          if (error) throw new Error(`Falha ao enviar "${arquivo.name}": ${error.message}`);
          enviados += 1;
          setEtapaEnvio(`Enviando documentos (${enviados} de ${total})...`);
          return { caminho: preparo.caminho, nomeOriginal: arquivo.name };
        })
      );
      setEtapaEnvio("Transformando em Avaliação de crédito...");

      const formData = new FormData();
      formData.set("clienteJson", JSON.stringify(cliente));
      formData.set("documentosJson", JSON.stringify(documentosEnviados));
      formData.set("modalidade", "credito");
      formData.set("respostasJson", JSON.stringify(respostas));

      const r = await converterEmAvaliacaoCreditoAction(avaliacaoId, formData);
      if (!r.ok) {
        setErroEnvio(r.erro);
        return;
      }
      try {
        window.localStorage.removeItem(chaveRascunho(avaliacaoId));
      } catch {
        // ignora
      }
      concluir();
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      setErroEnvio(`Não foi possível concluir (${mensagem}). Tente de novo — se continuar, avise o administrativo com essa mensagem.`);
    } finally {
      setEnviando(false);
      setEtapaEnvio("");
    }
  }

  function descartarRascunho() {
    try {
      window.localStorage.removeItem(chaveRascunho(avaliacaoId));
    } catch {
      // ignora
    }
    void carregar(false);
  }

  const marcar = (id: string) => destacar && faltandoIds.has(id);
  const tamanhoTotalDocumentos = documentos.reduce((acc, f) => acc + f.size, 0);

  // Campos de texto/seleção em uma linha só (rótulo + controle), para o passo caber na janela.
  const entrada = (
    id: keyof ClienteAvaliacao,
    rotulo: string,
    opcoes: { obrigatorio?: boolean; placeholder?: string; tipo?: string; modo?: "numeric" | "tel" | "decimal"; aoSair?: (v: string) => void; largo?: boolean } = {}
  ) => (
    <div className={opcoes.largo ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <label className={LABEL} htmlFor={`cc-${id}`}>
        {rotulo}
        {opcoes.obrigatorio ? " *" : ""}
      </label>
      <input
        id={`cc-${id}`}
        type={opcoes.tipo ?? "text"}
        inputMode={opcoes.modo}
        placeholder={opcoes.placeholder}
        className={`${CAMPO}${marcar(id) ? " !border-red-400 bg-red-50/40" : ""}`}
        value={String(cliente[id] ?? "")}
        onChange={(e) => atualizar(id, e.target.value as never)}
        onBlur={(e) => opcoes.aoSair?.(e.target.value)}
      />
    </div>
  );

  const seletor = (id: keyof ClienteAvaliacao, rotulo: string, itens: { valor: string; texto: string }[], opcoes: { obrigatorio?: boolean; vazio?: string; aoMudar?: (v: string) => void } = {}) => (
    <div>
      <label className={LABEL} htmlFor={`cc-${id}`}>
        {rotulo}
        {opcoes.obrigatorio ? " *" : ""}
      </label>
      <select
        id={`cc-${id}`}
        className={`${CAMPO}${marcar(id) ? " !border-red-400 bg-red-50/40" : ""}`}
        value={String(cliente[id] ?? "")}
        onChange={(e) => (opcoes.aoMudar ? opcoes.aoMudar(e.target.value) : atualizar(id, e.target.value as never))}
      >
        <option value="">{opcoes.vazio ?? "—"}</option>
        {itens.map((i) => (
          <option key={i.valor} value={i.valor}>
            {i.texto}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end md:items-center justify-center md:p-4" onMouseDown={(e) => e.target === e.currentTarget && pedirFechar()}>
      <div className="bg-gray-50 w-full md:max-w-4xl h-[100dvh] md:h-[88vh] md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Cabeçalho, passos e progresso */}
        <div className="bg-white border-b border-gray-200 px-4 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 truncate">Avaliação de crédito — {clienteNome}</div>
              <div className="text-[11px] text-gray-500">
                Ao concluir, o card vai para <strong>Montagem de processo</strong> e o administrativo é avisado.
              </div>
            </div>
            <button type="button" onClick={pedirFechar} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1" aria-label="Fechar">
              ×
            </button>
          </div>

          {carga.estado === "pronto" && (
            <>
              <div className="mt-2 flex gap-1 overflow-x-auto" role="tablist">
                {PASSOS.map((p, i) => {
                  const pend = pendentesDoPasso(p.id);
                  const ativo = p.id === passo;
                  const opcional = p.id === "extra" || p.id === "docs";
                  const ok = !opcional && pend === 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      aria-selected={ativo}
                      onClick={() => irParaPasso(p.id)}
                      className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 border-b-2 transition-colors ${
                        ativo ? "border-primary text-gray-900 font-semibold" : "border-transparent text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${
                          ok ? "bg-green-100 text-green-700" : pend > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {ok ? "✓" : pend > 0 ? pend : i + 1}
                      </span>
                      {p.titulo}
                    </button>
                  );
                })}
              </div>
              <div className="h-0.5 -mx-4 bg-gray-100">
                <div className={`h-full transition-all ${faltam === 0 ? "bg-green-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
        </div>

        {/* Corpo: um passo por vez */}
        <div ref={corpoRef} onKeyDown={aoTeclarNoCorpo} className="flex-1 overflow-y-auto px-4 py-4">
          {carga.estado === "carregando" && <div className="text-xs text-gray-400 text-center py-10">Carregando o cadastro do cliente...</div>}
          {carga.estado === "erro" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
              {carga.erro}
              <div className="mt-3">
                <button type="button" onClick={fechar} className="text-xs border border-amber-300 rounded-lg px-3 py-1.5 font-semibold text-amber-800">
                  Fechar
                </button>
              </div>
            </div>
          )}

          {carga.estado === "pronto" && passo === "perguntas" && (
            <div id="cc-perguntas" className="grid md:grid-cols-3 gap-3">
              {PERGUNTAS_CREDITO.map((p, n) => (
                <fieldset key={p.chave} className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col gap-2">
                  <legend className="sr-only">{p.pergunta}</legend>
                  <div className="text-xs text-gray-800 font-medium leading-snug">
                    <span className="text-gray-400 mr-1">{n + 1}.</span>
                    {p.pergunta}
                  </div>
                  <div className="flex flex-col gap-1.5 mt-auto">
                    {(
                      [
                        { valor: "sim", texto: p.sim },
                        { valor: "nao", texto: p.nao }
                      ] as const
                    ).map((o) => {
                      const marcado = respostas[p.chave] === o.valor;
                      return (
                        <button
                          key={o.valor}
                          type="button"
                          aria-pressed={marcado}
                          onClick={() => setRespostas((atual) => ({ ...atual, [p.chave]: o.valor }))}
                          className={`text-left text-xs border rounded-lg px-3 py-2 transition-colors ${
                            marcado
                              ? "border-primary bg-primary/5 text-gray-900 ring-1 ring-primary font-semibold"
                              : destacar && !respostas[p.chave]
                                ? "border-red-300 bg-red-50/40 text-gray-600 hover:bg-gray-50"
                                : "border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {o.texto}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          )}

          {carga.estado === "pronto" && passo === "ident" && (
            <div className={GRADE}>
              {entrada("nome", mostrarCpf ? "Nome completo" : "Razão social", { obrigatorio: true })}
              {seletor("tipoCliente", "Tipo de cliente", TIPOS_CLIENTE.map((t) => ({ valor: t, texto: t })), { vazio: "Selecione..." })}
              {mostrarCpf && entrada("cpf", "CPF", { obrigatorio: true, placeholder: "000.000.000-00", modo: "numeric", aoSair: (v) => atualizar("cpf", formatCpf(v)) })}
              {mostrarCnpj && entrada("cnpj", "CNPJ", { obrigatorio: true, placeholder: "00.000.000/0000-00", modo: "numeric", aoSair: (v) => atualizar("cnpj", formatCnpj(v)) })}
              {mostrarCpf && (
                <>
                  {entrada("rg", "RG", { obrigatorio: true })}
                  {entrada("expedicao", "Estado de expedição", { obrigatorio: true })}
                  {seletor("sexo", "Sexo", SEXO_OPCOES.map((s) => ({ valor: s, texto: s })), { obrigatorio: true, vazio: "Selecione..." })}
                  {entrada("dataNascimento", "Data de nascimento", { obrigatorio: true, tipo: "date" })}
                  {entrada("nomeMae", "Nome da mãe", { obrigatorio: true })}
                  {entrada("nomePai", "Nome do pai", { obrigatorio: true })}
                  {seletor("estadoCivil", "Estado civil", ESTADOS_CIVIS.map((t) => ({ valor: t, texto: t })), {
                    obrigatorio: true,
                    aoMudar: (v) => {
                      atualizar("estadoCivil", v);
                      if (!ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(v)) atualizar("uniaoEstavel", "");
                    }
                  })}
                  {ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(cliente.estadoCivil) &&
                    seletor(
                      "uniaoEstavel",
                      "Convive em união estável?",
                      [
                        { valor: "false", texto: "Não" },
                        { valor: "true", texto: "Sim" }
                      ],
                      { obrigatorio: true, vazio: "Não perguntado ainda" }
                    )}
                </>
              )}
            </div>
          )}

          {carga.estado === "pronto" && passo === "contato" && (
            <div className={GRADE}>
              {entrada("telefone", "Telefone", { obrigatorio: true, placeholder: "(69) 99999-9999", modo: "tel", aoSair: (v) => atualizar("telefone", formatTelefone(v)) })}
              {entrada("email", "E-mail", { obrigatorio: true, tipo: "email" })}
              {entrada("cep", "CEP", { obrigatorio: true, placeholder: "00000-000", modo: "numeric", aoSair: () => void buscarEnderecoPorCep() })}
              {entrada("rua", "Logradouro", { obrigatorio: true })}
              {entrada("nPredial", "Número predial", { obrigatorio: true })}
              {entrada("complemento", "Complemento")}
              {entrada("bairro", "Bairro", { obrigatorio: true })}
              {seletor("estadoId", "Estado", listas.estados.map((e) => ({ valor: e.id, texto: e.nome })), {
                obrigatorio: true,
                aoMudar: (v) => {
                  atualizar("estadoId", v);
                  atualizar("cidadeId", "");
                }
              })}
              {seletor(
                "cidadeId",
                "Cidade",
                listas.cidades.filter((c) => c.estado_id === cliente.estadoId).map((c) => ({ valor: c.id, texto: c.nome })),
                { obrigatorio: true }
              )}
              <p className="sm:col-span-2 lg:col-span-3 text-[11px] text-gray-400">Digite o CEP e o logradouro, bairro, estado e cidade são preenchidos sozinhos.</p>
            </div>
          )}

          {carga.estado === "pronto" && passo === "extra" && (
            <div className="flex flex-col gap-4">
              <p className="text-[11px] text-gray-400">Tudo opcional — ajuda o administrativo na análise. Pode pular para os documentos.</p>
              <div>
                <div className="text-[11px] font-semibold text-gray-500 mb-2">Profissional e renda</div>
                <div className={GRADE}>
                  {entrada("profissao", "Profissão")}
                  {seletor("catProfissao", "Categoria de profissão", CAT_PROFISSAO_OPCOES.map((t) => ({ valor: t, texto: t })))}
                  {entrada("tipoServidor", "Tipo de servidor")}
                  {entrada("rendaBruta", "Renda bruta (R$)", { placeholder: "2.500,00", modo: "decimal" })}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-gray-500 mb-2">Dados bancários</div>
                <div className={GRADE}>
                  {seletor("bancoId", "Banco", listas.bancos.map((b) => ({ valor: b.id, texto: b.nome })), { aoMudar: selecionarBanco })}
                  {entrada("codigoBanco", "Código do banco", { placeholder: "Preenchido ao escolher o banco" })}
                  {entrada("agencia", "Agência")}
                  {entrada("conta", "Conta")}
                  {seletor("tipoConta", "Tipo de conta", TIPOS_CONTA.map((t) => ({ valor: t, texto: t })))}
                  {seletor("tipoPix", "Tipo de PIX", TIPOS_PIX.map((t) => ({ valor: t, texto: t })))}
                  {entrada("pix", "Chave PIX", { largo: true })}
                </div>
              </div>
              <div>
                <label className={LABEL} htmlFor="cc-observacao">
                  Observação
                </label>
                <textarea id="cc-observacao" className={`${CAMPO} min-h-16`} value={cliente.observacao} onChange={(e) => atualizar("observacao", e.target.value)} />
              </div>
            </div>
          )}

          {carga.estado === "pronto" && passo === "docs" && (
            <div className="flex flex-col gap-3">
              <div
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes("Files")) {
                    e.preventDefault();
                    setArrastandoArquivo(true);
                  }
                }}
                onDragLeave={() => setArrastandoArquivo(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastandoArquivo(false);
                  adicionarDocumentos(e.dataTransfer.files);
                }}
                className={`border-2 border-dashed rounded-xl px-4 py-8 text-center transition-colors ${
                  arrastandoArquivo ? "border-primary bg-primary/5" : "border-gray-300 bg-white"
                }`}
              >
                <div className="text-sm text-gray-700 font-medium">Arraste os documentos para cá</div>
                <div className="text-[11px] text-gray-400 mt-0.5">RG ou CNH, comprovante de renda, comprovante de residência, certidão de estado civil...</div>
                <label className="inline-block mt-3 text-xs bg-white border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 font-semibold cursor-pointer hover:bg-gray-50">
                  Escolher arquivos
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      adicionarDocumentos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="text-[10px] text-gray-400 mt-2">
                  PDF ou imagem, até {formatarTamanho(TAMANHO_MAXIMO_TOTAL)} no total. Vão por e-mail para o administrativo — não ficam guardados no sistema.
                </div>
              </div>
              {documentos.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {documentos.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <span className="text-gray-700 truncate">
                        {f.type === "application/pdf" ? "📄" : "🖼️"} {f.name} <span className="text-gray-400">— {formatarTamanho(f.size)}</span>
                      </span>
                      <button type="button" onClick={() => setDocumentos((atual) => atual.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600 ml-2 shrink-0">
                        remover
                      </button>
                    </div>
                  ))}
                  <div className="sm:col-span-2 text-[11px] text-gray-400">Total: {formatarTamanho(tamanhoTotalDocumentos)}</div>
                </div>
              )}
              {erroAnexo && <p className="text-xs text-red-600">{erroAnexo}</p>}
            </div>
          )}
        </div>

        {/* Rodapé: navegação entre passos e conclusão */}
        {carga.estado === "pronto" && (
          <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => irParaPasso(PASSOS[Math.max(0, indice - 1)].id)}
              disabled={indice === 0 || enviando}
              className="text-sm border border-gray-300 rounded-lg px-4 py-2 font-semibold text-gray-600 disabled:opacity-40"
            >
              ← Voltar
            </button>
            {indice < PASSOS.length - 1 ? (
              <button
                type="button"
                onClick={() => irParaPasso(PASSOS[indice + 1].id)}
                className="text-sm bg-primary text-white rounded-lg px-5 py-2 font-semibold hover:opacity-90"
              >
                Próximo →
              </button>
            ) : (
              <button
                type="button"
                onClick={enviar}
                disabled={enviando}
                className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-60 hover:opacity-90 disabled:cursor-wait inline-flex items-center justify-center gap-1.5"
              >
                {enviando && <span className="w-3 h-3 border-2 rounded-full animate-spin border-white/40 border-t-white shrink-0" />}
                {enviando ? etapaEnvio || "Enviando..." : "Concluir e mover para Montagem de processo"}
              </button>
            )}
            <div className="flex-1 min-w-0 text-right text-[11px]">
              {faltam > 0 ? (
                <button type="button" onClick={irParaPrimeiraFalta} className="text-amber-700 font-semibold hover:underline">
                  Faltam {faltam} obrigatório{faltam === 1 ? "" : "s"} · ver
                </button>
              ) : (
                <span className="text-green-700 font-semibold">Tudo preenchido</span>
              )}
              <div className="text-gray-400">
                Salvo neste navegador
                {rascunhoRestaurado && (
                  <>
                    {" · "}
                    <button type="button" onClick={descartarRascunho} className="underline hover:text-gray-600">
                      começar do zero
                    </button>
                  </>
                )}
              </div>
            </div>
            {erroEnvio && <div className="w-full text-xs text-red-600">{erroEnvio}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
