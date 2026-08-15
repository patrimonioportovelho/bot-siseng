"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { saldoDevido } from "@/lib/financeiro/pagamentos-pix";

// Financeiro do corretor no Portal (Fase 8, 14/08/2026) — pedido do usuário:
// "quando tiver uma despesa do corretor que ele precisa nos pagar como o
// Fee, quero dar a opção de levar a nossa forma de pagamento no pix pra lá
// (...) se a dívida é 150 e vence dia 20, dia 01 ele gera 50, dia 10 gera
// mais 50, pra ficar em dia pagando aos poucos". Cada "geração de Pix" aqui
// é só uma linha em movimentacoes_pagamentos_pix com pago=false — o admin
// confirma depois de olhar o extrato (ver alternarPagamentoParcialAction em
// app/financeiro/actions.ts). Não recalcula nem mexe na movimentação em si
// (o Recebimento original), só documenta a intenção de pagar aquele pedaço.
export async function gerarPagamentoParcialAction(
  _prev: unknown,
  formData: FormData
): Promise<{ erro: string } | undefined> {
  const session = await requirePortalSession();

  const movimentacaoId = String(formData.get("movimentacaoId") ?? "");
  const valorTexto = String(formData.get("valor") ?? "").replace(",", ".");
  const valor = Number(valorTexto);

  if (!movimentacaoId) return { erro: "Dívida inválida." };
  if (!Number.isFinite(valor) || valor <= 0) return { erro: "Informe um valor válido." };

  // Confere que a dívida é mesmo dele (não deixa montar o formulário à mão
  // com o id de outro corretor) e que ainda está em aberto.
  const movimentacao = await prisma.movimentacoes.findUnique({
    where: { id: movimentacaoId },
    include: { pagamentos_pix: true }
  });
  if (!movimentacao || movimentacao.parceiro_id !== session.parceiroId || movimentacao.tipo !== "Recebimento") {
    return { erro: "Dívida não encontrada." };
  }
  if (movimentacao.pago) {
    return { erro: "Essa dívida já está quitada." };
  }

  const saldo = saldoDevido(
    Number(movimentacao.valor),
    movimentacao.pagamentos_pix.map((p) => ({ valor: Number(p.valor), pago: p.pago }))
  );
  // Soma também os pedaços que ele já gerou mas ainda não foram confirmados
  // — senão dava pra gerar Pix maior que o saldo real só porque um anterior
  // ainda está pendente de conferência do admin.
  const pendentesNaoConfirmados = movimentacao.pagamentos_pix
    .filter((p) => !p.pago)
    .reduce((soma, p) => soma + Number(p.valor), 0);
  const tetoDisponivel = Math.round((saldo - pendentesNaoConfirmados) * 100) / 100;

  if (valor > tetoDisponivel) {
    return { erro: `O valor não pode passar do saldo disponível (${tetoDisponivel.toFixed(2).replace(".", ",")}).` };
  }

  await prisma.movimentacoes_pagamentos_pix.create({
    data: { movimentacao_id: movimentacaoId, valor, pago: false }
  });

  revalidatePath("/portal/financeiro");
  return undefined;
}

// Cancela um pedaço de Pix que ele mesmo gerou por engano — só funciona
// enquanto o admin ainda não confirmou (pago=false); depois de confirmado,
// só o admin desfaz (alternarPagamentoParcialAction), porque nesse ponto já
// afeta o saldo oficial da dívida.
export async function cancelarPagamentoParcialAction(formData: FormData) {
  const session = await requirePortalSession();

  const id = String(formData.get("pagamentoPixId") ?? "");
  if (!id) return;

  const pagamento = await prisma.movimentacoes_pagamentos_pix.findUnique({
    where: { id },
    include: { movimentacoes: true }
  });
  if (!pagamento || pagamento.movimentacoes.parceiro_id !== session.parceiroId || pagamento.pago) return;

  await prisma.movimentacoes_pagamentos_pix.delete({ where: { id } });

  revalidatePath("/portal/financeiro");
}
