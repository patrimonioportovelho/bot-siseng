import { ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL } from "@/lib/clientes/opcoes";

// Avaliação de crédito pelo portal do corretor (30/10/2026): além da Consulta
// de CPF de sempre, o corretor pode abrir direto uma Avaliação de crédito —
// cadastro completo do cliente + 3 perguntas de múltipla escolha. As respostas
// ficam em avaliacoes.credito_* (true = primeira opção, false = segunda,
// null = não respondido) e aparecem/editam na ficha e na etiqueta.
export type CampoCredito = "credito_fgts_3_anos" | "credito_mais_compradores" | "credito_primeiro_imovel";

export const PERGUNTAS_CREDITO: {
  campo: CampoCredito;
  /** nome curto no formulário do portal / chave do JSON */
  chave: "fgts3Anos" | "maisCompradores" | "primeiroImovel";
  rotulo: string;
  pergunta: string;
  sim: string;
  nao: string;
}[] = [
  {
    campo: "credito_fgts_3_anos",
    chave: "fgts3Anos",
    rotulo: "FGTS (3 anos)",
    pergunta: "Cliente tem, somando todos os empregos, pelo menos 3 anos de trabalho com depósito de FGTS?",
    sim: "Sim, tem 3 anos ou mais",
    nao: "Não, tem menos de 3 anos"
  },
  {
    campo: "credito_mais_compradores",
    chave: "maisCompradores",
    rotulo: "Compradores / dependentes",
    pergunta: "Possui mais de um comprador e/ou dependente na proposta?",
    sim: "Sim, tem!",
    nao: "Não, somente o proponente."
  },
  {
    campo: "credito_primeiro_imovel",
    chave: "primeiroImovel",
    rotulo: "Primeiro imóvel",
    pergunta: "É o primeiro imóvel do cliente ?",
    sim: "Sim, é o primeiro",
    nao: "Não, tem imóveis registrado no nome."
  }
];

export const CAMPOS_CREDITO: CampoCredito[] = PERGUNTAS_CREDITO.map((p) => p.campo);

/** "" (sem resposta), "sim" ou "nao" — formato usado nos formulários. */
export type RespostaCredito = "" | "sim" | "nao";
export type RespostasCredito = Record<"fgts3Anos" | "maisCompradores" | "primeiroImovel", RespostaCredito>;

export function respostasVazias(): RespostasCredito {
  return { fgts3Anos: "", maisCompradores: "", primeiroImovel: "" };
}

export function respostaParaBooleano(r: string | null | undefined): boolean | null {
  if (r === "sim") return true;
  if (r === "nao") return false;
  return null;
}

export function booleanoParaResposta(v: boolean | null | undefined): RespostaCredito {
  if (v === true) return "sim";
  if (v === false) return "nao";
  return "";
}

export function textoDaResposta(campo: CampoCredito, valor: boolean | null | undefined): string | null {
  const p = PERGUNTAS_CREDITO.find((x) => x.campo === campo)!;
  if (valor === true) return p.sim;
  if (valor === false) return p.nao;
  return null;
}

export function respostasIncompletas(r: RespostasCredito): boolean {
  return PERGUNTAS_CREDITO.some((p) => !r[p.chave]);
}

// Campos de identificação e contato exigidos na Avaliação de crédito (o resto —
// complemento, profissional, bancário e observação — continua opcional).
export type DadosClienteCredito = {
  tipoCliente: string;
  nome: string;
  cpf: string;
  cnpj: string;
  rg: string;
  expedicao: string;
  sexo: string;
  nomeMae: string;
  nomePai: string;
  estadoCivil: string;
  uniaoEstavel: string;
  dataNascimento: string;
  telefone: string;
  email: string;
  cep: string;
  rua: string;
  nPredial: string;
  bairro: string;
  estadoId: string;
  cidadeId: string;
};

// Lista (em português, pronta pra mostrar) do que falta preencher.
export function camposFaltandoCredito(c: DadosClienteCredito): string[] {
  const falta: string[] = [];
  const pj = c.tipoCliente === "Pessoa Jurídica";
  const exige = (valor: string, rotulo: string) => {
    if (!valor.trim()) falta.push(rotulo);
  };

  exige(c.nome, pj ? "Razão social" : "Nome completo");
  if (pj) {
    exige(c.cnpj, "CNPJ");
  } else {
    exige(c.cpf, "CPF");
    exige(c.rg, "RG");
    exige(c.expedicao, "Estado de expedição");
    exige(c.sexo, "Sexo");
    exige(c.nomeMae, "Nome da mãe");
    exige(c.nomePai, "Nome do pai");
    exige(c.estadoCivil, "Estado civil");
    if (ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(c.estadoCivil)) exige(c.uniaoEstavel, "União estável (sim/não)");
    exige(c.dataNascimento, "Data de nascimento");
  }
  exige(c.telefone, "Telefone");
  exige(c.email, "E-mail");
  exige(c.cep, "CEP");
  exige(c.rua, "Logradouro");
  exige(c.nPredial, "Número predial");
  exige(c.bairro, "Bairro");
  exige(c.estadoId, "Estado");
  exige(c.cidadeId, "Cidade");
  return falta;
}

// Cadastro do cliente no formulário do portal (Consulta de CPF e Avaliação de
// crédito). Fica aqui para o servidor também montar o formulário já preenchido
// quando o corretor converte uma Consulta de CPF em Avaliação de crédito.
export type ClienteAvaliacao = DadosClienteCredito & {
  clienteId?: string;
  endereco: string;
  complemento: string;
  catProfissao: string;
  tipoServidor: string;
  profissao: string;
  rendaBruta: string;
  observacao: string;
  bancoId: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  tipoPix: string;
  pix: string;
};

export function clienteVazio(): ClienteAvaliacao {
  return {
    tipoCliente: "Pessoa Física",
    nome: "",
    sexo: "",
    cpf: "",
    cnpj: "",
    rg: "",
    expedicao: "",
    telefone: "",
    email: "",
    nomeMae: "",
    nomePai: "",
    estadoCivil: "",
    uniaoEstavel: "",
    dataNascimento: "",
    catProfissao: "",
    tipoServidor: "",
    profissao: "",
    rendaBruta: "",
    endereco: "",
    cep: "",
    rua: "",
    nPredial: "",
    complemento: "",
    bairro: "",
    estadoId: "",
    cidadeId: "",
    observacao: "",
    bancoId: "",
    codigoBanco: "",
    agencia: "",
    conta: "",
    tipoConta: "",
    tipoPix: "",
    pix: ""
  };
}
