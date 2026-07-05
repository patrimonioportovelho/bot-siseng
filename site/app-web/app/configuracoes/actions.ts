"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAlteracao, requireAdm, aprovarSolicitacaoAction, rejeitarSolicitacaoAction } from "@/lib/auth";

function normalizeCpf(cpf: string) {
  return cpf.replace(/\D/g, "");
}

export async function atualizarCpfParceiroAction(formData: FormData) {
  await requireAdm();

  const parceiroId = String(formData.get("parceiroId") ?? "");
  const cpfInformado = normalizeCpf(String(formData.get("cpf") ?? ""));
  if (!parceiroId) return;

  const antes = await prisma.parceiros.findUnique({
    where: { id: parceiroId },
    select: { cpf: true }
  });

  await prisma.parceiros.update({
    where: { id: parceiroId },
    data: { cpf: cpfInformado || null }
  });

  await logAlteracao({
    entidadeTipo: "parceiros",
    entidadeId: parceiroId,
    acao: "editar_cpf",
    dadosAntes: { cpf: antes?.cpf ?? null },
    dadosDepois: { cpf: cpfInformado || null }
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
