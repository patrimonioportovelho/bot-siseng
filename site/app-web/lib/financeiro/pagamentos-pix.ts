// Saldo devedor de uma movimentação (Fase 8, 14/08/2026) — total menos a
// soma dos pagamentos parciais via Pix já CONFIRMADOS (pago=true). Usado
// tanto no Portal (corretor vê quanto falta, e é o teto do próximo Pix que
// ele pode gerar) quanto no admin (app/financeiro/[id]/page.tsx).
export function saldoDevido(valorTotal: number, pagamentosPix: { valor: number; pago: boolean }[]): number {
  const pago = pagamentosPix.filter((p) => p.pago).reduce((soma, p) => soma + p.valor, 0);
  const saldo = valorTotal - pago;
  // Arredonda pra 2 casas — soma de Decimal->Number pode sobrar resíduo de
  // ponto flutuante (ex.: 150 - 50 - 50 - 50 = 0.000000000000...).
  return Math.round(saldo * 100) / 100;
}
