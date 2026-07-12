"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loginPortal, logoutPortal, requirePortalSession, trocarSenhaPortal } from "@/lib/portal-auth";

export async function loginPortalAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const senha = String(formData.get("senha") ?? "");

  const result = await loginPortal(email, senha);
  if (!result.ok) {
    redirect(`/portal/login?erro=${encodeURIComponent(result.error)}`);
  }
  redirect("/portal");
}

export async function trocarSenhaPortalAction(formData: FormData) {
  const session = await requirePortalSession();

  const senhaAtual = String(formData.get("senhaAtual") ?? "");
  const senhaNova = String(formData.get("senhaNova") ?? "");
  const senhaNovaConfirma = String(formData.get("senhaNovaConfirma") ?? "");

  if (senhaNova !== senhaNovaConfirma) {
    redirect(`/portal/senha?erro=${encodeURIComponent("A confirmação não bate com a nova senha.")}`);
  }

  const result = await trocarSenhaPortal(session.parceiroId, senhaAtual, senhaNova);
  if (!result.ok) {
    redirect(`/portal/senha?erro=${encodeURIComponent(result.error)}`);
  }
  redirect("/portal/senha?salvo=1");
}

export async function logoutPortalAction() {
  await logoutPortal();
  redirect("/portal/login");
}

export async function toggleChecklistAction(itemId: string) {
  const session = await requirePortalSession();
  if (!session.parceiroId) return;

  const existente = await prisma.checklist_conclusoes.findUnique({
    where: { item_id_parceiro_id: { item_id: itemId, parceiro_id: session.parceiroId } }
  });

  if (existente) {
    await prisma.checklist_conclusoes.delete({ where: { id: existente.id } });
  } else {
    await prisma.checklist_conclusoes.create({
      data: { item_id: itemId, parceiro_id: session.parceiroId }
    });
  }

  revalidatePath("/portal");
}
