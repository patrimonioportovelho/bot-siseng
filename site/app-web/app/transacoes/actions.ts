"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";

// Ação enxuta usada só para o select de troca rápida de status dentro da
// tela de Administração — não é o CRUD completo de Transações (isso fica
// para quando construirmos a página própria de Transações).
export async function atualizarStatusTransacaoAction(formData: FormData) {
  await requireAdminSession();

  const id = formData.get("transacaoId");
  const status = formData.get("status");
  const admImovelId = formData.get("admImovelId");
  if (typeof id !== "string" || typeof status !== "string" || !id || !status) {
    throw new Error("Transação ou status inválido.");
  }

  const antes = await prisma.transacoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Transação não encontrada.");

  const depois = await prisma.transacoes.update({
    where: { id },
    data: { status, updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "transacoes",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { status: antes.status },
    dadosDepois: { status: depois.status }
  });

  if (typeof admImovelId === "string" && admImovelId) {
    revalidatePath(`/administracoes/${admImovelId}`);
  }
}
