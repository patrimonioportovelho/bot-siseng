import { formatCpf, formatCnpj, formatValorEditavel } from "@/lib/format";
import { clienteVazio, type ClienteAvaliacao } from "@/lib/financiamento/avaliacao-credito";

// Linha de `clientes` -> campos do formulário do portal (já preenchido).
export function clienteParaFormulario(c: {
  id: string;
  nome: string;
  tipo_cliente: string | null;
  sexo: string | null;
  cpf: string | null;
  cnpj: string | null;
  rg: string | null;
  expedicao: string | null;
  telefone: string | null;
  email: string | null;
  nome_mae: string | null;
  nome_pai: string | null;
  estado_civil: string | null;
  uniao_estavel: boolean | null;
  data_nascimento: Date | null;
  cat_profissao: string | null;
  tipo_servidor: string | null;
  profissao: string | null;
  renda_bruta: unknown;
  cep: string | null;
  rua: string | null;
  n_predial: string | null;
  complemento: string | null;
  bairro: string | null;
  estado_id: string | null;
  cidade_id: string | null;
  observacao: string | null;
  banco_id: string | null;
  codigo_banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  tipo_pix: string | null;
  pix: string | null;
}): ClienteAvaliacao {
  const base = clienteVazio();
  const pj = c.tipo_cliente === "Pessoa Jurídica" || (!c.cpf && !!c.cnpj);
  return {
    ...base,
    clienteId: c.id,
    tipoCliente: pj ? "Pessoa Jurídica" : "Pessoa Física",
    nome: c.nome,
    sexo: c.sexo ?? "",
    cpf: c.cpf ? formatCpf(c.cpf) : "",
    cnpj: c.cnpj ? formatCnpj(c.cnpj) : "",
    rg: c.rg ?? "",
    expedicao: c.expedicao ?? "",
    telefone: c.telefone ?? "",
    email: c.email ?? "",
    nomeMae: c.nome_mae ?? "",
    nomePai: c.nome_pai ?? "",
    estadoCivil: c.estado_civil ?? "",
    uniaoEstavel: c.uniao_estavel === true ? "true" : c.uniao_estavel === false ? "false" : "",
    dataNascimento: c.data_nascimento ? c.data_nascimento.toISOString().slice(0, 10) : "",
    catProfissao: c.cat_profissao ?? "",
    tipoServidor: c.tipo_servidor ?? "",
    profissao: c.profissao ?? "",
    rendaBruta: c.renda_bruta != null ? formatValorEditavel(c.renda_bruta) : "",
    cep: c.cep ?? "",
    rua: c.rua ?? "",
    nPredial: c.n_predial ?? "",
    complemento: c.complemento ?? "",
    bairro: c.bairro ?? "",
    estadoId: c.estado_id ?? "",
    cidadeId: c.cidade_id ?? "",
    observacao: c.observacao ?? "",
    bancoId: c.banco_id ?? "",
    codigoBanco: c.codigo_banco ?? "",
    agencia: c.agencia ?? "",
    conta: c.conta ?? "",
    tipoConta: c.tipo_conta ?? "",
    tipoPix: c.tipo_pix ?? "",
    pix: c.pix ?? ""
  };
}
