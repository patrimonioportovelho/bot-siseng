"use client";

import { useEffect, useMemo, useState } from "react";
import { TIPOS_IMOVEL } from "@/lib/imoveis/opcoes";
import {
  ESTADOS_CIVIS,
  ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL,
  TIPOS_CONTA,
  TIPOS_PIX,
  TIPOS_CLIENTE,
  SEXO_OPCOES
} from "@/lib/clientes/opcoes";
import { validarCpfCnpj } from "@/lib/clientes/validacao";
import { buscarCep, UF_PARA_ESTADO } from "@/lib/enderecos";
import { AGUA_OPCOES, ENERGIA_OPCOES } from "@/lib/administracoes/opcoes";
import { CampoLink } from "@/components/campo-link";
import { cadastrarAdministracaoAction, prepararUploadDocumentoAction } from "@/app/portal/administracao/actions";
import { supabaseBrowser, BUCKET_DOCUMENTOS_PORTAL } from "@/lib/supabase-browser";

type Banco = { id: string; nome: string; codigo: string | null };

type BairroCadastrado = { cidade_id: string | null; bairro: string | null };

type ClienteLinha = {
  // Presente só quando o corretor escolheu um cliente já cadastrado (em vez
  // de digitar um novo) — nesse caso mostra só um resumo (nome — CPF/CNPJ),
  // pra não deixar editar um cadastro existente por aqui.
  clienteId?: string;
  // Sempre perguntado antes do resto (só quando é cliente novo) — Pessoa
  // Física ou Pessoa Jurídica (mesmo pente-fino da Central de Clientes, ver
  // components/cliente-form.tsx).
  tipoCliente: string;
  nome: string;
  rg: string;
  cpfCnpj: string;
  // Só perguntado quando Pessoa Física — pedido do usuário (09/08/2026,
  // "alinhamento do cadastro de cliente"): Sexo obrigatório em todo
  // formulário, não só no cadastro administrativo.
  sexo: string;
  // Endereço de Pessoa Física é dividido (CEP/logradouro/número/complemento/
  // bairro/cidade/estado); Pessoa Jurídica usa "endereco" como Sede em texto
  // livre solto.
  endereco: string;
  cep: string;
  rua: string;
  nPredial: string;
  complemento: string;
  bairro: string;
  estadoId: string;
  cidadeId: string;
  nomeMae: string;
  nomePai: string;
  nacionalidade: string;
  estadoCivil: string;
  // "" (não perguntado), "true" ou "false" — só perguntado/mostrado quando
  // estadoCivil é um dos que pedem (ver ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL).
  uniaoEstavel: string;
  profissao: string;
  email: string;
  telefone: string;
  // Dados bancários — mesmo cadastro completo do administrativo (ver
  // components/cliente-form.tsx), liberado aqui pro corretor já deixar o
  // cliente novo com a conta certinha desde o cadastro.
  bancoId: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  tipoPix: string;
  pix: string;
};

type ImovelDoCliente = {
  id: string;
  tipoImovel: string;
  rua: string;
  nPredial: string;
  complemento: string;
  bairro: string;
  estadoId: string;
  cidadeId: string;
  matricula: string;
  inscricao: string;
  endereco: string;
};

type ClienteDoCorretor = {
  id: string;
  nome: string;
  rg: string;
  cpfCnpj: string;
  endereco: string;
  nacionalidade: string;
  estadoCivil: string;
  email: string;
  telefone: string;
  imoveis: ImovelDoCliente[];
};

function clienteVazio(): ClienteLinha {
  return {
    tipoCliente: "",
    nome: "",
    rg: "",
    cpfCnpj: "",
    sexo: "",
    endereco: "",
    cep: "",
    rua: "",
    nPredial: "",
    complemento: "",
    bairro: "",
    estadoId: "",
    cidadeId: "",
    nomeMae: "",
    nomePai: "",
    nacionalidade: "Brasileira",
    estadoCivil: "",
    uniaoEstavel: "",
    profissao: "",
    email: "",
    telefone: "",
    bancoId: "",
    codigoBanco: "",
    agencia: "",
    conta: "",
    tipoConta: "",
    tipoPix: "",
    pix: ""
  };
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const TAMANHO_MAXIMO_TOTAL = 15 * 1024 * 1024;
const TIPOS_ACEITOS = ["application/pdf", "image/"];

function tipoAceito(arquivo: File): boolean {
  return TIPOS_ACEITOS.some((t) => arquivo.type.startsWith(t));
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Rascunho salvo no navegador (localStorage) — mesmo padrão já usado em
// Compra e Venda/Locação/Avaliação de CPF: nunca aplica sozinho ao carregar
// a tela (só avisa que existe), fica disponível pro corretor continuar de
// onde parou mesmo se ele sair e voltar depois, inclusive vindo de outra
// página (ver components/portal-rascunho-aviso.tsx). Documentos (File) nunca
// entram aqui — não dá pra serializar.
const RASCUNHO_KEY = "sis_rascunho_administracao";

type RascunhoAdministracao = {
  salvoEm: number;
  lojaId: string;
  clientes: ClienteLinha[];
  imovelId: string;
  tipoImovel: string;
  cep: string;
  rua: string;
  nPredial: string;
  complemento: string;
  bairro: string;
  estadoId: string;
  cidadeId: string;
  matricula: string;
  inscricao: string;
  dataEntrada: string;
  dataAssinatura: string;
  prazoMeses: string;
  valorTransacao: string;
  porcHonorario: string;
  txAdministracao: string;
  valorCliente: string;
  valorAdministracao: string;
  iptu: string;
  temCondominio: boolean;
  condominio: string;
  agua: string;
  ucCaerd: string;
  energia: string;
  ucEnergisa: string;
  temVistoria: boolean;
  arquivoVistoriaUrl: string;
  observacao: string;
  pastaUrl: string;
};

function formatarDataHoraRascunho(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const CAMPO_TRAVADO = "text-xs border border-gray-200 rounded-lg px-3 py-1.5 w-full bg-gray-100 text-gray-500";
const LABEL = "text-xs text-gray-600 block mb-1";

export function PortalAdministracaoForm({
  corretor,
  lojas,
  estados,
  cidades,
  clientesDoCorretor,
  bancos,
  bairrosCadastrados
}: {
  corretor: { id: string; nome: string; creci: string | null; cpf: string | null };
  lojas: { id: string; nome: string }[];
  estados: { id: string; nome: string }[];
  cidades: { id: string; nome: string; estado_id: string }[];
  clientesDoCorretor: ClienteDoCorretor[];
  bancos: Banco[];
  bairrosCadastrados: BairroCadastrado[];
}) {
  const [lojaId, setLojaId] = useState("");
  const [clientes, setClientes] = useState<ClienteLinha[]>([clienteVazio()]);

  const [imovelId, setImovelId] = useState("");
  const [tipoImovel, setTipoImovel] = useState("");
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [nPredial, setNPredial] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [estadoId, setEstadoId] = useState("");
  const [cidadeId, setCidadeId] = useState("");
  const [matricula, setMatricula] = useState("");
  const [inscricao, setInscricao] = useState("");

  const [dataEntrada, setDataEntrada] = useState(hojeISO());
  const [dataAssinatura, setDataAssinatura] = useState("");
  const [prazoMeses, setPrazoMeses] = useState("");
  const [valorTransacao, setValorTransacao] = useState("");
  const [porcHonorario, setPorcHonorario] = useState("");
  const [txAdministracao, setTxAdministracao] = useState("");
  const [valorCliente, setValorCliente] = useState("");
  const [valorAdministracao, setValorAdministracao] = useState("");
  const [iptu, setIptu] = useState("");

  const [temCondominio, setTemCondominio] = useState(false);
  const [condominio, setCondominio] = useState("");
  const [agua, setAgua] = useState("");
  const [ucCaerd, setUcCaerd] = useState("");
  const [energia, setEnergia] = useState("");
  const [ucEnergisa, setUcEnergisa] = useState("");

  const [temVistoria, setTemVistoria] = useState(false);
  const [arquivoVistoriaUrl, setArquivoVistoriaUrl] = useState("");

  const [observacao, setObservacao] = useState("");
  const [pastaUrl, setPastaUrl] = useState("");

  const [documentos, setDocumentos] = useState<File[]>([]);
  const [erroAnexo, setErroAnexo] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [etapaEnvio, setEtapaEnvio] = useState("");
  const [resultado, setResultado] = useState<{ ok: true; idLegado: string | null } | { ok: false; erro: string } | null>(
    null
  );

  const [rascunhoEncontrado, setRascunhoEncontrado] = useState<RascunhoAdministracao | null>(null);
  const [rascunhoSalvoAgora, setRascunhoSalvoAgora] = useState(false);

  // Só detecta e oferece o rascunho ao carregar — nunca aplica sozinho, pra
  // não sobrescrever o que o corretor já digitou nesta mesma visita.
  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(RASCUNHO_KEY);
      if (bruto) setRascunhoEncontrado(JSON.parse(bruto));
    } catch {
      // rascunho corrompido — ignora
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function montarRascunho(): RascunhoAdministracao {
    return {
      salvoEm: Date.now(),
      lojaId,
      clientes,
      imovelId,
      tipoImovel,
      cep,
      rua,
      nPredial,
      complemento,
      bairro,
      estadoId,
      cidadeId,
      matricula,
      inscricao,
      dataEntrada,
      dataAssinatura,
      prazoMeses,
      valorTransacao,
      porcHonorario,
      txAdministracao,
      valorCliente,
      valorAdministracao,
      iptu,
      temCondominio,
      condominio,
      agua,
      ucCaerd,
      energia,
      ucEnergisa,
      temVistoria,
      arquivoVistoriaUrl,
      observacao,
      pastaUrl
    };
  }

  // Auto-save contínuo, só depois que o corretor realmente começou a
  // preencher algo (evita gravar um rascunho vazio a cada visita à tela).
  useEffect(() => {
    const temAlgumDado = clientes.some((c) => c.nome.trim().length > 0) || rua.trim().length > 0;
    if (!temAlgumDado) return;
    try {
      window.localStorage.setItem(RASCUNHO_KEY, JSON.stringify(montarRascunho()));
    } catch {
      // localStorage indisponível — segue sem rascunho
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lojaId,
    clientes,
    imovelId,
    tipoImovel,
    cep,
    rua,
    nPredial,
    complemento,
    bairro,
    estadoId,
    cidadeId,
    matricula,
    inscricao,
    dataEntrada,
    dataAssinatura,
    prazoMeses,
    valorTransacao,
    porcHonorario,
    txAdministracao,
    valorCliente,
    valorAdministracao,
    iptu,
    temCondominio,
    condominio,
    agua,
    ucCaerd,
    energia,
    ucEnergisa,
    temVistoria,
    arquivoVistoriaUrl,
    observacao,
    pastaUrl
  ]);

  function restaurarRascunho() {
    if (!rascunhoEncontrado) return;
    const r = rascunhoEncontrado;
    setLojaId(r.lojaId);
    setClientes(r.clientes.length > 0 ? r.clientes : [clienteVazio()]);
    setImovelId(r.imovelId);
    setTipoImovel(r.tipoImovel);
    setCep(r.cep ?? "");
    setRua(r.rua);
    setNPredial(r.nPredial);
    setComplemento(r.complemento);
    setBairro(r.bairro);
    setEstadoId(r.estadoId);
    setCidadeId(r.cidadeId);
    setMatricula(r.matricula);
    setInscricao(r.inscricao);
    setDataEntrada(r.dataEntrada);
    setDataAssinatura(r.dataAssinatura);
    setPrazoMeses(r.prazoMeses);
    setValorTransacao(r.valorTransacao);
    setPorcHonorario(r.porcHonorario);
    setTxAdministracao(r.txAdministracao);
    setValorCliente(r.valorCliente);
    setValorAdministracao(r.valorAdministracao);
    setIptu(r.iptu);
    setTemCondominio(r.temCondominio);
    setCondominio(r.condominio);
    setAgua(r.agua);
    setUcCaerd(r.ucCaerd);
    setEnergia(r.energia);
    setUcEnergisa(r.ucEnergisa);
    setTemVistoria(r.temVistoria);
    setArquivoVistoriaUrl(r.arquivoVistoriaUrl);
    setObservacao(r.observacao);
    setPastaUrl(r.pastaUrl);
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

  const cidadesDoEstado = useMemo(() => cidades.filter((c) => c.estado_id === estadoId), [cidades, estadoId]);

  // Sugestão de bairro por cidade (estilo EnumList do AppSheet) — a mesma
  // lista sincronizada usada em todos os cadastros de imóvel do sistema (ver
  // components/imovel-form.tsx), pra manter o nome do bairro consistente
  // entre o admin e o portal do corretor.
  const bairrosDaCidade = useMemo(() => {
    const set = new Set(
      bairrosCadastrados
        .filter((b) => b.cidade_id === cidadeId && b.bairro && b.bairro.trim())
        .map((b) => b.bairro!.trim())
    );
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [bairrosCadastrados, cidadeId]);

  // Imóveis oferecidos pra reaproveitar vêm sempre do cliente PRINCIPAL (o
  // primeiro da lista, o que fica vinculado direto em adm_imoveis.cliente_id)
  // — é o dono natural do imóvel objeto da administração.
  const clientePrincipal = clientes[0];
  const clienteExistentePrincipal = clientePrincipal?.clienteId
    ? clientesDoCorretor.find((c) => c.id === clientePrincipal.clienteId)
    : undefined;
  const imoveisDoClientePrincipal = clienteExistentePrincipal?.imoveis ?? [];

  // Busca automática de CEP (ViaCEP) pro imóvel — mesmo comportamento já
  // usado em components/portal-compra-venda-form.tsx e
  // components/portal-locacao-form.tsx.
  async function buscarEnderecoImovelPorCep() {
    const encontrado = await buscarCep(cep);
    if (!encontrado) return;

    const nomeEstado = UF_PARA_ESTADO[encontrado.uf] ?? "";
    const estadoEncontrado = estados.find((e) => e.nome.toLowerCase() === nomeEstado.toLowerCase());
    const cidadeEncontrada = estadoEncontrado
      ? cidades.find(
          (cid) => cid.estado_id === estadoEncontrado.id && cid.nome.toLowerCase() === encontrado.localidade.toLowerCase()
        )
      : undefined;

    setRua(encontrado.logradouro || rua);
    setBairro(encontrado.bairro || bairro);
    setEstadoId(estadoEncontrado?.id ?? estadoId);
    setCidadeId(cidadeEncontrada?.id ?? "");
  }

  function atualizarCliente(index: number, campo: keyof ClienteLinha, valor: string) {
    setClientes((atual) => atual.map((c, i) => (i === index ? { ...c, [campo]: valor } : c)));
  }

  // Código do banco vem automaticamente ao escolher o Banco — mesmo
  // comportamento do cadastro administrativo (ver components/cliente-form.tsx).
  function selecionarBanco(index: number, bancoId: string) {
    const banco = bancos.find((b) => b.id === bancoId);
    setClientes((atual) =>
      atual.map((c, i) => (i === index ? { ...c, bancoId, codigoBanco: banco?.codigo ?? c.codigoBanco } : c))
    );
  }

  // Busca automática de CEP (ViaCEP) — mesmo comportamento do cadastro
  // administrativo (ver components/cliente-form.tsx), aplicado por linha.
  async function buscarEnderecoClientePorCep(index: number) {
    const cepDigitado = clientes[index]?.cep ?? "";
    const encontrado = await buscarCep(cepDigitado);
    if (!encontrado) return;

    const nomeEstado = UF_PARA_ESTADO[encontrado.uf] ?? "";
    const estadoEncontrado = estados.find((e) => e.nome.toLowerCase() === nomeEstado.toLowerCase());
    const cidadeEncontrada = estadoEncontrado
      ? cidades.find(
          (cid) => cid.estado_id === estadoEncontrado.id && cid.nome.toLowerCase() === encontrado.localidade.toLowerCase()
        )
      : undefined;

    setClientes((atual) =>
      atual.map((c, i) =>
        i === index
          ? {
              ...c,
              rua: encontrado.logradouro || c.rua,
              bairro: encontrado.bairro || c.bairro,
              estadoId: estadoEncontrado?.id ?? c.estadoId,
              cidadeId: cidadeEncontrada?.id ?? ""
            }
          : c
      )
    );
  }

  // Ao escolher um cliente já cadastrado, preenche tudo com o que já está no
  // banco e trava os campos — o corretor não edita cadastro existente por
  // aqui, só usa. Escolhendo "+ Novo cliente" de volta, limpa a linha.
  function selecionarClienteExistente(index: number, clienteId: string) {
    if (!clienteId) {
      setClientes((atual) => atual.map((c, i) => (i === index ? clienteVazio() : c)));
      return;
    }
    const encontrado = clientesDoCorretor.find((c) => c.id === clienteId);
    if (!encontrado) return;
    setClientes((atual) =>
      atual.map((c, i) =>
        i === index
          ? {
              clienteId: encontrado.id,
              tipoCliente: "",
              nome: encontrado.nome,
              rg: encontrado.rg,
              cpfCnpj: encontrado.cpfCnpj,
              sexo: "",
              endereco: encontrado.endereco,
              cep: "",
              rua: "",
              nPredial: "",
              complemento: "",
              bairro: "",
              estadoId: "",
              cidadeId: "",
              nomeMae: "",
              nomePai: "",
              nacionalidade: encontrado.nacionalidade,
              estadoCivil: encontrado.estadoCivil,
              uniaoEstavel: "",
              profissao: "",
              email: encontrado.email,
              telefone: encontrado.telefone,
              bancoId: "",
              codigoBanco: "",
              agencia: "",
              conta: "",
              tipoConta: "",
              tipoPix: "",
              pix: ""
            }
          : c
      )
    );
    // Trocar o cliente principal invalida o imóvel que tinha sido
    // selecionado antes (era de outro cliente).
    if (index === 0 && imovelId) {
      limparImovel();
    }
  }

  function adicionarCliente() {
    setClientes((atual) => [...atual, clienteVazio()]);
  }

  function removerCliente(index: number) {
    setClientes((atual) => atual.filter((_, i) => i !== index));
    if (index === 0 && imovelId) {
      limparImovel();
    }
  }

  function limparImovel() {
    setImovelId("");
    setTipoImovel("");
    setRua("");
    setNPredial("");
    setComplemento("");
    setBairro("");
    setEstadoId("");
    setCidadeId("");
    setMatricula("");
    setInscricao("");
  }

  // Ao escolher um imóvel já cadastrado (do cliente principal), preenche e
  // trava os campos do imóvel — mesma lógica do cliente: só reaproveita, não
  // edita o cadastro existente.
  function selecionarImovelExistente(id: string) {
    if (!id) {
      limparImovel();
      return;
    }
    const im = imoveisDoClientePrincipal.find((i) => i.id === id);
    if (!im) return;
    setImovelId(im.id);
    setTipoImovel(im.tipoImovel);
    setRua(im.rua);
    setNPredial(im.nPredial);
    setComplemento(im.complemento);
    setBairro(im.bairro);
    setEstadoId(im.estadoId);
    setCidadeId(im.cidadeId);
    setMatricula(im.matricula);
    setInscricao(im.inscricao);
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

  async function handleCadastrar() {
    setEnviando(true);
    setEtapaEnvio("");
    setResultado(null);
    try {
      const documentosEnviados: { caminho: string; nomeOriginal: string }[] = [];
      for (let i = 0; i < documentos.length; i++) {
        const arquivo = documentos[i];
        setEtapaEnvio(`Enviando documento ${i + 1} de ${documentos.length}...`);
        const preparo = await prepararUploadDocumentoAction(arquivo.name);
        if (!preparo.ok) {
          throw new Error(`Falha ao preparar envio de "${arquivo.name}": ${preparo.erro}`);
        }
        const { error: erroUpload } = await supabaseBrowser()
          .storage.from(BUCKET_DOCUMENTOS_PORTAL)
          .uploadToSignedUrl(preparo.caminho, preparo.token, arquivo, { contentType: arquivo.type });
        if (erroUpload) {
          throw new Error(`Falha ao enviar "${arquivo.name}": ${erroUpload.message}`);
        }
        documentosEnviados.push({ caminho: preparo.caminho, nomeOriginal: arquivo.name });
      }
      setEtapaEnvio("Cadastrando...");

      const formData = new FormData();
      formData.set("clientesJson", JSON.stringify(clientes));
      formData.set("loja_id", lojaId);
      formData.set("imovel_id", imovelId);
      formData.set("tipo_imovel", tipoImovel);
      formData.set("cep", cep);
      formData.set("rua", rua);
      formData.set("n_predial", nPredial);
      formData.set("complemento", complemento);
      formData.set("bairro", bairro);
      formData.set("estado_id", estadoId);
      formData.set("cidade_id", cidadeId);
      formData.set("matricula", matricula);
      formData.set("inscricao", inscricao);
      formData.set("data_entrada", dataEntrada);
      formData.set("data_assinatura", dataAssinatura);
      formData.set("prazo_contrato_meses", prazoMeses);
      formData.set("valor_transacao", valorTransacao);
      formData.set("porc_honorario", porcHonorario);
      formData.set("tx_administracao", txAdministracao);
      formData.set("valor_cliente", valorCliente);
      formData.set("valor_administracao", valorAdministracao);
      formData.set("iptu", iptu);
      if (temCondominio) formData.set("tem_condominio", "true");
      formData.set("condominio", condominio);
      formData.set("agua", agua);
      formData.set("uc_caerd", ucCaerd);
      formData.set("energia", energia);
      formData.set("uc_energisa", ucEnergisa);
      if (temVistoria) formData.set("tem_vistoria", "true");
      formData.set("arquivo_vistoria_url", arquivoVistoriaUrl);
      formData.set("observacao", observacao);
      formData.set("pasta_url", pastaUrl);
      formData.set("documentosJson", JSON.stringify(documentosEnviados));

      const r = await cadastrarAdministracaoAction(formData);
      setResultado(r);
      if (r.ok) {
        try {
          window.localStorage.removeItem(RASCUNHO_KEY);
        } catch {
          // ignora
        }
      }
    } catch (erro) {
      // Sem isso, qualquer erro que escape do try acima desaparecia sem
      // avisar nada na tela.
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

  // Tipo de cliente, Nome, CPF/CNPJ, Sexo (PF) e Telefone obrigatórios em
  // todo cliente novo digitado aqui — pedido do usuário (09/08/2026,
  // "alinhamento do cadastro de cliente"). Ver mesmo comentário em
  // components/portal-gestao-form.tsx.
  const erroCadastroCliente = useMemo(() => {
    for (const c of clientes) {
      if (c.clienteId) continue;
      if (!c.nome.trim()) continue;
      if (!c.tipoCliente) return "Selecione o tipo de cliente (Pessoa Física/Jurídica) de todos os clientes.";
      if (!c.cpfCnpj.trim()) return `Informe o ${c.tipoCliente === "Pessoa Jurídica" ? "CNPJ" : "CPF"} de ${c.nome}.`;
      if (c.tipoCliente !== "Pessoa Jurídica" && !c.sexo) return `Informe o sexo de ${c.nome}.`;
      if (!c.telefone.trim()) return `Informe o telefone de ${c.nome}.`;
    }
    return null;
  }, [clientes]);

  const podeCadastrar =
    Boolean(lojaId) &&
    clientes.some((c) => c.nome.trim().length > 0) &&
    !erroCadastroCliente &&
    Boolean(tipoImovel) &&
    rua.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      {rascunhoEncontrado && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex-wrap">
          <span className="text-xs text-amber-800">
            Você tem um rascunho salvo neste navegador em{" "}
            <strong>{formatarDataHoraRascunho(rascunhoEncontrado.salvoEm)}</strong>.
            {" "}(anexos de documento não ficam salvos — se tinha algum, precisa adicionar de novo).
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={restaurarRascunho}
              className="text-xs font-semibold text-amber-700 hover:opacity-80"
            >
              Continuar rascunho
            </button>
            <button type="button" onClick={descartarRascunho} className="text-xs text-gray-400 hover:text-red-600">
              descartar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">1. Loja</div>
        <select className={CAMPO} value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
          <option value="" disabled>
            Selecione...
          </option>
          {lojas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">2. Cliente(s) — proprietário(s)</div>
        <p className="text-[11px] text-gray-400 mb-3">
          Pode ter mais de um proprietário (ex.: casal, herdeiros) — todos entram na qualificação e assinatura do
          contrato. Se o cliente já tem cadastro, escolha ele na lista em vez de digitar de novo (evita duplicar).
        </p>

        <div className="flex flex-col gap-4">
          {clientes.map((c, index) => (
            <div key={index} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">
                  {index === 0 ? "Proprietário principal" : `Proprietário adicional ${index + 1}`}
                </span>
                {clientes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removerCliente(index)}
                    className="text-[11px] text-gray-400 hover:text-red-600"
                  >
                    remover
                  </button>
                )}
              </div>

              {clientesDoCorretor.length > 0 && (
                <div className="mb-3">
                  <label className={LABEL}>Cliente já cadastrado (opcional)</label>
                  <select
                    className={CAMPO}
                    value={c.clienteId ?? ""}
                    onChange={(e) => selecionarClienteExistente(index, e.target.value)}
                  >
                    <option value="">+ Novo cliente</option>
                    {clientesDoCorretor.map((cc) => (
                      <option key={cc.id} value={cc.id}>
                        {cc.nome}
                        {cc.cpfCnpj ? ` — ${cc.cpfCnpj}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {c.clienteId ? (
                <div className="text-xs text-gray-700 font-medium">
                  {c.nome}
                  {c.cpfCnpj && <span className="text-gray-400 font-normal"> — {c.cpfCnpj}</span>}
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Tipo de cliente *</label>
                    <select
                      className={CAMPO}
                      value={c.tipoCliente}
                      onChange={(e) => atualizarCliente(index, "tipoCliente", e.target.value)}
                    >
                      <option value="" disabled>
                        Selecione...
                      </option>
                      {TIPOS_CLIENTE.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>{c.tipoCliente === "Pessoa Jurídica" ? "Razão social *" : "Nome completo *"}</label>
                    <input className={CAMPO} value={c.nome} onChange={(e) => atualizarCliente(index, "nome", e.target.value)} />
                  </div>
                  {c.tipoCliente !== "Pessoa Jurídica" && (
                    <div>
                      <label className={LABEL}>RG</label>
                      <input className={CAMPO} value={c.rg} onChange={(e) => atualizarCliente(index, "rg", e.target.value)} />
                    </div>
                  )}
                  <div>
                    <label className={LABEL}>{c.tipoCliente === "Pessoa Jurídica" ? "CNPJ *" : "CPF *"}</label>
                    <input
                      className={CAMPO}
                      value={c.cpfCnpj}
                      onChange={(e) => atualizarCliente(index, "cpfCnpj", e.target.value)}
                      onBlur={(e) => {
                        const erro = e.target.value ? validarCpfCnpj(e.target.value) : null;
                        if (erro) alert(erro);
                      }}
                    />
                  </div>
                  {c.tipoCliente === "Pessoa Jurídica" ? (
                    <div className="md:col-span-2">
                      <label className={LABEL}>Sede (endereço completo)</label>
                      <input className={CAMPO} value={c.endereco} onChange={(e) => atualizarCliente(index, "endereco", e.target.value)} />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className={LABEL}>CEP</label>
                        <input
                          className={CAMPO}
                          value={c.cep}
                          onChange={(e) => atualizarCliente(index, "cep", e.target.value)}
                          onBlur={() => buscarEnderecoClientePorCep(index)}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Logradouro</label>
                        <input className={CAMPO} value={c.rua} onChange={(e) => atualizarCliente(index, "rua", e.target.value)} />
                      </div>
                      <div>
                        <label className={LABEL}>Número predial</label>
                        <input
                          className={CAMPO}
                          value={c.nPredial}
                          onChange={(e) => atualizarCliente(index, "nPredial", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Complemento</label>
                        <input
                          className={CAMPO}
                          value={c.complemento}
                          onChange={(e) => atualizarCliente(index, "complemento", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Bairro</label>
                        <input className={CAMPO} value={c.bairro} onChange={(e) => atualizarCliente(index, "bairro", e.target.value)} />
                      </div>
                      <div>
                        <label className={LABEL}>Estado</label>
                        <select
                          className={CAMPO}
                          value={c.estadoId}
                          onChange={(e) => {
                            atualizarCliente(index, "estadoId", e.target.value);
                            atualizarCliente(index, "cidadeId", "");
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
                        <label className={LABEL}>Cidade</label>
                        <select
                          className={CAMPO}
                          value={c.cidadeId}
                          onChange={(e) => atualizarCliente(index, "cidadeId", e.target.value)}
                        >
                          <option value="">—</option>
                          {cidades
                            .filter((cid) => cid.estado_id === c.estadoId)
                            .map((cid) => (
                              <option key={cid.id} value={cid.id}>
                                {cid.nome}
                              </option>
                            ))}
                        </select>
                      </div>
                    </>
                  )}
                  {c.tipoCliente !== "Pessoa Jurídica" && (
                    <>
                      <div>
                        <label className={LABEL}>Sexo *</label>
                        <select
                          className={CAMPO}
                          value={c.sexo}
                          onChange={(e) => atualizarCliente(index, "sexo", e.target.value)}
                        >
                          <option value="">Selecione...</option>
                          {SEXO_OPCOES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>Nome da mãe</label>
                        <input className={CAMPO} value={c.nomeMae} onChange={(e) => atualizarCliente(index, "nomeMae", e.target.value)} />
                      </div>
                      <div>
                        <label className={LABEL}>Nome do pai</label>
                        <input className={CAMPO} value={c.nomePai} onChange={(e) => atualizarCliente(index, "nomePai", e.target.value)} />
                      </div>
                      <div>
                        <label className={LABEL}>Nacionalidade</label>
                        <input
                          className={CAMPO}
                          value={c.nacionalidade}
                          onChange={(e) => atualizarCliente(index, "nacionalidade", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Estado civil</label>
                        <select
                          className={CAMPO}
                          value={c.estadoCivil}
                          onChange={(e) => {
                            atualizarCliente(index, "estadoCivil", e.target.value);
                            if (!ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(e.target.value)) atualizarCliente(index, "uniaoEstavel", "");
                          }}
                        >
                          <option value="">—</option>
                          {ESTADOS_CIVIS.map((op) => (
                            <option key={op} value={op}>
                              {op}
                            </option>
                          ))}
                        </select>
                      </div>
                      {ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(c.estadoCivil) && (
                        <div>
                          <label className={LABEL}>Convive em união estável?</label>
                          <select
                            className={CAMPO}
                            value={c.uniaoEstavel}
                            onChange={(e) => atualizarCliente(index, "uniaoEstavel", e.target.value)}
                          >
                            <option value="">Não perguntado ainda</option>
                            <option value="false">Não</option>
                            <option value="true">Sim</option>
                          </select>
                        </div>
                      )}
                      <div>
                        <label className={LABEL}>Profissão</label>
                        <input
                          className={CAMPO}
                          value={c.profissao}
                          onChange={(e) => atualizarCliente(index, "profissao", e.target.value)}
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className={LABEL}>Email</label>
                    <input className={CAMPO} value={c.email} onChange={(e) => atualizarCliente(index, "email", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>Telefone *</label>
                    <input className={CAMPO} value={c.telefone} onChange={(e) => atualizarCliente(index, "telefone", e.target.value)} />
                  </div>
                </div>
              )}

              {!c.clienteId && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-[11px] font-semibold text-gray-500 mb-2">Dados bancários</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Banco</label>
                    <select
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      disabled={Boolean(c.clienteId)}
                      value={c.bancoId}
                      onChange={(e) => selecionarBanco(index, e.target.value)}
                    >
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
                    <input
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      readOnly={Boolean(c.clienteId)}
                      value={c.codigoBanco}
                      onChange={(e) => atualizarCliente(index, "codigoBanco", e.target.value)}
                      placeholder="Preenchido ao escolher o banco"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Agência</label>
                    <input
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      readOnly={Boolean(c.clienteId)}
                      value={c.agencia}
                      onChange={(e) => atualizarCliente(index, "agencia", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Conta</label>
                    <input
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      readOnly={Boolean(c.clienteId)}
                      value={c.conta}
                      onChange={(e) => atualizarCliente(index, "conta", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Tipo de conta</label>
                    <select
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      disabled={Boolean(c.clienteId)}
                      value={c.tipoConta}
                      onChange={(e) => atualizarCliente(index, "tipoConta", e.target.value)}
                    >
                      <option value="">—</option>
                      {TIPOS_CONTA.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Tipo de PIX</label>
                    <select
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      disabled={Boolean(c.clienteId)}
                      value={c.tipoPix}
                      onChange={(e) => atualizarCliente(index, "tipoPix", e.target.value)}
                    >
                      <option value="">—</option>
                      {TIPOS_PIX.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={LABEL}>Chave PIX</label>
                    <input
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      readOnly={Boolean(c.clienteId)}
                      value={c.pix}
                      onChange={(e) => atualizarCliente(index, "pix", e.target.value)}
                    />
                  </div>
                </div>
              </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={adicionarCliente}
          className="text-xs text-primary font-semibold mt-3 hover:opacity-80"
        >
          + Adicionar outro proprietário
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">3. Imóvel</div>

        {imoveisDoClientePrincipal.length > 0 && (
          <div className="mb-3">
            <label className={LABEL}>Imóvel já cadastrado deste cliente (opcional)</label>
            <select className={CAMPO} value={imovelId} onChange={(e) => selecionarImovelExistente(e.target.value)}>
              <option value="">+ Novo imóvel</option>
              {imoveisDoClientePrincipal.map((im) => (
                <option key={im.id} value={im.id}>
                  {im.endereco || `${im.rua}, ${im.nPredial}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Tipo de imóvel</label>
            <select
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              disabled={Boolean(imovelId)}
              value={tipoImovel}
              onChange={(e) => setTipoImovel(e.target.value)}
            >
              <option value="">—</option>
              {TIPOS_IMOVEL.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>CEP</label>
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              onBlur={buscarEnderecoImovelPorCep}
              placeholder="00000-000"
            />
          </div>
          <div>
            <label className={LABEL}>Rua</label>
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={rua}
              onChange={(e) => setRua(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Número</label>
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={nPredial}
              onChange={(e) => setNPredial(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Complemento</label>
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={complemento}
              onChange={(e) => setComplemento(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Bairro</label>
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
              list="lista-bairros"
            />
            <datalist id="lista-bairros">
              {bairrosDaCidade.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={LABEL}>Estado</label>
            <select
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              disabled={Boolean(imovelId)}
              value={estadoId}
              onChange={(e) => {
                setEstadoId(e.target.value);
                setCidadeId("");
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
            <label className={LABEL}>Cidade</label>
            <select
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              disabled={Boolean(imovelId)}
              value={cidadeId}
              onChange={(e) => setCidadeId(e.target.value)}
            >
              <option value="">—</option>
              {cidadesDoEstado.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Matrícula</label>
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Inscrição</label>
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={inscricao}
              onChange={(e) => setInscricao(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">4. Datas e prazo</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Data de entrada</label>
            <input type="date" className={CAMPO} value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Data de assinatura</label>
            <input
              type="date"
              className={CAMPO}
              value={dataAssinatura}
              onChange={(e) => setDataAssinatura(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Prazo do contrato (meses)</label>
            <input className={CAMPO} value={prazoMeses} onChange={(e) => setPrazoMeses(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">5. Valores</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Valor do aluguel (R$)</label>
            <input
              className={CAMPO}
              placeholder="1.500,00"
              value={valorTransacao}
              onChange={(e) => setValorTransacao(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Honorário na intermediação (%)</label>
            <input
              className={CAMPO}
              placeholder="100"
              value={porcHonorario}
              onChange={(e) => setPorcHonorario(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Taxa de administração (%)</label>
            <input
              className={CAMPO}
              placeholder="10"
              value={txAdministracao}
              onChange={(e) => setTxAdministracao(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Valor líquido do cliente (R$)</label>
            <input
              className={CAMPO}
              placeholder="1.350,00"
              value={valorCliente}
              onChange={(e) => setValorCliente(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Valor da administração (R$)</label>
            <input
              className={CAMPO}
              placeholder="150,00"
              value={valorAdministracao}
              onChange={(e) => setValorAdministracao(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>IPTU (R$)</label>
            <input className={CAMPO} placeholder="80,00" value={iptu} onChange={(e) => setIptu(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">6. Condomínio, água e energia</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tem_condominio"
              checked={temCondominio}
              onChange={(e) => setTemCondominio(e.target.checked)}
            />
            <label htmlFor="tem_condominio" className="text-xs text-gray-600">
              Tem condomínio
            </label>
          </div>
          <div>
            <label className={LABEL}>Valor do condomínio (R$)</label>
            <input className={CAMPO} placeholder="300,00" value={condominio} onChange={(e) => setCondominio(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Água</label>
            <select className={CAMPO} value={agua} onChange={(e) => setAgua(e.target.value)}>
              <option value="">—</option>
              {AGUA_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>UC Caerd</label>
            <input className={CAMPO} value={ucCaerd} onChange={(e) => setUcCaerd(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Energia</label>
            <select className={CAMPO} value={energia} onChange={(e) => setEnergia(e.target.value)}>
              <option value="">—</option>
              {ENERGIA_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>UC Energisa</label>
            <input className={CAMPO} value={ucEnergisa} onChange={(e) => setUcEnergisa(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">7. Vistoria</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tem_vistoria"
              checked={temVistoria}
              onChange={(e) => setTemVistoria(e.target.checked)}
            />
            <label htmlFor="tem_vistoria" className="text-xs text-gray-600">
              Tem vistoria
            </label>
          </div>
          <CampoLink
            label="Arquivo da vistoria (link)"
            value={arquivoVistoriaUrl}
            onChange={setArquivoVistoriaUrl}
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">8. Observação e pasta</div>
        <div className="grid md:grid-cols-2 gap-3">
          <CampoLink label="Pasta (link)" value={pastaUrl} onChange={setPastaUrl} />
        </div>
        <div className="mt-3">
          <label className={LABEL}>Observação</label>
          <textarea
            className={CAMPO + " min-h-24"}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">9. Documentação</div>
        <p className="text-[11px] text-gray-400 mb-3">
          PDF ou imagem (matrícula do imóvel, RG dos proprietários, print da vistoria etc.). Vai direto por email pro
          administrativo junto com o resumo da administração — não fica guardado no sistema. Total até{" "}
          {formatarTamanho(TAMANHO_MAXIMO_TOTAL)}.
        </p>

        {documentos.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-3">
            {documentos.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
              >
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

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">10. Corretor (captador)</div>
        <div className="grid md:grid-cols-2 gap-3 text-xs text-gray-700">
          <div>
            <span className="text-gray-400">Corretor: </span>
            {corretor.nome}
          </div>
          <div>
            <span className="text-gray-400">CRECI: </span>
            {corretor.creci ?? "não cadastrado"}
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Preenchido automaticamente com o seu cadastro — é o parceiro captador desta administração.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={!podeCadastrar || enviando}
          onClick={handleCadastrar}
          className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40 hover:opacity-90"
        >
          {enviando ? etapaEnvio || "Cadastrando..." : "Cadastrar administração"}
        </button>
        <button
          type="button"
          onClick={salvarRascunhoManual}
          className="text-xs text-gray-500 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50"
        >
          Salvar rascunho
        </button>
        {rascunhoSalvoAgora && <span className="text-xs text-green-700">Rascunho salvo.</span>}
        {erroCadastroCliente && <span className="text-xs text-red-600">{erroCadastroCliente}</span>}
        {resultado?.ok && (
          <span className="text-xs text-green-700 font-semibold">
            Administração {resultado.idLegado} cadastrada com sucesso. O administrativo vai dar sequência.
          </span>
        )}
        {resultado && !resultado.ok && <span className="text-xs text-red-600">{resultado.erro}</span>}
      </div>
    </div>
  );
}
