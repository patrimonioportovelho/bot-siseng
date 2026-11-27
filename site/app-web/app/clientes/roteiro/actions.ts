"use server";

import { revalidatePath } from "next/cache";
import { logAlteracao, requireEdicao } from "@/lib/auth";
import { gravarEdicao } from "@/lib/crm/roteiro-edicoes-servidor";
import type { EdicaoPergunta } from "@/lib/crm/roteiro-edicoes";

// Editar o roteiro de atendimento: só quem edita Clientes (Administrativo ou Diretor). edicao null = voltar ao original.
export async function salvarPerguntaDoRoteiroAction(perguntaId: string, edicao: EdicaoPergunta | null) {
  const a = await requireEdicao("clientes");
  const r = await gravarEdicao(perguntaId, edicao, a.parceiroId);
  if (r.ok) {
    await logAlteracao({ entidadeTipo: "crm_roteiro", entidadeId: a.parceiroId, acao: r.edicao ? "editar_roteiro" : "restaurar_roteiro", dadosDepois: { pergunta: perguntaId, edicao: r.edicao } }).catch(() => undefined);
    revalidatePath("/clientes/roteiro");
  }
  return r;
}
