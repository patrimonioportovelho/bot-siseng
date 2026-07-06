"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function valorMonetario(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return valorEditavelParaDecimal(t);
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function camposEditaveis(formData: FormData) {
  return {
    tipo_imovel: texto(formData, "tipo_imovel"),
    status_imovel: texto(formData, "status_imovel"),
    tipo_oferta: texto(formData, "tipo_oferta"),
    inscricao: texto(formData, "inscricao"),
    matricula: texto(formData, "matricula"),
    pasta_url: texto(formData, "pasta_url"),
    rua: texto(formData, "rua"),
    n_predial: texto(formData, "n_predial"),
    complemento: texto(formData, "complemento"),
    bairro: texto(formData, "bairro"),
    estado_id: texto(formData, "estado_id"),
    cidade_id: texto(formData, "cidade_id"),
    endereco: texto(formData, "endereco"),
    cliente_vendedor_id: texto(formData, "cliente_vendedor_id"),
    parceiro_id: texto(formData, "parceiro_id"),
    valor_venda: valorMonetario(formData, "valor_venda"),
    valor_avaliacao: valorMonetario(formData, "valor_avaliacao"),
    validade_avaliacao: data(formData, "validade_avaliacao"),
    descricao: texto(formData, "descricao"),
    updated_at: new Date()
  };
}

export async function criarImovelAction(formData: FormData) {
  await requireAdminSession();

  const novo = await prisma.imoveis.create({
    data: camposEditaveis(formData)
  });

  await logAlteracao({
    entidadeTipo: "imoveis",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { endereco: novo.endereco, tipo_imovel: novo.tipo_imovel }
  });

  revalidatePath("/imoveis");
  redirect(`/imoveis/${novo.id}`);
}

export async function atualizarImovelAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "imovelId");
  if (!id) throw new Error("Imóvel inválido.");

  const antes = await prisma.imoveis.findUnique({ where: { id } });
  if (!antes) throw new Error("Imóvel não encontrado.");

  const depois = await prisma.imoveis.update({
    where: { id },
    data: camposEditaveis(formData)
  });

  await logAlteracao({
    entidadeTipo: "imoveis",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/imoveis/${id}`);
  revalidatePath("/imoveis");
}
