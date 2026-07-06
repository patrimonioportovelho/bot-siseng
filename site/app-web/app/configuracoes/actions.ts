"use server";

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
  if (!parceiroId || !senha) return;

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
}

export async function aprovarAcessoAction(formData: FormData) {
  const id = String(formData.get("solicitacaoId") ?? "");
  if (!id) return;
  await aprovarSolicitacaoAction(id);
  revalidatePath("/configuracoes");
}

export async function rejeitarAcessoAction(formData: FormData) {
  const id = String(formData.get("solicitacaoId") ?? "");
  if (!id) return;
  await rejeitarSolicitacaoAction(id);
  revalidatePath("/configuracoes");
}
