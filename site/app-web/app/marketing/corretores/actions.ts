"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { registrarEJogarErro } from "@/lib/erros";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function numero(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Perfil de marca pessoal do corretor (Fase 5b, 09/08/2026) — Notion
// "Corretores". Upsert: 1 registro por Parceiro (parceiro_id é @unique),
// então a mesma action cria na primeira vez e atualiza depois — a tela não
// precisa saber se já existe perfil ou não.
export async function salvarPerfilCorretorAction(formData: FormData) {
  await requireAdminSession();

  const parceiroId = texto(formData, "parceiroId");
  if (!parceiroId) throw new Error("Corretor inválido.");

  const antes = await prisma.marketing_corretores.findUnique({ where: { parceiro_id: parceiroId } });

  const dados = {
    instagram: texto(formData, "instagram"),
    tom_voz: texto(formData, "tom_voz"),
    posicionamento: texto(formData, "posicionamento"),
    pilares_conteudo: texto(formData, "pilares_conteudo"),
    publico_prioritario: texto(formData, "publico_prioritario"),
    regiao: texto(formData, "regiao"),
    especialidade: texto(formData, "especialidade"),
    meta_mensal_leads: numero(formData, "meta_mensal_leads"),
    responsavel_marketing_parceiro_id: texto(formData, "responsavel_marketing_parceiro_id"),
    status: texto(formData, "status") ?? "Ativo"
  };

  const depois = await prisma.marketing_corretores
    .upsert({
      where: { parceiro_id: parceiroId },
      create: { parceiro_id: parceiroId, ...dados },
      update: { ...dados, updated_at: new Date() }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_corretores", entidadeId: parceiroId, acao: antes ? "editar" : "criar", erro }));

  await logAlteracao({
    entidadeTipo: "marketing_corretores",
    entidadeId: parceiroId,
    acao: antes ? "editar" : "criar",
    dadosAntes: antes ?? undefined,
    dadosDepois: depois
  });

  revalidatePath(`/marketing/corretores/${parceiroId}`);
  revalidatePath("/marketing/corretores");
  redirect(`/marketing/corretores/${parceiroId}?salvo=1`);
}
