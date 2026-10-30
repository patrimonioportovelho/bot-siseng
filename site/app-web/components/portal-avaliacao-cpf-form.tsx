"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ESTADOS_CIVIS,
  ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL,
  TIPOS_CONTA,
  TIPOS_PIX,
  TIPOS_CLIENTE,
  SEXO_OPCOES,
  CAT_PROFISSAO_OPCOES
} from "@/lib/clientes/opcoes";
import type { ClienteBuscaResultado } from "@/lib/transacoes/buscas";
import { validarCpfCnpj } from "@/lib/clientes/validacao";
import { buscarCep, UF_PARA_ESTADO } from "@/lib/enderecos";
import {
  carregarClienteParaCreditoAction,
  converterEmAvaliacaoCreditoAction,
  criarAvaliacaoCpfAction,
  prepararUploadDocumentoAvaliacaoAction
} from "@/app/portal/avaliacao-cpf/actions";
import {
  PERGUNTAS_CREDITO,
  camposFaltandoCredito,
  clienteVazio,
  respostasIncompletas,
  respostasVazias,
  type ClienteAvaliacao,
  type RespostaCredito,
  type RespostasCredito
} from "@/lib/financiamento/avaliacao-credito";
import { supabaseBrowser, BUCKET_DOCUMENTOS_PORTAL } from "@/lib/supabase-browser";

type Banco = { id: string; nome: string; codigo: string | null };

function clienteDeExistente(c: ClienteBuscaResultado): ClienteAvaliacao {
  return { ...clienteVazio(), clienteId: c.id, nome: c.nome, cpf: c.cpfCnpj ?? "", telefone: c.telefone ?? "", email: c.email ?? "" };
}

function labelCliente(c: ClienteBuscaResultado): string {
  return c.cpfCnpj ? `${c.nome} — ${c.cpfCnpj}` : c.nome;
}

// Rascunho salvo no navegador (localStorage) — mesmo mecanismo de
// components/portal-compra-venda-form.tsx (pedido do usuário depois de
// perder cadastros por erro no envio). Documentos (File) não entram no
// rascunho, só os dados do cliente.
const RASCUNHO_KEY = "sis_rascunho_avaliacao_cpf";

type Modalidade = "" | "consulta" | "credito";

type RascunhoAvaliacaoCpf = {
  salvoEm: number;
  cliente: ClienteAvaliacao;
  busca: string;
  modalidade?: Modalidade;
  respostas?: RespostasCredito;
};

function formatarDataHoraRascunho(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const RESULTADOS_MAXIMO = 200;

const TAMANHO_MAXIMO_TOTAL = 15 * 1024 * 1024;
const TIPOS_ACEITOS = ["application/pdf", "image/"];

function tipoAceito(arquivo: File): boolean {
  return TIPOS_ACEITOS.some((t) => arquivo.type.startsWith(t));
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

export function PortalAvaliacaoCpfForm({
  clientesDisponiveis,
  bancos,
  estados,
  cidades,
  conversao
}: {
  clientesDisponiveis: ClienteBuscaResultado[];
  bancos: Banco[];
  estados: { id: string; nome: string }[];
  cidades: { id: string; nome: string; estado_id: string }[];
  // Corretor que consultou o CPF e agora transforma a consulta em Avaliação de
  // crédito: o cadastro vem preenchido e a modalidade já é "crédito".
  conversao?: { avaliacaoId: string; cliente: ClienteAvaliacao; respostas: RespostasCredito };
}) {
  const [modalidade, setModalidade] = useState<Modalidade>(conversao ? "credito" : "");
  const [respostas, setRespostas] = useState<RespostasCredito>(conversao?.respostas ?? respostasVazias());
  const [carregandoCliente, setCarregandoCliente] = useState(false);
  const [erroCliente, setErroCliente] = useState("");
  const [cliente, setCliente] = useState<ClienteAvaliacao>(conversao?.cliente ?? clienteVazio());
  const [busca, setBusca] = useState("");
  const [listaAberta, setListaAberta] = useState(false);

  const [documentos, setDocumentos] = useState<File[]>([]);
  const [erroAnexo, setErroAnexo] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [etapaEnvio, setEtapaEnvio] = useState("");
  const [resultado, setResultado] = useState<
    { ok: true; avaliacaoId: string } | { ok: false; erro: string } | null
  >(null);

  const [enviadoComo, setEnviadoComo] = useState<Modalidade>("");
  const [rascunhoEncontrado, setRascunhoEncontrado] = useState<RascunhoAvaliacaoCpf | null>(null);
  const [rascunhoSalvoAgora, setRascunhoSalvoAgora] = useState(false);

  // Ao montar, só AVISA que existe rascunho — não aplica sozinho (evita
  // sobrescrever o que o corretor já tiver preenchido nesta mesma visita).
  useEffect(() => {
    if (conversao) return; // conversão não usa rascunho
    try {
      const bruto = window.localStorage.getItem(RASCUNHO_KEY);
      if (bruto) setRascunhoEncontrado(JSON.parse(bruto));
    } catch {
      // rascunho corrompido ou localStorage indisponível — ignora
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function montarRascunho(): RascunhoAvaliacaoCpf {
    return { salvoEm: Date.now(), cliente, busca, modalidade, respostas };
  }

  // Salva sozinho a cada mudança relevante — o botão "Salvar rascunho"
  // abaixo só dá a confirmação visual, o auto-save já cobre o esquecimento.
  useEffect(() => {
    if (conversao) return;
    const temAlgumDado = cliente.nome.trim().length > 0 || cliente.cpf.trim().length > 0 || cliente.cnpj.trim().length > 0;
    if (!temAlgumDado) return;
    try {
      window.localStorage.setItem(RASCUNHO_KEY, JSON.stringify(montarRascunho()));
    } catch {
      // localStorage cheio ou indisponível — não trava o formulário por isso
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente]);

  function restaurarRascunho() {
    const r = rascunhoEncontrado;
    if (!r) return;
    setCliente(r.cliente);
    setBusca(r.busca);
    if (r.modalidade) setModalidade(r.modalidade);
    if (r.respostas) setRespostas(r.respostas);
    setRascunhoEncontrado(null);
  }

  function descartarRascunho() {
    try {
      window.localStorage.removeItem(RASCUNHO_KEY);
    } catch {
      // ignora
    }
    setRascunhoEncontrado(null);
  }

  function salvarRascunhoManual() {
    try {
      window.localStorage.setItem(RASCUNHO_KEY, JSON.stringify(montarRascunho()));
      setRascunhoSalvoAgora(true);
      setTimeout(() => setRascunhoSalvoAgora(false), 2500);
    } catch {
      // ignora
    }
  }

  const mostrarCpf = cliente.tipoCliente !== "Pessoa Jurídica";
  const mostrarCnpj = cliente.tipoCliente !== "Pessoa Física";

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return clientesDisponiveis.slice(0, RESULTADOS_MAXIMO);
    return clientesDisponiveis.filter((c) => c.nome.toLowerCase().includes(b)).slice(0, RESULTADOS_MAXIMO);
  }, [busca, clientesDisponiveis]);

  // Na Avaliação de crédito os dados do cliente precisam estar completos, então
  // o cadastro dele (do próprio corretor) é carregado nos campos para conferir.
  async function carregarCadastroCompleto(clienteId: string) {
    setCarregandoCliente(true);
    setErroCliente("");
    const r = await carregarClienteParaCreditoAction(clienteId);
    setCarregandoCliente(false);
    if (r.ok) {
      setCliente(r.cliente);
    } else {
      setErroCliente(r.erro);
      setCliente(clienteVazio());
      setBusca("");
    }
  }

  function selecionarExistente(c: ClienteBuscaResultado) {
    setCliente(clienteDeExistente(c));
    setBusca(c.nome);
    setListaAberta(false);
    setErroCliente("");
    if (modalidade === "credito") void carregarCadastroCompleto(c.id);
  }

  function escolherModalidade(m: Modalidade) {
    setModalidade(m);
    setResultado(null);
    setErroCliente("");
    if (m === "credito" && cliente.clienteId) void carregarCadastroCompleto(cliente.clienteId);
  }

  function comecarCadastroNovo() {
    setCliente(clienteVazio());
    setBusca("");
    setListaAberta(false);
    setErroCliente("");
  }

  function atualizar<K extends keyof ClienteAvaliacao>(campo: K, valor: ClienteAvaliacao[K]) {
    setCliente((atual) => ({ ...atual, [campo]: valor }));
  }

  function selecionarBanco(bancoId: string) {
    const banco = bancos.find((b) => b.id === bancoId);
    setCliente((atual) => ({ ...atual, bancoId, codigoBanco: banco?.codigo ?? atual.codigoBanco }));
  }

  // Busca automática de CEP (ViaCEP) — mesmo comportamento do cadastro
  // administrativo (ver components/cliente-form.tsx).
  async function buscarEnderecoPorCep() {
    const encontrado = await buscarCep(cliente.cep);
    if (!encontrado) return;

    const nomeEstado = UF_PARA_ESTADO[encontrado.uf] ?? "";
    const estadoEncontrado = estados.find((e) => e.nome.toLowerCase() === nomeEstado.toLowerCase());
    const cidadeEncontrada = estadoEncontrado
      ? cidades.find(
          (cid) => cid.estado_id === estadoEncontrado.id && cid.nome.toLowerCase() === encontrado.localidade.toLowerCase()
        )
      : undefined;

    setCliente((atual) => ({
      ...atual,
      rua: encontrado.logradouro || atual.rua,
      bairro: encontrado.bairro || atual.bairro,
      estadoId: estadoEncontrado?.id ?? atual.estadoId,
      cidadeId: cidadeEncontrada?.id ?? ""
    }));
  }

  function adicionarDocumentos(lista: FileList | null) {
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

  function removerDocumento(indice: number) {
    setDocumentos((atual) => atual.filter((_, i) => i !== indice));
  }

  const tamanhoTotalDocumentos = documentos.reduce((acc, f) => acc + f.size, 0);

  // Tipo de cliente, Nome, CPF/CNPJ, Sexo (PF) e Telefone obrigatórios —
  // pedido do usuário (09/08/2026, "alinhamento do cadastro de cliente").
  // Cliente já cadastrado (clienteId) não passa por essa checagem de novo,
  // só é reaproveitado.
  const credito = modalidade === "credito";
  const req = credito ? " *" : "";
  const faltandoCredito = credito ? camposFaltandoCredito(cliente) : [];
  const faltaResposta = credito && respostasIncompletas(respostas);
  const erroCredito = credito
    ? faltandoCredito.length > 0
      ? `Falta preencher: ${faltandoCredito.join(", ")}.`
      : faltaResposta
        ? "Responda as 3 perguntas."
        : null
    : null;

  const erroCadastroCliente = credito
    ? erroCredito
    : cliente.clienteId
    ? null
    : !cliente.nome.trim()
      ? null
      : mostrarCpf && !cliente.cpf.trim()
        ? "Informe o CPF."
        : !mostrarCpf && !cliente.cnpj.trim()
          ? "Informe o CNPJ."
          : mostrarCpf && !cliente.sexo
            ? "Informe o sexo."
            : !cliente.telefone.trim()
              ? "Informe o telefone."
              : null;

  const podeEnviar =
    modalidade === "" || carregandoCliente
      ? false
      : credito
        ? !erroCredito
        : cliente.clienteId
          ? true
          : cliente.nome.trim().length > 0 &&
            (mostrarCpf ? cliente.cpf.trim().length > 0 : cliente.cnpj.trim().length > 0) &&
            !erroCadastroCliente;

  async function handleEnviar() {
    setEnviando(true);
    setEtapaEnvio("");
    setResultado(null);
    try {
      const documentosEnviados: { caminho: string; nomeOriginal: string }[] = [];
      for (let i = 0; i < documentos.length; i++) {
        const arquivo = documentos[i];
        setEtapaEnvio(`Enviando documento ${i + 1} de ${documentos.length}...`);
        const preparo = await prepararUploadDocumentoAvaliacaoAction(arquivo.name);
        if (!preparo.ok) throw new Error(`Falha ao preparar envio de "${arquivo.name}": ${preparo.erro}`);
        const { error: erroUpload } = await supabaseBrowser()
          .storage.from(BUCKET_DOCUMENTOS_PORTAL)
          .uploadToSignedUrl(preparo.caminho, preparo.token, arquivo, { contentType: arquivo.type });
        if (erroUpload) throw new Error(`Falha ao enviar "${arquivo.name}": ${erroUpload.message}`);
        documentosEnviados.push({ caminho: preparo.caminho, nomeOriginal: arquivo.name });
      }
      setEtapaEnvio("Cadastrando...");

      const formData = new FormData();
      formData.set("clienteJson", JSON.stringify(cliente));
      formData.set("documentosJson", JSON.stringify(documentosEnviados));
      formData.set("modalidade", modalidade);
      formData.set("respostasJson", JSON.stringify(respostas));

      const r = conversao
        ? await converterEmAvaliacaoCreditoAction(conversao.avaliacaoId, formData).then((x) =>
            x.ok ? ({ ok: true, avaliacaoId: conversao.avaliacaoId } as const) : x
          )
        : await criarAvaliacaoCpfAction(formData);
      setResultado(r);
      setEnviadoComo(modalidade);
      if (r.ok) {
        setCliente(clienteVazio());
        setBusca("");
        setRespostas(respostasVazias());
        setModalidade(conversao ? "credito" : "");
        setDocumentos([]);
        // Cadastrou com sucesso — o rascunho não serve mais pra nada.
        try {
          window.localStorage.removeItem(RASCUNHO_KEY);
        } catch {
          // ignora
        }
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      setResultado({
        ok: false,
        erro: `Não foi possível concluir o cadastro (${mensagem}). Tente de novo — se continuar acontecendo, avise o administrativo com essa mensagem.`
      });
    } finally {
      setEnviando(false);
      setEtapaEnvio("");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {rascunhoEncontrado && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs text-amber-800">
            Encontramos um rascunho salvo neste navegador em{" "}
            <strong>{formatarDataHoraRascunho(rascunhoEncontrado.salvoEm)}</strong>. Quer continuar de onde parou?
            {" "}(documentos anexados não ficam salvos — se tinha algum, precisa adicionar de novo).
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={restaurarRascunho}
              className="text-xs bg-amber-600 text-white rounded-lg px-3 py-1.5 font-semibold hover:opacity-90"
            >
              Restaurar rascunho
            </button>
            <button type="button" onClick={descartarRascunho} className="text-xs text-amber-700 hover:text-amber-900">
              descartar
            </button>
          </div>
        </div>
      )}

      {!conversao && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-1">O que você quer fazer?</div>
          <p className="text-[11px] text-gray-400 mb-3">Escolha antes de preencher. Dá pra transformar uma Consulta de CPF em Avaliação de crédito depois.</p>
          <div className="grid md:grid-cols-2 gap-3">
            {(
              [
                { id: "consulta", titulo: "Consulta de CPF", texto: "Só ver se o CPF está limpo. Precisa de nome, CPF, sexo e telefone." },
                { id: "credito", titulo: "Avaliação de crédito", texto: "Cadastro completo do cliente e 3 perguntas. A etiqueta já entra em Montagem de processo." }
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => escolherModalidade(o.id)}
                className={`text-left border rounded-xl p-3 transition-colors ${
                  modalidade === o.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="text-sm font-semibold text-gray-800">{o.titulo}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{o.texto}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {conversao && resultado?.ok ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-xs text-green-800">
          Consulta transformada em Avaliação de crédito. A etiqueta passou para <strong>Montagem de processo</strong> e o administrativo já foi avisado.
          <div className="mt-3">
            <Link href="/portal/avaliacao-cpf" className="bg-primary text-white rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 inline-block">
              Voltar para minhas avaliações
            </Link>
          </div>
        </div>
      ) : modalidade === "" ? null : (
      <>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Cliente</div>
        <p className="text-[11px] text-gray-400 mb-3">
          {credito
            ? "Na Avaliação de crédito toda a identificação e o contato são obrigatórios (campos com *). Busque um cliente seu já cadastrado ou preencha o cadastro."
            : "Busque um cliente já cadastrado ou preencha o cadastro completo — é o que o administrativo precisa pra rodar a avaliação de crédito."}
        </p>
        {erroCliente && <p className="text-xs text-red-600 mb-3">{erroCliente}</p>}
        {carregandoCliente && <p className="text-xs text-gray-400 mb-3">Carregando o cadastro do cliente...</p>}

        {!conversao && (
        <div className="relative mb-3">
          <label className={LABEL}>Buscar cliente já cadastrado...</label>
          <input
            className={CAMPO}
            placeholder="Nome do cliente..."
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setListaAberta(true);
              if (cliente.clienteId) setCliente(clienteVazio());
            }}
            onFocus={() => setListaAberta(true)}
            onBlur={() => setTimeout(() => setListaAberta(false), 150)}
          />
          {listaAberta && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
              {filtrados.length === 0 && <p className="text-xs text-gray-400 p-3">Nenhum cliente encontrado.</p>}
              {filtrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={() => selecionarExistente(c)}
                  className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                >
                  {labelCliente(c)}
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {cliente.clienteId && !credito ? (
          <div className="border border-gray-100 rounded-lg p-3 flex items-center justify-between">
            <div className="text-xs text-gray-700 font-medium">
              {cliente.nome}
              {cliente.cpf && <span className="text-gray-400 font-normal"> — {cliente.cpf}</span>}
              <span className="block text-[11px] text-primary font-normal mt-0.5">Cliente já cadastrado</span>
            </div>
            <button type="button" onClick={comecarCadastroNovo} className="text-[11px] text-gray-400 hover:text-red-600">
              trocar
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {credito && cliente.clienteId && (
              <div className="border border-gray-100 rounded-lg p-3 flex items-center justify-between">
                <div className="text-xs text-gray-700 font-medium">
                  {cliente.nome}
                  <span className="block text-[11px] text-primary font-normal mt-0.5">
                    Cliente já cadastrado — confira os dados e complete o que faltar
                  </span>
                </div>
                {!conversao && (
                  <button type="button" onClick={comecarCadastroNovo} className="text-[11px] text-gray-400 hover:text-red-600">
                    trocar
                  </button>
                )}
              </div>
            )}
            <div className="pt-2 border-t border-gray-100">
              <div className="text-[11px] font-semibold text-gray-500 mb-2">Identificação</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Nome completo *</label>
                  <input className={CAMPO} value={cliente.nome} onChange={(e) => atualizar("nome", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Tipo de cliente</label>
                  <select className={CAMPO} value={cliente.tipoCliente} onChange={(e) => atualizar("tipoCliente", e.target.value)}>
                    {TIPOS_CLIENTE.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                {mostrarCpf && (
                  <div>
                    <label className={LABEL}>CPF *</label>
                    <input
                      className={CAMPO}
                      placeholder="000.000.000-00"
                      value={cliente.cpf}
                      onChange={(e) => atualizar("cpf", e.target.value)}
                      onBlur={(e) => {
                        const erro = e.target.value ? validarCpfCnpj(e.target.value) : null;
                        if (erro) alert(erro);
                      }}
                    />
                  </div>
                )}
                {mostrarCnpj && (
                  <div>
                    <label className={LABEL}>CNPJ *</label>
                    <input
                      className={CAMPO}
                      placeholder="00.000.000/0000-00"
                      value={cliente.cnpj}
                      onChange={(e) => atualizar("cnpj", e.target.value)}
                      onBlur={(e) => {
                        const erro = e.target.value ? validarCpfCnpj(e.target.value) : null;
                        if (erro) alert(erro);
                      }}
                    />
                  </div>
                )}
                {mostrarCpf && (
                  <div>
                    <label className={LABEL}>RG{req}</label>
                    <input className={CAMPO} value={cliente.rg} onChange={(e) => atualizar("rg", e.target.value)} />
                  </div>
                )}
                {mostrarCpf && (
                  <div>
                    <label className={LABEL}>Estado de expedição{req}</label>
                    <input className={CAMPO} value={cliente.expedicao} onChange={(e) => atualizar("expedicao", e.target.value)} />
                  </div>
                )}
                {mostrarCpf && (
                  <div>
                    <label className={LABEL}>Sexo *</label>
                    <select className={CAMPO} value={cliente.sexo} onChange={(e) => atualizar("sexo", e.target.value)}>
                      <option value="">Selecione...</option>
                      {SEXO_OPCOES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {mostrarCpf && (
                  <>
                    <div>
                      <label className={LABEL}>Nome da mãe{req}</label>
                      <input className={CAMPO} value={cliente.nomeMae} onChange={(e) => atualizar("nomeMae", e.target.value)} />
                    </div>
                    <div>
                      <label className={LABEL}>Nome do pai{req}</label>
                      <input className={CAMPO} value={cliente.nomePai} onChange={(e) => atualizar("nomePai", e.target.value)} />
                    </div>
                  </>
                )}
                <div>
                  <label className={LABEL}>Estado civil{req}</label>
                  <select
                    className={CAMPO}
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
                    <label className={LABEL}>Convive em união estável?{req}</label>
                    <select className={CAMPO} value={cliente.uniaoEstavel} onChange={(e) => atualizar("uniaoEstavel", e.target.value)}>
                      <option value="">Não perguntado ainda</option>
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className={LABEL}>Data de nascimento{req}</label>
                  <input type="date" className={CAMPO} value={cliente.dataNascimento} onChange={(e) => atualizar("dataNascimento", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <div className="text-[11px] font-semibold text-gray-500 mb-2">Contato</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Telefone *</label>
                  <input className={CAMPO} placeholder="(69) 99999-9999" value={cliente.telefone} onChange={(e) => atualizar("telefone", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>E-mail{req}</label>
                  <input className={CAMPO} type="email" value={cliente.email} onChange={(e) => atualizar("email", e.target.value)} />
                </div>
                {/* Endereço estruturado (CEP/rua/número/complemento/bairro/
                    estado/cidade) vale pros dois tipos — PF ("Endereço") e PJ
                    ("Sede"), mesmo padrão do cadastro de Clientes do admin
                    (19/08/2026). */}
                <div>
                  <label className={LABEL}>CEP{req}</label>
                  <input className={CAMPO} value={cliente.cep} onChange={(e) => atualizar("cep", e.target.value)} onBlur={buscarEnderecoPorCep} />
                </div>
                <div>
                  <label className={LABEL}>Logradouro{req}</label>
                  <input className={CAMPO} value={cliente.rua} onChange={(e) => atualizar("rua", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Número predial{req}</label>
                  <input className={CAMPO} value={cliente.nPredial} onChange={(e) => atualizar("nPredial", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Complemento</label>
                  <input className={CAMPO} value={cliente.complemento} onChange={(e) => atualizar("complemento", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Bairro{req}</label>
                  <input className={CAMPO} value={cliente.bairro} onChange={(e) => atualizar("bairro", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Estado{req}</label>
                  <select
                    className={CAMPO}
                    value={cliente.estadoId}
                    onChange={(e) => {
                      atualizar("estadoId", e.target.value);
                      atualizar("cidadeId", "");
                    }}
                  >
                    <option value="">—</option>
                    {estados.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Cidade{req}</label>
                  <select className={CAMPO} value={cliente.cidadeId} onChange={(e) => atualizar("cidadeId", e.target.value)}>
                    <option value="">—</option>
                    {cidades
                      .filter((c) => c.estado_id === cliente.estadoId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <div className="text-[11px] font-semibold text-gray-500 mb-2">Profissional (importante pra avaliação)</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Profissão</label>
                  <input className={CAMPO} value={cliente.profissao} onChange={(e) => atualizar("profissao", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Categoria de profissão</label>
                  <select className={CAMPO} value={cliente.catProfissao} onChange={(e) => atualizar("catProfissao", e.target.value)}>
                    <option value="">—</option>
                    {CAT_PROFISSAO_OPCOES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Tipo de servidor</label>
                  <input className={CAMPO} value={cliente.tipoServidor} onChange={(e) => atualizar("tipoServidor", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Renda bruta (R$)</label>
                  <input className={CAMPO} placeholder="2.500,00" value={cliente.rendaBruta} onChange={(e) => atualizar("rendaBruta", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <div className="text-[11px] font-semibold text-gray-500 mb-2">Dados bancários</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Banco</label>
                  <select className={CAMPO} value={cliente.bancoId} onChange={(e) => selecionarBanco(e.target.value)}>
                    <option value="">—</option>
                    {bancos.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Código do banco</label>
                  <input className={CAMPO} value={cliente.codigoBanco} onChange={(e) => atualizar("codigoBanco", e.target.value)} placeholder="Preenchido ao escolher o banco" />
                </div>
                <div>
                  <label className={LABEL}>Agência</label>
                  <input className={CAMPO} value={cliente.agencia} onChange={(e) => atualizar("agencia", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Conta</label>
                  <input className={CAMPO} value={cliente.conta} onChange={(e) => atualizar("conta", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Tipo de conta</label>
                  <select className={CAMPO} value={cliente.tipoConta} onChange={(e) => atualizar("tipoConta", e.target.value)}>
                    <option value="">—</option>
                    {TIPOS_CONTA.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Tipo de PIX</label>
                  <select className={CAMPO} value={cliente.tipoPix} onChange={(e) => atualizar("tipoPix", e.target.value)}>
                    <option value="">—</option>
                    {TIPOS_PIX.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={LABEL}>Chave PIX</label>
                  <input className={CAMPO} value={cliente.pix} onChange={(e) => atualizar("pix", e.target.value)} />
                </div>
              </div>
            </div>

            {credito && (
              <div className="pt-2 border-t border-gray-100">
                <div className="text-[11px] font-semibold text-gray-500 mb-2">Perguntas da avaliação *</div>
                <div className="flex flex-col gap-4">
                  {PERGUNTAS_CREDITO.map((p) => (
                    <fieldset key={p.chave}>
                      <legend className="text-xs text-gray-700 font-medium mb-1.5">{p.pergunta}</legend>
                      <div className="flex flex-col gap-1.5">
                        {(
                          [
                            { valor: "sim", texto: p.sim },
                            { valor: "nao", texto: p.nao }
                          ] as { valor: RespostaCredito; texto: string }[]
                        ).map((o) => (
                          <label
                            key={o.valor}
                            className={`flex items-center gap-2 text-xs border rounded-lg px-3 py-2 cursor-pointer ${
                              respostas[p.chave] === o.valor ? "border-primary bg-primary/5 text-gray-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`pergunta-${p.chave}`}
                              checked={respostas[p.chave] === o.valor}
                              onChange={() => setRespostas((atual) => ({ ...atual, [p.chave]: o.valor }))}
                            />
                            {o.texto}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-gray-100">
              <label className={LABEL}>Observação</label>
              <textarea className={CAMPO + " min-h-16"} value={cliente.observacao} onChange={(e) => atualizar("observacao", e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Documentos do cliente</div>
        <p className="text-[11px] text-gray-400 mb-3">
          PDF ou imagem (RG, comprovante de renda, comprovante de residência etc.). Vai direto por email pro
          administrativo — não fica guardado no sistema. Total até {formatarTamanho(TAMANHO_MAXIMO_TOTAL)}.
        </p>

        {documentos.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-3">
            {documentos.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-gray-700 truncate">
                  {f.name} <span className="text-gray-400">— {formatarTamanho(f.size)}</span>
                </span>
                <button type="button" onClick={() => removerDocumento(i)} className="text-gray-400 hover:text-red-600 ml-2 shrink-0">
                  remover
                </button>
              </div>
            ))}
            <div className="text-[11px] text-gray-400">Total: {formatarTamanho(tamanhoTotalDocumentos)}</div>
          </div>
        )}

        <label className="inline-block text-xs bg-white border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 font-semibold cursor-pointer hover:bg-gray-50">
          + Adicionar documento
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

        {erroAnexo && <p className="text-xs text-red-600 mt-2">{erroAnexo}</p>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={!podeEnviar || enviando}
          onClick={handleEnviar}
          className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40 hover:opacity-90 disabled:cursor-wait inline-flex items-center justify-center gap-1.5"
        >
          {enviando && <span className="w-3 h-3 border-2 rounded-full animate-spin border-white/40 border-t-white shrink-0" />}
          {enviando ? etapaEnvio || "Cadastrando..." : conversao ? "Transformar em Avaliação de crédito" : credito ? "Cadastrar avaliação de crédito" : "Cadastrar consulta de CPF"}
        </button>
        {!conversao && (
        <button
          type="button"
          onClick={salvarRascunhoManual}
          className="bg-white border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-gray-50"
        >
          Salvar rascunho
        </button>
        )}
        {rascunhoSalvoAgora && <span className="text-xs text-green-700 font-semibold">Rascunho salvo neste navegador.</span>}
        {erroCadastroCliente && <span className="text-xs text-red-600">{erroCadastroCliente}</span>}

        {resultado && !resultado.ok && <span className="text-xs text-red-600">{resultado.erro}</span>}
      </div>
      </>
      )}

      {!conversao && modalidade === "" && resultado?.ok && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-xs text-green-800">
          {enviadoComo === "credito"
            ? "Avaliação de crédito cadastrada. A etiqueta já está em Montagem de processo no Financiamento."
            : "Consulta de CPF cadastrada. O administrativo vai dar sequência no Financiamento."}
        </div>
      )}
    </div>
  );
}
