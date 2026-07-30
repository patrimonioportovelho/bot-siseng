import { ENCARGO_IPTU, ENCARGO_TRSD, ENCARGO_CONDOMINIO } from "@/lib/transacoes/opcoes";

// Composição do valor de uma Locação — pedido explícito do usuário pra
// "destrinchar" o que o Valor da Transação realmente representa. valor_
// transacao é sempre o número que o corretor/administrativo digitou e NUNCA
// é alterado por esses cálculos — os dois valores abaixo são só leitura,
// derivados dele:
//
// - Valor da locação: o aluguel puro, SEM nenhum encargo — quando o
//   Condomínio vem embutido no valor_transacao (marcado como encargo, com um
//   valor próprio informado), esse valor é DESCONTADO aqui, porque
//   Condomínio não é aluguel de verdade, é só um repasse.
// - Valor de pacote: o valor real que o inquilino paga TODO MÊS através da
//   imobiliária — valor_transacao (que já inclui o Condomínio, se houver) +
//   os encargos cobrados À PARTE, somados no boleto (hoje só IPTU e TRSD).
//   Água/Energia/Gás continuam sendo só um registro de responsabilidade,
//   pagos direto pelo inquilino ao terceiro, sem valor e sem entrar em
//   nenhuma dessas contas.
//
// Existe só como cálculo — não são colunas novas no banco além de
// iptu/trsd/condominio — assim nunca fica desatualizado.
type ValoresLocacao = {
  // Decimal do Prisma chega tipado como unknown nos componentes (mesmo
  // padrão usado em todo o resto do código, ex. transacao-detalhe.tsx) — o
  // Number(...) abaixo lida com qualquer formato (Decimal, string, number).
  valorTransacao: unknown;
  iptu: unknown;
  trsd: unknown;
  condominio: unknown;
  encargos: string[] | null | undefined;
};

export function calcularValorLocacaoSemEncargos(dados: ValoresLocacao): number {
  const base = Number(dados.valorTransacao ?? 0);
  const encargos = dados.encargos ?? [];
  const condominio = encargos.includes(ENCARGO_CONDOMINIO) ? Number(dados.condominio ?? 0) : 0;
  return base - condominio;
}

export function calcularValorPacoteLocacao(dados: ValoresLocacao): number {
  const base = Number(dados.valorTransacao ?? 0);
  const encargos = dados.encargos ?? [];
  const iptu = encargos.includes(ENCARGO_IPTU) ? Number(dados.iptu ?? 0) : 0;
  const trsd = encargos.includes(ENCARGO_TRSD) ? Number(dados.trsd ?? 0) : 0;
  // Condomínio já está dentro de valor_transacao (não soma de novo aqui) —
  // ver calcularValorLocacaoSemEncargos, que é quem desconta.
  return base + iptu + trsd;
}

// Verdadeiro só quando o pacote realmente soma algo além do aluguel — usado
// pra decidir se vale a pena mostrar a linha "Valor de pacote" (quando não
// tem IPTU/TRSD marcado, pacote = valor da locação, não precisa repetir).
export function temAdicionalNoPacote(dados: { iptu: unknown; trsd: unknown; encargos: string[] | null | undefined }): boolean {
  const encargos = dados.encargos ?? [];
  const temIptu = encargos.includes(ENCARGO_IPTU) && Number(dados.iptu ?? 0) > 0;
  const temTrsd = encargos.includes(ENCARGO_TRSD) && Number(dados.trsd ?? 0) > 0;
  return temIptu || temTrsd;
}

// Verdadeiro só quando o Condomínio está mesmo embutido (marcado + com
// valor) — usado pra mostrar uma notinha explicando o desconto no Valor da
// locação, em vez de deixar o número aparecer sem contexto.
export function temCondominioEmbutido(dados: { condominio: unknown; encargos: string[] | null | undefined }): boolean {
  const encargos = dados.encargos ?? [];
  return encargos.includes(ENCARGO_CONDOMINIO) && Number(dados.condominio ?? 0) > 0;
}
