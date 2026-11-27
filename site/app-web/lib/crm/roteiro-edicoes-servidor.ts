import { prisma } from "@/lib/prisma";
import { PERGUNTA_POR_ID } from "@/lib/crm/roteiro";
import { limparEdicao, type EdicaoPergunta, type EdicoesRoteiro } from "@/lib/crm/roteiro-edicoes";

export async function carregarEdicoes(): Promise<EdicoesRoteiro> {
  const linhas = await prisma.crm_roteiro_edicoes.findMany();
  const out: EdicoesRoteiro = {};
  for (const l of linhas) {
    const base = PERGUNTA_POR_ID.get(l.pergunta_id);
    if (!base) continue;
    // confere de novo na leitura: se o roteiro original mudou, uma edição que não cabe mais é ignorada
    const r = limparEdicao(base, l.dados);
    if (r.ok && r.edicao) out[l.pergunta_id] = r.edicao;
  }
  return out;
}

// edicao null (ou igual ao original) = restaurar o texto original
export async function gravarEdicao(perguntaId: string, entrada: EdicaoPergunta | null, autorId: string): Promise<{ ok: true; edicao: EdicaoPergunta | null } | { ok: false; erro: string }> {
  const base = PERGUNTA_POR_ID.get(perguntaId);
  if (!base) return { ok: false, erro: "Pergunta não encontrada." };
  const r = entrada ? limparEdicao(base, entrada) : { ok: true as const, edicao: null };
  if (!r.ok) return r;
  if (!r.edicao) await prisma.crm_roteiro_edicoes.deleteMany({ where: { pergunta_id: perguntaId } });
  else {
    const campos = { dados: r.edicao as object, updated_at: new Date(), updated_by: autorId };
    await prisma.crm_roteiro_edicoes.upsert({ where: { pergunta_id: perguntaId }, create: { pergunta_id: perguntaId, ...campos }, update: campos });
  }
  return { ok: true, edicao: r.edicao };
}
