"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loginPortal, logoutPortal, requirePortalSession } from "@/lib/portal-auth";

export async function loginPortalAction(formData: FormData) {
  const senha = String(formData.get("senha") ?? "");
  const parceiroId = String(formData.get("parceiroId") ?? "") || null;

  const result = await loginPortal(senha, parceiroId);
  if (!result.ok) {
    redirect(`/portal/login?erro=${encodeURIComponent(result.error)}`);
  }
  redirect("/portal");
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
