import { valorEditavelParaDecimal } from "@/lib/format";
import { montarEnderecoPF } from "@/lib/clientes/endereco";
import type { ClienteAvaliacao } from "@/lib/financiamento/avaliacao-credito";

const digitos = (v: string): string | null => {
  const d = v.replace(/\D/g, "");
  return d.length > 0 ? d : null;
};

// Campos do formulário do corretor ("complementar dados") -> colunas de `clientes`. O mesmo mapeamento
// que o cadastro do portal usa ao criar ou completar um cliente.
export async function dadosDoClienteFormulario(c: ClienteAvaliacao) {
  const ehCnpj = c.tipoCliente === "Pessoa Jurídica";
  const dataNasc = c.dataNascimento ? new Date(c.dataNascimento) : null;
  const endereco = await montarEnderecoPF({
    rua: c.rua || null,
    nPredial: c.nPredial || null,
    complemento: c.complemento || null,
    bairro: c.bairro || null,
    cidadeId: c.cidadeId || null,
    estadoId: c.estadoId || null
  });
  const tri = (v: string): boolean | null => (v === "true" ? true : v === "false" ? false : null);

  return {
    nome: c.nome.trim(),
    tipo_cliente: c.tipoCliente,
    sexo: !ehCnpj ? c.sexo || null : null,
    cpf: !ehCnpj ? digitos(c.cpf) : null,
    cnpj: ehCnpj ? digitos(c.cnpj) : null,
    rg: !ehCnpj ? c.rg || null : null,
    expedicao: !ehCnpj ? c.expedicao || null : null,
    nome_mae: !ehCnpj ? c.nomeMae || null : null,
    nome_pai: !ehCnpj ? c.nomePai || null : null,
    telefone: digitos(c.telefone),
    email: c.email || null,
    estado_civil: !ehCnpj ? c.estadoCivil || null : null,
    uniao_estavel: !ehCnpj ? tri(c.uniaoEstavel) : null,
    data_nascimento: dataNasc && !Number.isNaN(dataNasc.getTime()) ? dataNasc : null,
    cat_profissao: c.catProfissao || null,
    tipo_servidor: c.tipoServidor || null,
    profissao: c.profissao || null,
    renda_bruta: c.rendaBruta ? valorEditavelParaDecimal(c.rendaBruta) : null,
    cep: digitos(c.cep),
    rua: c.rua || null,
    n_predial: c.nPredial || null,
    complemento: c.complemento || null,
    bairro: c.bairro || null,
    estado_id: c.estadoId || null,
    cidade_id: c.cidadeId || null,
    endereco,
    observacao: c.observacao || null,
    banco_id: c.bancoId || null,
    codigo_banco: c.codigoBanco || null,
    agencia: c.agencia || null,
    conta: c.conta || null,
    tipo_conta: c.tipoConta || null,
    tipo_pix: c.tipoPix || null,
    pix: c.pix || null
  };
}
