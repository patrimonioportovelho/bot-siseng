"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireAdm, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { TIPOS_META } from "@/lib/metas/opcoes";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function camposEditaveis(formData: FormData) {
  const tipoMeta = texto(formData, "tipo_meta");
  const unidade = TIPOS_META.find((t) => t.chave === tipoMeta)?.unidadePadrao ?? "";
  const valorMetaTxt = texto(formData, "valor_meta");
  const periodoInicio = data(formData, "periodo_inicio");
  const periodoFim = data(formData, "periodo_fim");

  if (!tipoMeta) throw new Error("Selecione o tipo da meta.");
  if (!periodoInicio || !periodoFim) throw new Error("Preencha o início e o fim do período.");
  const valorMeta = valorMetaTxt ? valorEditavelParaDecimal(valorMetaTxt) : null;
  if (valorMeta === null || valorMeta <= 0) throw new Error("Informe um valor alvo maior que zero.");

  return {
    tipo_meta: tipoMeta,
    unidade,
    periodo_tipo: texto(formData, "periodo_tipo") ?? "Mensal",
    periodo_inicio: periodoInicio,
    periodo_fim: periodoFim,
    valor_meta: valorMeta,
    observacao: texto(formData, "observacao"),
    // parceiro_id null = meta Geral (da imobiliária toda, soma de todo mundo).
    parceiro_id: texto(formData, "parceiro_id"),
    loja_id: texto(formData, "loja_id"),
    updated_at: new Date()
  };
}

export async function criarMetaAction(formData: FormData) {
  await requireAdminSession();

  const campos = camposEditaveis(formData);

  // metas.criado_por_usuario_id aponta pra tabela usuarios (login antigo,
  // separado da sessão de parceiro usada hoje) — fica sempre null nos
  // cadastros feitos por aqui, sem prejuízo nenhum (campo opcional).
  const nova = await prisma.metas
    .create({ data: campos })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "metas", acao: "criar", erro }));

  await logAlteracao({
    entidadeTipo: "metas",
    entidadeId: nova.id,
    acao: "criar",
    dadosDepois: { tipo_meta: nova.tipo_meta, parceiro_id: nova.parceiro_id, valor_meta: nova.valor_meta }
  });

  revalidatePath("/metas");
  redirect("/metas?salvo=1");
}

export async function atualizarMetaAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "metaId");
  if (!id) throw new Error("Meta inválida.");

  const antes = await prisma.metas.findUnique({ where: { id } });
  if (!antes) throw new Error("Meta não encontrada.");

  const campos = camposEditaveis(formData);

  const depois = await prisma.metas
    .update({ where: { id }, data: campos })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "metas", entidadeId: id, acao: "editar", erro }));

  await logAlteracao({
    entidadeTipo: "metas",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/metas/${id}`);
  revalidatePath("/metas");
  redirect(`/metas/${id}?salvo=1`);
}

// Meta não tem histórico vinculado (é só um alvo + período) — apagar de
// verdade não quebra nenhuma referência, diferente de transações/
// administrações. Mesmo assim só ADM pode apagar, mesma régua do resto do
// sistema.
export async function apagarMetaAction(formData: FormData) {
  const admin = await requireAdm();

  const id = texto(formData, "metaId");
  if (!id) throw new Error("Meta inválida.");

  const antes = await prisma.metas.findUnique({ where: { id } });
  if (!antes) throw new Error("Meta não encontrada.");

  await prisma.metas.delete({ where: { id } });

  await logAlteracao({
    entidadeTipo: "metas",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { tipo_meta: antes.tipo_meta, parceiro_id: antes.parceiro_id },
    dadosDepois: { excluido_por: admin.nome }
  });

  revalidatePath("/metas");
  redirect("/metas?excluido=1");
}
