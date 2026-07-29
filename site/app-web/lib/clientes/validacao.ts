// Validação de CPF e CNPJ por dígito verificador (algoritmo módulo 11
// oficial da Receita Federal) — usada em todos os pontos de entrada de
// cadastro de Cliente (Central de Clientes do admin e os formulários do
// portal do corretor) para pegar erro de digitação antes de gravar no
// banco. Isso é validação de FORMATO/dígito, não confirma que o CPF/CNPJ
// existe de verdade — só recusa números matematicamente inválidos (ex.:
// "111.111.111-11", que passaria numa checagem só de "tem 11 dígitos").

// Remove tudo que não é dígito. Reaproveitável para qualquer campo
// numérico digitado com máscara (CPF, CNPJ, telefone, CEP etc.).
export function apenasDigitos(valor: string | null | undefined): string {
  if (!valor) return "";
  return valor.replace(/\D/g, "");
}

// Valida CPF (11 dígitos) pelo algoritmo padrão de dois dígitos
// verificadores. Recusa sequências repetidas (000.000.000-00,
// 111.111.111-11 etc.), que passam na conta mas nunca são CPFs reais.
export function cpfValido(valor: string | null | undefined): boolean {
  const cpf = apenasDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (fatorInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < fatorInicial - 1; i++) {
      soma += Number(cpf[i]) * (fatorInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const d1 = digito(10);
  if (d1 !== Number(cpf[9])) return false;
  const d2 = digito(11);
  if (d2 !== Number(cpf[10])) return false;

  return true;
}

// Valida CNPJ (14 dígitos) pelo mesmo tipo de algoritmo (pesos diferentes).
// Também recusa sequências repetidas (00.000.000/0000-00 etc.).
export function cnpjValido(valor: string | null | undefined): boolean {
  const cnpj = apenasDigitos(valor);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcular = (tamanho: number): number => {
    const pesos = tamanho === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < tamanho; i++) {
      soma += Number(cnpj[i]) * pesos[i];
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = calcular(12);
  if (d1 !== Number(cnpj[12])) return false;
  const d2 = calcular(13);
  if (d2 !== Number(cnpj[13])) return false;

  return true;
}

// Detecta pelo tamanho (após limpar a máscara) se o documento digitado é
// CPF (11) ou CNPJ (14) — mesmo critério já usado em vários pontos do
// sistema (ex.: gerarPropostaAction) para decidir tipo_cliente.
export function tipoDocumento(valor: string | null | undefined): "cpf" | "cnpj" | null {
  const d = apenasDigitos(valor);
  if (d.length === 11) return "cpf";
  if (d.length === 14) return "cnpj";
  return null;
}

// Validação única para uso nos formulários: aceita CPF (11 dígitos) ou
// CNPJ (14 dígitos) e devolve uma mensagem de erro pronta para exibir, ou
// null se estiver tudo certo. `null`/vazio é tratado como inválido pelo
// chamador só quando o campo for obrigatório — esta função por si só não
// decide obrigatoriedade.
export function validarCpfCnpj(valor: string | null | undefined): string | null {
  const d = apenasDigitos(valor);
  if (d.length === 0) return "Informe o CPF ou CNPJ.";
  if (d.length !== 11 && d.length !== 14) {
    return "CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos.";
  }
  if (d.length === 11 && !cpfValido(d)) return "CPF inválido — confira os números digitados.";
  if (d.length === 14 && !cnpjValido(d)) return "CNPJ inválido — confira os números digitados.";
  return null;
}
