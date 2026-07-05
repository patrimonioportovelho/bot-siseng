"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAlteracao } from "@/lib/auth";

function normalizeCpf(cpf: string) {
  return cpf.replace(/\D/g, "");
}

export async function atualizarCpfAdministrativoAction(formData: FormData) {
  const parceiroId = String(formData.get("parceiroId") ?? "");
  const cpfInformado = normalizeCpf(String(formData.get("cpf") ?? ""));
  if (!parceiroId) return;

  const antes = await prisma.parceiros.findUnique({
    where: { id: parceiroId },
    select: { cpf: true, nome: true }
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
