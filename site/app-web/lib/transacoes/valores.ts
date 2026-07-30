import { ENCARGO_IPTU, ENCARGO_TRSD } from "@/lib/transacoes/opcoes";

// Composição do valor de uma Locação — pedido explícito do usuário pra
// "destrinchar" o que o Valor da Transação realmente representa:
//
// - Valor da locação: o aluguel puro (campo valor_transacao), sem nenhum
//   encargo somado — é o valor que o corretor/administrativo sempre digitou.
// - Valor de pacote: o valor real que o inquilino paga TODO MÊS através da
//   imobiliária, somando o aluguel + os encargos que são cobrados junto
//   (fracionados nas mensalidades) — hoje só IPTU e TRSD têm esse
//   comportamento (têm campo de valor próprio e entram no boleto). Os demais
//   encargos (Condomínio/Água/Energia/Gás) são pagos direto pelo inquilino
//   ao terceiro responsável, não passam pela imobiliária, então não somam
//   aqui.
//
// Existe só como cálculo — não é uma coluna nova no banco — assim nunca fica
// desatualizado em relação a valor_transacao/iptu/trsd/encargos.
export function calcularValorPacoteLocacao(dados: {
  // Decimal do Prisma chega tipado como unknown nos componentes (mesmo
  // padrão usado em todo o resto do código, ex. transacao-detalhe.tsx) — o
  // Number(...) abaixo lida com qualquer formato (Decimal, string, number).
  valorTransacao: unknown;
  iptu: unknown;
  trsd: unknown;
  encargos: string[] | null | undefined;
}): number {
  const base = Number(dados.valorTransacao ?? 0);
  const encargos = dados.encargos ?? [];
  const iptu = encargos.includes(ENCARGO_IPTU) ? Number(dados.iptu ?? 0) : 0;
  const trsd = encargos.includes(ENCARGO_TRSD) ? Number(dados.trsd ?? 0) : 0;
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
