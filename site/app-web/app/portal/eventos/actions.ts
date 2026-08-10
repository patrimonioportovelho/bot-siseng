"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { podeVerEvento } from "@/lib/eventos/opcoes";

// Confirmação de presença/ausência — pedido do usuário (10/08/2026):
// "só filtrar pra ter um controle de presença e ausência". A linha em
// eventos_confirmacoes só existe pra quem de fato respondeu (criada aqui,
// sob demanda) — quem nunca abriu o evento simplesmente não tem linha, e
// conta como "ainda não respondeu" no resumo do admin (ver
// app/eventos/[id]/page.tsx).
async function responder(formData: FormData, status: "Confirmado" | "Recusado") {
  const session = await requirePortalSession();
  const eventoId = String(formData.get("eventoId") ?? "");
  if (!eventoId) return;

  const [evento, parceiro] = await Promise.all([
    prisma.eventos.findUnique({ where: { id: eventoId } }),
    prisma.parceiros.findUnique({ where: { id: session.parceiroId }, select: { funcao: true } })
  ]);
  if (!evento || evento.excluido || !evento.ativo) return;
  // Não deixa responder um evento que nem deveria estar vendo (visibilidade
  // não bate com a função dele) — proteção contra alguém montar o form à
  // mão com um eventoId de outro setor.
  if (!podeVerEvento(evento.visibilidade, parceiro?.funcao ?? null)) return;

  await prisma.eventos_confirmacoes.upsert({
    where: { evento_id_parceiro_id: { evento_id: eventoId, parceiro_id: session.parceiroId } },
    create: { evento_id: eventoId, parceiro_id: session.parceiroId, status, respondido_em: new Date() },
    update: { status, respondido_em: new Date() }
  });

  revalidatePath("/portal/eventos");
  revalidatePath(`/eventos/${eventoId}`);
}

export async function confirmarPresencaEventoAction(formData: FormData) {
  await responder(formData, "Confirmado");
}

export async function recusarPresencaEventoAction(formData: FormData) {
  await responder(formData, "Recusado");
}
