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
// crédito, pensado para ser rápido:
//  - o cadastro que o cliente já tem vem preenchido, e só ficam abertas as
//    partes que ainda têm campo obrigatório vazio;
//  - o topo mostra o que falta (cada item leva ao campo) e "Concluir" também
//    leva ao primeiro campo vazio;
//  - CEP preenche o endereço; CPF, CNPJ e telefone são formatados sozinhos;
//  - o que foi digitado fica salvo como rascunho neste navegador;
//  - os documentos podem ser arrastados para a área de anexos.

type Banco = { id: string; nome: string; codigo: string | null };
type Listas = {
  bancos: Banco[];
  estados: { id: string; nome: string }[];
  cidades: { id: string; nome: string; estado_id: string }[];
};
type SecaoId = "perguntas" | "ident" | "contato" | "prof" | "banco" | "docs" | "obs";

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";
const TAMANHO_MAXIMO_TOTAL = 15 * 1024 * 1024;

// Rótulo devolvido por camposFaltandoCredito -> campo do formulário e a parte onde ele fica.
const POR_ROTULO: Record<string, { id: keyof ClienteAvaliacao; secao: SecaoId }> = {
  "Nome completo": { id: "nome", secao: "ident" },
  "Razão social": { id: "nome", secao: "ident" },
  CNPJ: { id: "cnpj", secao: "ident" },
  CPF: { id: "cpf", secao: "ident" },
  RG: { id: "rg", secao: "ident" },
  "Estado de expedição": { id: "expedicao", secao: "ident" },
  Sexo: { id: "sexo", secao: "ident" },
  "Nome da mãe": { id: "nomeMae", secao: "ident" },
  "Nome do pai": { id: "nomePai", secao: "ident" },
  "Estado civil": { id: "estadoCivil", secao: "ident" },
  "União estável (sim/não)": { id: "uniaoEstavel", secao: "ident" },
  "Data de nascimento": { id: "dataNascimento", secao: "ident" },
  Telefone: { id: "telefone", secao: "contato" },
  "E-mail": { id: "email", secao: "contato" },
  CEP: { id: "cep", secao: "contato" },
  Logradouro: { id: "rua", secao: "contato" },
  "Número predial": { id: "nPredial", secao: "contato" },
  Bairro: { id: "bairro", secao: "contato" },
  Estado: { id: "estadoId", secao: "contato" },
  Cidade: { id: "cidadeId", secao: "contato" }
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
  const [abertas, setAbertas] = useState<Record<SecaoId, boolean>>({
    perguntas: true,
    ident: false,
    contato: false,
    prof: false,
    banco: false,
    docs: true,
    obs: false
  });
  const [documentos, setDocumentos] = useState<File[]>([]);
  const [erroAnexo, setErroAnexo] = useState("");
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
  const [destacar, setDestacar] = useState(false);
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [etapaEnvio, setEtapaEnvio] = useState("");
  const [erroEnvio, setErroEnvio] = useState("");
  const corpoRef = useRef<HTMLDivElement>(null);

  // Carrega o cadastro do cliente e as listas; abre só o que ainda tem pendência.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const r = await prepararConversaoAction(avaliacaoId).catch(() => null);
      if (cancelado) return;
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
          setRascunhoRestaurado(true);
        }
      } catch {
        // rascunho corrompido ou localStorage indisponível: segue sem ele
      }
      setListas({ bancos: r.bancos, estados: r.estados, cidades: r.cidades });
      setCliente(clienteInicial);
      setRespostas(respostasIniciais);
      const faltas = camposFaltandoCredito(clienteInicial).map((rot) => POR_ROTULO[rot]?.secao);
      setAbertas((a) => ({
        ...a,
        perguntas: PERGUNTAS_CREDITO.some((p) => !respostasIniciais[p.chave]),
        ident: faltas.includes("ident"),
        contato: faltas.includes("contato")
      }));
      setCarga({ estado: "pronto" });
    })();
    return () => {
      cancelado = true;
    };
  }, [avaliacaoId]);

  // Trava a rolagem da página por trás e fecha com Esc.
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

  const mostrarCpf = cliente.tipoCliente !== "Pessoa Jurídica";
  const mostrarCnpj = cliente.tipoCliente !== "Pessoa Física";

  const faltas = useMemo(
    () => camposFaltandoCredito(cliente).map((rotulo) => ({ rotulo, ...(POR_ROTULO[rotulo] ?? { id: "nome" as const, secao: "ident" as const }) })),
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
  const pendentesDaSecao = (s: SecaoId) => (s === "perguntas" ? perguntasFaltando.length : faltas.filter((f) => f.secao === s).length);

  const atualizar = useCallback(<K extends keyof ClienteAvaliacao>(campo: K, valor: ClienteAvaliacao[K]) => {
    setCliente((atual) => ({ ...atual, [campo]: valor }));
  }, []);

  function alternar(s: SecaoId) {
    setAbertas((a) => ({ ...a, [s]: !a[s] }));
  }

  function irPara(idCampo: string, secao: SecaoId) {
    setAbertas((a) => ({ ...a, [secao]: true }));
    setTimeout(() => {
      const el = document.getElementById(`cc-${idCampo}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLElement && "focus" in el) el.focus({ preventScroll: true });
    }, 60);
  }

  function irParaPrimeiraFalta() {
    if (perguntasFaltando.length > 0) {
      setAbertas((a) => ({ ...a, perguntas: true }));
      setTimeout(() => document.getElementById("cc-perguntas")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
      return;
    }
    if (faltas[0]) irPara(faltas[0].id, faltas[0].secao);
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
      setAbertas((a) => {
        const proximo = { ...a };
        if (perguntasFaltando.length > 0) proximo.perguntas = true;
        for (const f of faltas) proximo[f.secao] = true;
        return proximo;
      });
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
    setRascunhoRestaurado(false);
    setCarga({ estado: "carregando" });
    prepararConversaoAction(avaliacaoId).then((r) => {
      if (r.ok) {
        const secoes = camposFaltandoCredito(r.cliente).map((rot) => POR_ROTULO[rot]?.secao);
        setCliente(r.cliente);
        setRespostas(respostasVazias());
        setAbertas((a) => ({ ...a, perguntas: true, ident: secoes.includes("ident"), contato: secoes.includes("contato") }));
        setCarga({ estado: "pronto" });
      } else setCarga({ estado: "erro", erro: r.erro });
    });
  }

  const classeCampo = (id: string) => `${CAMPO}${destacar && faltandoIds.has(id) ? " !border-red-400 bg-red-50/40" : ""}`;
  const req = " *";
  const tamanhoTotalDocumentos = documentos.reduce((acc, f) => acc + f.size, 0);
  const pct = totalObrigatorios > 0 ? Math.round((preenchidos / totalObrigatorios) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end md:items-center justify-center md:p-4" onMouseDown={(e) => e.target === e.currentTarget && pedirFechar()}>
      <div className="bg-gray-50 w-full max-w-3xl max-h-[96dvh] md:max-h-[92vh] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Cabeçalho + progresso */}
        <div className="bg-white border-b border-gray-200 px-4 pt-3 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-gray-900">Avaliação de crédito — {clienteNome}</div>
              <div className="text-[11px] text-gray-500">
                Ao concluir, o card vai para <strong>Montagem de processo</strong> e o administrativo é avisado por e-mail, com os documentos.
              </div>
            </div>
            <button type="button" onClick={pedirFechar} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1" aria-label="Fechar">
              ×
            </button>
          </div>
          {carga.estado === "pronto" && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className={faltam === 0 ? "text-green-700 font-semibold" : "text-gray-600"}>
                  {faltam === 0 ? "Tudo preenchido — é só concluir." : `${preenchidos} de ${totalObrigatorios} obrigatórios preenchidos`}
                </span>
                {rascunhoRestaurado && (
                  <span className="text-gray-400">
                    Rascunho restaurado ·{" "}
                    <button type="button" onClick={descartarRascunho} className="underline hover:text-gray-600">
                      começar do zero
                    </button>
                  </span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${faltam === 0 ? "bg-green-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
              </div>
              {faltam > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-gray-400">Falta:</span>
                  {perguntasFaltando.length > 0 && (
                    <button
                      type="button"
                      onClick={irParaPrimeiraFalta}
                      className="text-[10px] font-semibold rounded-full px-2 py-0.5 border bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                    >
                      {perguntasFaltando.length === 1 ? "1 pergunta" : `${perguntasFaltando.length} perguntas`}
                    </button>
                  )}
                  {faltas.map((f) => (
                    <button
                      key={f.rotulo}
                      type="button"
                      onClick={() => irPara(f.id, f.secao)}
                      className="text-[10px] font-semibold rounded-full px-2 py-0.5 border bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                    >
                      {f.rotulo}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Corpo */}
        <div ref={corpoRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
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

          {carga.estado === "pronto" && (
            <>
              <Secao
                id="perguntas"
                titulo="Perguntas rápidas"
                subtitulo="3 perguntas de sim ou não"
                pendentes={pendentesDaSecao("perguntas")}
                aberta={abertas.perguntas}
                aoAlternar={() => alternar("perguntas")}
              >
                <div className="flex flex-col gap-4">
                  {PERGUNTAS_CREDITO.map((p) => (
                    <fieldset key={p.chave}>
                      <legend className="text-xs text-gray-700 font-medium mb-1.5">{p.pergunta}</legend>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              </Secao>

              <Secao
                id="ident"
                titulo="Identificação"
                subtitulo="Dados pessoais do cliente"
                pendentes={pendentesDaSecao("ident")}
                aberta={abertas.ident}
                aoAlternar={() => alternar("ident")}
              >
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL} htmlFor="cc-nome">
                      {mostrarCpf ? "Nome completo" : "Razão social"}
                      {req}
                    </label>
                    <input id="cc-nome" className={classeCampo("nome")} value={cliente.nome} onChange={(e) => atualizar("nome", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-tipoCliente">
                      Tipo de cliente
                    </label>
                    <select id="cc-tipoCliente" className={CAMPO} value={cliente.tipoCliente} onChange={(e) => atualizar("tipoCliente", e.target.value)}>
                      {TIPOS_CLIENTE.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  {mostrarCpf && (
                    <div>
                      <label className={LABEL} htmlFor="cc-cpf">
                        CPF{req}
                      </label>
                      <input
                        id="cc-cpf"
                        className={classeCampo("cpf")}
                        placeholder="000.000.000-00"
                        inputMode="numeric"
                        value={cliente.cpf}
                        onChange={(e) => atualizar("cpf", e.target.value)}
                        onBlur={(e) => {
                          const v = formatCpf(e.target.value);
                          if (v !== e.target.value) atualizar("cpf", v);
                        }}
                      />
                    </div>
                  )}
                  {mostrarCnpj && (
                    <div>
                      <label className={LABEL} htmlFor="cc-cnpj">
                        CNPJ{req}
                      </label>
                      <input
                        id="cc-cnpj"
                        className={classeCampo("cnpj")}
                        placeholder="00.000.000/0000-00"
                        inputMode="numeric"
                        value={cliente.cnpj}
                        onChange={(e) => atualizar("cnpj", e.target.value)}
                        onBlur={(e) => {
                          const v = formatCnpj(e.target.value);
                          if (v !== e.target.value) atualizar("cnpj", v);
                        }}
                      />
                    </div>
                  )}
                  {mostrarCpf && (
                    <>
                      <div>
                        <label className={LABEL} htmlFor="cc-rg">
                          RG{req}
                        </label>
                        <input id="cc-rg" className={classeCampo("rg")} value={cliente.rg} onChange={(e) => atualizar("rg", e.target.value)} />
                      </div>
                      <div>
                        <label className={LABEL} htmlFor="cc-expedicao">
                          Estado de expedição{req}
                        </label>
                        <input id="cc-expedicao" className={classeCampo("expedicao")} value={cliente.expedicao} onChange={(e) => atualizar("expedicao", e.target.value)} />
                      </div>
                      <div>
                        <label className={LABEL} htmlFor="cc-sexo">
                          Sexo{req}
                        </label>
                        <select id="cc-sexo" className={classeCampo("sexo")} value={cliente.sexo} onChange={(e) => atualizar("sexo", e.target.value)}>
                          <option value="">Selecione...</option>
                          {SEXO_OPCOES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={LABEL} htmlFor="cc-dataNascimento">
                          Data de nascimento{req}
                        </label>
                        <input
                          id="cc-dataNascimento"
                          type="date"
                          className={classeCampo("dataNascimento")}
                          value={cliente.dataNascimento}
                          onChange={(e) => atualizar("dataNascimento", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={LABEL} htmlFor="cc-nomeMae">
                          Nome da mãe{req}
                        </label>
                        <input id="cc-nomeMae" className={classeCampo("nomeMae")} value={cliente.nomeMae} onChange={(e) => atualizar("nomeMae", e.target.value)} />
                      </div>
                      <div>
                        <label className={LABEL} htmlFor="cc-nomePai">
                          Nome do pai{req}
                        </label>
                        <input id="cc-nomePai" className={classeCampo("nomePai")} value={cliente.nomePai} onChange={(e) => atualizar("nomePai", e.target.value)} />
                      </div>
                      <div>
                        <label className={LABEL} htmlFor="cc-estadoCivil">
                          Estado civil{req}
                        </label>
                        <select
                          id="cc-estadoCivil"
                          className={classeCampo("estadoCivil")}
                          value={cliente.estadoCivil}
                          onChange={(e) => {
                            atualizar("estadoCivil", e.target.value);
                            if (!ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(e.target.value)) atualizar("uniaoEstavel", "");
                          }}
                        >
                          <option value="">—</option>
                          {ESTADOS_CIVIS.map((e2) => (
                            <option key={e2} value={e2}>
                              {e2}
                            </option>
                          ))}
                        </select>
                      </div>
                      {ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(cliente.estadoCivil) && (
                        <div>
                          <label className={LABEL} htmlFor="cc-uniaoEstavel">
                            Convive em união estável?{req}
                          </label>
                          <select id="cc-uniaoEstavel" className={classeCampo("uniaoEstavel")} value={cliente.uniaoEstavel} onChange={(e) => atualizar("uniaoEstavel", e.target.value)}>
                            <option value="">Não perguntado ainda</option>
                            <option value="false">Não</option>
                            <option value="true">Sim</option>
                          </select>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Secao>

              <Secao
                id="contato"
                titulo="Contato e endereço"
                subtitulo="Digite o CEP e o endereço é preenchido"
                pendentes={pendentesDaSecao("contato")}
                aberta={abertas.contato}
                aoAlternar={() => alternar("contato")}
              >
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL} htmlFor="cc-telefone">
                      Telefone{req}
                    </label>
                    <input
                      id="cc-telefone"
                      className={classeCampo("telefone")}
                      placeholder="(69) 99999-9999"
                      inputMode="tel"
                      value={cliente.telefone}
                      onChange={(e) => atualizar("telefone", e.target.value)}
                      onBlur={(e) => {
                        const v = formatTelefone(e.target.value);
                        if (v !== e.target.value) atualizar("telefone", v);
                      }}
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-email">
                      E-mail{req}
                    </label>
                    <input id="cc-email" className={classeCampo("email")} type="email" value={cliente.email} onChange={(e) => atualizar("email", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-cep">
                      CEP{req}
                    </label>
                    <input
                      id="cc-cep"
                      className={classeCampo("cep")}
                      placeholder="00000-000"
                      inputMode="numeric"
                      value={cliente.cep}
                      onChange={(e) => atualizar("cep", e.target.value)}
                      onBlur={buscarEnderecoPorCep}
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-rua">
                      Logradouro{req}
                    </label>
                    <input id="cc-rua" className={classeCampo("rua")} value={cliente.rua} onChange={(e) => atualizar("rua", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-nPredial">
                      Número predial{req}
                    </label>
                    <input id="cc-nPredial" className={classeCampo("nPredial")} value={cliente.nPredial} onChange={(e) => atualizar("nPredial", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-complemento">
                      Complemento
                    </label>
                    <input id="cc-complemento" className={CAMPO} value={cliente.complemento} onChange={(e) => atualizar("complemento", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-bairro">
                      Bairro{req}
                    </label>
                    <input id="cc-bairro" className={classeCampo("bairro")} value={cliente.bairro} onChange={(e) => atualizar("bairro", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-estadoId">
                      Estado{req}
                    </label>
                    <select
                      id="cc-estadoId"
                      className={classeCampo("estadoId")}
                      value={cliente.estadoId}
                      onChange={(e) => {
                        atualizar("estadoId", e.target.value);
                        atualizar("cidadeId", "");
                      }}
                    >
                      <option value="">—</option>
                      {listas.estados.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-cidadeId">
                      Cidade{req}
                    </label>
                    <select id="cc-cidadeId" className={classeCampo("cidadeId")} value={cliente.cidadeId} onChange={(e) => atualizar("cidadeId", e.target.value)}>
                      <option value="">—</option>
                      {listas.cidades
                        .filter((c) => c.estado_id === cliente.estadoId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </Secao>

              <Secao
                id="prof"
                titulo="Profissional e renda"
                subtitulo="Ajuda o administrativo na análise"
                opcional
                aberta={abertas.prof}
                aoAlternar={() => alternar("prof")}
              >
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL} htmlFor="cc-profissao">
                      Profissão
                    </label>
                    <input id="cc-profissao" className={CAMPO} value={cliente.profissao} onChange={(e) => atualizar("profissao", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-catProfissao">
                      Categoria de profissão
                    </label>
                    <select id="cc-catProfissao" className={CAMPO} value={cliente.catProfissao} onChange={(e) => atualizar("catProfissao", e.target.value)}>
                      <option value="">—</option>
                      {CAT_PROFISSAO_OPCOES.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-tipoServidor">
                      Tipo de servidor
                    </label>
                    <input id="cc-tipoServidor" className={CAMPO} value={cliente.tipoServidor} onChange={(e) => atualizar("tipoServidor", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-rendaBruta">
                      Renda bruta (R$)
                    </label>
                    <input id="cc-rendaBruta" className={CAMPO} placeholder="2.500,00" inputMode="decimal" value={cliente.rendaBruta} onChange={(e) => atualizar("rendaBruta", e.target.value)} />
                  </div>
                </div>
              </Secao>

              <Secao id="banco" titulo="Dados bancários" subtitulo="Opcional" opcional aberta={abertas.banco} aoAlternar={() => alternar("banco")}>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL} htmlFor="cc-bancoId">
                      Banco
                    </label>
                    <select id="cc-bancoId" className={CAMPO} value={cliente.bancoId} onChange={(e) => selecionarBanco(e.target.value)}>
                      <option value="">—</option>
                      {listas.bancos.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-codigoBanco">
                      Código do banco
                    </label>
                    <input id="cc-codigoBanco" className={CAMPO} value={cliente.codigoBanco} onChange={(e) => atualizar("codigoBanco", e.target.value)} placeholder="Preenchido ao escolher o banco" />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-agencia">
                      Agência
                    </label>
                    <input id="cc-agencia" className={CAMPO} value={cliente.agencia} onChange={(e) => atualizar("agencia", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-conta">
                      Conta
                    </label>
                    <input id="cc-conta" className={CAMPO} value={cliente.conta} onChange={(e) => atualizar("conta", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-tipoConta">
                      Tipo de conta
                    </label>
                    <select id="cc-tipoConta" className={CAMPO} value={cliente.tipoConta} onChange={(e) => atualizar("tipoConta", e.target.value)}>
                      <option value="">—</option>
                      {TIPOS_CONTA.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="cc-tipoPix">
                      Tipo de PIX
                    </label>
                    <select id="cc-tipoPix" className={CAMPO} value={cliente.tipoPix} onChange={(e) => atualizar("tipoPix", e.target.value)}>
                      <option value="">—</option>
                      {TIPOS_PIX.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={LABEL} htmlFor="cc-pix">
                      Chave PIX
                    </label>
                    <input id="cc-pix" className={CAMPO} value={cliente.pix} onChange={(e) => atualizar("pix", e.target.value)} />
                  </div>
                </div>
              </Secao>

              <Secao
                id="docs"
                titulo="Documentos do cliente"
                subtitulo={documentos.length > 0 ? `${documentos.length} anexado${documentos.length === 1 ? "" : "s"}` : "RG ou CNH, comprovantes de renda e de residência, certidão de estado civil"}
                aberta={abertas.docs}
                aoAlternar={() => alternar("docs")}
              >
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
                  className={`border-2 border-dashed rounded-xl px-4 py-5 text-center transition-colors ${
                    arrastandoArquivo ? "border-primary bg-primary/5" : "border-gray-300 bg-white"
                  }`}
                >
                  <div className="text-xs text-gray-600">Arraste os arquivos para cá ou</div>
                  <label className="inline-block mt-2 text-xs bg-white border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 font-semibold cursor-pointer hover:bg-gray-50">
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
                  <div className="flex flex-col gap-1.5 mt-3">
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
                    <div className="text-[11px] text-gray-400">Total: {formatarTamanho(tamanhoTotalDocumentos)}</div>
                  </div>
                )}
                {erroAnexo && <p className="text-xs text-red-600 mt-2">{erroAnexo}</p>}
              </Secao>

              <Secao id="obs" titulo="Observação" subtitulo="Opcional" opcional aberta={abertas.obs} aoAlternar={() => alternar("obs")}>
                <textarea id="cc-observacao" className={`${CAMPO} min-h-16`} value={cliente.observacao} onChange={(e) => atualizar("observacao", e.target.value)} />
              </Secao>
            </>
          )}
        </div>

        {/* Rodapé */}
        {carga.estado === "pronto" && (
          <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-60 hover:opacity-90 disabled:cursor-wait inline-flex items-center justify-center gap-1.5"
            >
              {enviando && <span className="w-3 h-3 border-2 rounded-full animate-spin border-white/40 border-t-white shrink-0" />}
              {enviando ? etapaEnvio || "Enviando..." : faltam > 0 ? `Concluir (faltam ${faltam})` : "Concluir e mover para Montagem de processo"}
            </button>
            <button type="button" onClick={pedirFechar} disabled={enviando} className="text-sm text-gray-500 hover:text-gray-800 px-2 disabled:opacity-50">
              Cancelar
            </button>
            <span className="text-[11px] text-gray-400">Seu progresso fica salvo neste navegador.</span>
            {erroEnvio && <div className="w-full text-xs text-red-600">{erroEnvio}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function Secao({
  id,
  titulo,
  subtitulo,
  pendentes = 0,
  opcional,
  aberta,
  aoAlternar,
  children
}: {
  id: SecaoId;
  titulo: string;
  subtitulo?: string;
  pendentes?: number;
  opcional?: boolean;
  aberta: boolean;
  aoAlternar: () => void;
  children: React.ReactNode;
}) {
  const completa = !opcional && pendentes === 0;
  return (
    <section id={`cc-${id}`} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button type="button" onClick={aoAlternar} aria-expanded={aberta} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
        <span
          className={`shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
            completa ? "bg-green-100 text-green-700" : opcional ? "bg-gray-100 text-gray-400" : "bg-amber-100 text-amber-700"
          }`}
        >
          {completa ? "✓" : opcional ? "·" : pendentes}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-gray-800">
            {titulo}
            {opcional && <span className="ml-2 text-[10px] font-normal text-gray-400">opcional</span>}
          </span>
          {subtitulo && <span className="block text-[11px] text-gray-400 truncate">{subtitulo}</span>}
        </span>
        <span className="text-gray-400 text-xs shrink-0">{aberta ? "▲" : "▼"}</span>
      </button>
      {aberta && <div className="px-4 pb-4 pt-1 border-t border-gray-100">{children}</div>}
    </section>
  );
}
