"use server";

import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { getPortalSession } from "@/lib/portal-auth";

// Dispensar notificação (fechar e não ver de novo) — pedido do usuário
// 30/08/2026. Uma única action serve o sino do admin e o do Portal: tenta a
// sessão de admin primeiro, senão a de portal — funciona em qualquer um dos
// dois porque NotificacoesSino é o mesmo componente client nos dois lugares
// (ver components/notificacoes-sino.tsx).
//
// Precisa estar em um arquivo próprio com "use server" no topo (em vez de
// inline dentro de lib/notificacoes.ts, como foi feito inicialmente): o
// Next.js não permite Server Action com "use server" inline dentro de uma
// função quando esse módulo é importado por um Client Component
// (notificacoes-sino.tsx é "use client") — isso quebrou o build no Vercel
// (achado em 30/08/2026, ao investigar por que os últimos 2 deploys ficaram
// com status "Error").
export async function dispensarNotificacaoAction(notificacaoId: string): Promise<void> {
  if (!notificacaoId) return;

  const admin = await getAdminSession();
  const parceiroId = admin?.parceiroId ?? (await getPortalSession())?.parceiroId;
  if (!parceiroId) return;

  await prisma.notificacoes_dispensadas
    .upsert({
      where: { parceiro_id_notificacao_id: { parceiro_id: parceiroId, notificacao_id: notificacaoId } },
      create: { parceiro_id: parceiroId, notificacao_id: notificacaoId },
      update: {}
    })
    .catch(() => {});
  // Idempotente de propósito (upsert + catch mudo): um duplo clique ou uma
  // corrida entre abas não pode virar erro pro usuário — dispensar de novo
  // algo que já está dispensado não muda nada.
}
