"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAlteracao, requireAdm, aprovarSolicitacaoAction, rejeitarSolicitacaoAction, hashSenha } from "@/lib/auth";

// Libera (ou troca) o acesso de alguém direto, sem passar pela fila de
// solicitação — útil pro cadastro inicial de cada parceiro e também pra você
// mesmo (admin) trocar sua própria senha quando precisar.
export async function definirSenhaParceiroAction(formData: FormData) {
  await requireAdm();

  const parceiroId = String(formData.get("parceiroId") ?? "");
  const senha = String(formData.get("senha") ?? "").trim();
  if (!parceiroId || !senha) {
    redirect(`/configuracoes?erro=${encodeURIComponent("Selecione o parceiro e digite uma senha.")}`);
  }

  const senhaHash = await hashSenha(senha);

  await prisma.parceiros.update({
    where: { id: parceiroId },
    data: { senha_hash: senhaHash }
  });

  await logAlteracao({
    entidadeTipo: "parceiros",
    entidadeId: parceiroId,
    acao: "definir_senha_manual"
  });

  revalidatePath("/configuracoes");
  redirect("/configuracoes?salvo=1");
}

export async function aprovarAcessoAction(formData: FormData) {
  const id = String(formData.get("solicitacaoId") ?? "");
  if (!id) return;
  await aprovarSolicitacaoAction(id);
  revalidatePath("/configuracoes");
  redirect("/configuracoes?aprovado=1");
}

export async function rejeitarAcessoAction(formData: FormData) {
  const id = String(formData.get("solicitacaoId") ?? "");
  if (!id) return;
  await rejeitarSolicitacaoAction(id);
  revalidatePath("/configuracoes");
  redirect("/configuracoes?rejeitado=1");
}
