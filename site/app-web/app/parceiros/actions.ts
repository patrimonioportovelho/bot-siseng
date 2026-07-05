"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireAdm, logAlteracao } from "@/lib/auth";
import { percentualParaDecimal } from "@/lib/format";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// Telefone é digitado com máscara ((xx) xxxxx-xxxx) mas gravado só com
// dígitos, no mesmo formato já usado no restante da base.
function telefoneDigitos(formData: FormData, campo: string): string | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = t.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

function decimal(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Campos de comissionamento são exibidos como percentual (22,5) mas gravados
// como fração decimal (0.225), no mesmo formato já usado na base.
function percentual(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return percentualParaDecimal(t);
}

function inteiro(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Campos que qualquer parceiro autenticado pode editar em um cadastro já
// existente. Nome e CPF ficam de fora de propósito: são a âncora de
// identidade usada no login (nome + CPF) e só mudam via aprovação de acesso
// em Configurações — nunca por este formulário, nem por ADM.
function camposEditaveis(formData: FormData) {
  return {
    telefone: telefoneDigitos(formData, "telefone"),
    email: texto(formData, "email"),
    empresa: texto(formData, "empresa"),
    funcao: texto(formData, "funcao") ?? undefined,
    loja_id: texto(formData, "loja_id"),
    status_funcao: texto(formData, "status_funcao") ?? undefined,
    data_nascimento: data(formData, "data_nascimento"),
    identidade: texto(formData, "identidade"),
    expedicao_estado: texto(formData, "expedicao_estado"),
    estado_civil: texto(formData, "estado_civil"),
    creci: texto(formData, "creci"),
    endereco: texto(formData, "endereco"),
    data_entrada: data(formData, "data_entrada"),
    obs_funcao: texto(formData, "obs_funcao"),
    fee: decimal(formData, "fee"),
    porc_compr: percentual(formData, "porc_compr"),
    porc_vend: percentual(formData, "porc_vend"),
    dia_fee: inteiro(formData, "dia_fee"),
    banco_id: texto(formData, "banco_id"),
    codigo_banco: texto(formData, "codigo_banco"),
    agencia: texto(formData, "agencia"),
    conta: texto(formData, "conta"),
    tipo_conta: texto(formData, "tipo_conta"),
    tipo_pix: texto(formData, "tipo_pix"),
    pix: texto(formData, "pix"),
    link_drive: texto(formData, "link_drive"),
    updated_at: new Date()
  };
}

export async function criarParceiroAction(formData: FormData) {
  await requireAdminSession();

  const nome = texto(formData, "nome");
  const funcao = texto(formData, "funcao");
  if (!nome || !funcao) {
    throw new Error("Nome e função são obrigatórios.");
  }

  const cpfDigitado = texto(formData, "cpf");
  const cpf = cpfDigitado ? cpfDigitado.replace(/\D/g, "") : null;

  const novo = await prisma.parceiros.create({
    data: {
      nome,
      cpf,
      ...camposEditaveis(formData),
      funcao
    }
  });

  await logAlteracao({
    entidadeTipo: "parceiros",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { nome: novo.nome, funcao: novo.funcao }
  });

  revalidatePath("/parceiros");
  redirect(`/parceiros/${novo.id}`);
}

export async function atualizarParceiroAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "parceiroId");
  if (!id) throw new Error("Parceiro inválido.");

  const antes = await prisma.parceiros.findUnique({ where: { id } });
  if (!antes) throw new Error("Parceiro não encontrado.");

  const depois = await prisma.parceiros.update({
    where: { id },
    data: camposEditaveis(formData)
  });

  await logAlteracao({
    entidadeTipo: "parceiros",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/parceiros/${id}`);
  revalidatePath("/parceiros");
}

// "Apagar" aqui é sempre um soft-delete (status_funcao = Excluído): a maior
// parte dos parceiros tem histórico real vinculado (imóveis, transações,
// pagamentos...) e um DELETE de verdade quebraria essas referências. Só ADM
// pode fazer isso.
export async function apagarParceiroAction(formData: FormData) {
  const admin = await requireAdm();

  const id = texto(formData, "parceiroId");
  if (!id) throw new Error("Parceiro inválido.");

  const antes = await prisma.parceiros.findUnique({ where: { id } });
  if (!antes) throw new Error("Parceiro não encontrado.");

  await prisma.parceiros.update({
    where: { id },
    data: { status_funcao: "Excluído", updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "parceiros",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { status_funcao: antes.status_funcao },
    dadosDepois: { status_funcao: "Excluído", excluido_por: admin.nome }
  });

  revalidatePath("/parceiros");
  redirect("/parceiros");
}
