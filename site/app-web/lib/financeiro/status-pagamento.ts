import type { Prisma } from "@prisma/client";

// Status de pagamento em 3 etapas de uma movimentacao (Financeiro).
//
// Pendente  -> nada feito
// Conferido -> colaborador conferiu que o dinheiro entrou / aprovou a despesa
//              (fica azul); pro repasse de honorario isso acontece SOZINHO
//              quando o Recebimento de origem e marcado como recebido.
// Pago      -> um dos socios efetivamente pagou / o dinheiro caiu no extrato.
//
// `movimentacoes.pago` (boolean) continua existindo como ESPELHO:
// pago = (status_pagamento === 'Pago'). Quem escreve status_pagamento escreve
// pago junto (ver app/financeiro/actions.ts). Assim dashboard, portal do
// corretor e ranking de honorarios seguem lendo `pago` sem mudanca.

export const STATUS_PAGAMENTO = ["Pendente", "Conferido", "Pago"] as const;
export type StatusPagamento = (typeof STATUS_PAGAMENTO)[number];

export function ehStatusPagamento(v: unknown): v is StatusPagamento {
  return typeof v === "string" && (STATUS_PAGAMENTO as readonly string[]).includes(v);
}

// Rotulo pra tela. Recebimento troca "Pago" por "Recebido" (mesma convencao
// que o resto do Financeiro ja usava com o boolean).
export function rotuloStatusPagamento(status: string, tipo: string): string {
  if (status === "Pago") return tipo === "Recebimento" ? "Recebido" : "Pago";
  return status; // "Pendente" | "Conferido"
}

// Classes de cor reaproveitando a paleta que movimentacao-detalhe.tsx /
// financeiro/page.tsx ja usavam (verde #3C7A57 pra pago, azul pra o estado
// intermediario, cinza pra pendente).
export function corTextoStatusPagamento(status: string): string {
  if (status === "Pago") return "text-[#3C7A57]";
  if (status === "Conferido") return "text-blue-700";
  return "text-gray-500";
}

export function corSeloStatusPagamento(status: string): string {
  if (status === "Pago") return "bg-green-50 text-green-700 border-green-200";
  if (status === "Conferido") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

// So permite andar uma etapa por vez, pra frente ou pra tras. Bloqueia
// Pendente -> Pago direto (pedido do usuario: sempre conferir antes de pagar).
export function transicaoValida(de: string, para: string): boolean {
  if (de === para) return true;
  const passos: Record<string, string[]> = {
    Pendente: ["Conferido"],
    Conferido: ["Pendente", "Pago"],
    Pago: ["Conferido"]
  };
  return (passos[de] ?? []).includes(para);
}

export function mensagemTransicaoInvalida(de: string, para: string, tipo: string): string {
  if (de === "Pendente" && para === "Pago") {
    const verbo = tipo === "Recebimento" ? "receber" : "pagar";
    return `Confira essa movimentacao antes de marcar como ${verbo}. Use "Conferir" primeiro.`;
  }
  return `Nao da pra ir de "${de}" para "${para}".`;
}

// Recebimento virou "Pago" -> repasses de honorario (Despesa) ligados a ele e
// ainda em "Pendente" viram "Conferido" automaticamente (conferido_por = NULL).
// Ligacao: movimentacoes.pagamento_id -> pagamentos.recebimento_id = recebimentoId.
export async function autoConferirRepassesDoRecebimento(
  tx: Prisma.TransactionClient,
  recebimentoId: string
): Promise<void> {
  const pagamentos = await tx.pagamentos.findMany({
    where: { recebimento_id: recebimentoId },
    select: { id: true }
  });
  if (pagamentos.length === 0) return;
  await tx.movimentacoes.updateMany({
    where: {
      pagamento_id: { in: pagamentos.map((p) => p.id) },
      tipo: "Despesa",
      status_pagamento: "Pendente"
    },
    data: { status_pagamento: "Conferido", conferido_em: new Date(), conferido_por_parceiro_id: null }
  });
}

// Recebimento saiu de "Pago" -> desfaz so os repasses que foram conferidos
// AUTOMATICAMENTE (conferido_por_parceiro_id IS NULL) e ainda nao foram pagos.
// Repasse conferido a mao por alguem fica como esta.
export async function reverterAutoConferirRepasses(
  tx: Prisma.TransactionClient,
  recebimentoId: string
): Promise<void> {
  const pagamentos = await tx.pagamentos.findMany({
    where: { recebimento_id: recebimentoId },
    select: { id: true }
  });
  if (pagamentos.length === 0) return;
  await tx.movimentacoes.updateMany({
    where: {
      pagamento_id: { in: pagamentos.map((p) => p.id) },
      tipo: "Despesa",
      status_pagamento: "Conferido",
      conferido_por_parceiro_id: null
    },
    data: { status_pagamento: "Pendente", conferido_em: null }
  });
}
