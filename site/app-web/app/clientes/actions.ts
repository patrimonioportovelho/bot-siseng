"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireAdm, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";

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

// CPF/CNPJ são digitados com máscara mas gravados só com dígitos.
function digitos(formData: FormData, campo: string): string | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = t.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

function rendaBruta(formData: FormData, campo: string): number | null {
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
    tipo_cliente: texto(formData, "tipo_cliente") ?? undefined,
    sexo: texto(formData, "sexo"),
    cpf: digitos(formData, "cpf"),
    cnpj: digitos(formData, "cnpj"),
    rg: texto(formData, "rg"),
    expedicao: texto(formData, "expedicao"),
    telefone: telefoneDigitos(formData, "telefone"),
    email: texto(formData, "email"),
    estado_civil: texto(formData, "estado_civil"),
    renda_bruta: rendaBruta(formData, "renda_bruta"),
    data_nascimento: data(formData, "data_nascimento"),
    cat_profissao: texto(formData, "cat_profissao"),
    tipo_servidor: texto(formData, "tipo_servidor"),
    profissao: texto(formData, "profissao"),
    endereco: texto(formData, "endereco"),
    observacao: texto(formData, "observacao"),
    parceiro_id: texto(formData, "parceiro_id"),
    loja_id: texto(formData, "loja_id"),
    banco_id: texto(formData, "banco_id"),
    codigo_banco: texto(formData, "codigo_banco"),
    agencia: texto(formData, "agencia"),
    conta: texto(formData, "conta"),
    tipo_conta: texto(formData, "tipo_conta"),
    tipo_pix: texto(formData, "tipo_pix"),
    pix: texto(formData, "pix"),
    updated_at: new Date()
  };
}

export async function criarClienteAction(formData: FormData) {
  await requireAdminSession();

  const nome = texto(formData, "nome");
  const tipoCliente = texto(formData, "tipo_cliente");
  if (!nome || !tipoCliente) {
    throw new Error("Nome e tipo de cliente são obrigatórios.");
  }

  const novo = await prisma.clientes
    .create({
      data: {
        nome,
        ...camposEditaveis(formData),
        tipo_cliente: tipoCliente
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar", erro }));

  await logAlteracao({
    entidadeTipo: "clientes",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { nome: novo.nome, tipo_cliente: novo.tipo_cliente }
  });

  revalidatePath("/clientes");
  redirect(`/clientes/${novo.id}?salvo=1`);
}

export async function atualizarClienteAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "clienteId");
  if (!id) throw new Error("Cliente inválido.");

  const antes = await prisma.clientes.findUnique({ where: { id } });
  if (!antes) throw new Error("Cliente não encontrado.");

  const depois = await prisma.clientes
    .update({
      where: { id },
      data: camposEditaveis(formData)
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", entidadeId: id, acao: "editar", erro }));

  await logAlteracao({
    entidadeTipo: "clientes",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  redirect(`/clientes/${id}?salvo=1`);
}

// "Apagar" aqui é sempre um soft-delete: reaproveita o valor "Arquivado" já
// existente em status_cadastro (não precisou de coluna nova) — o cliente
// costuma ter histórico real vinculado (imóveis, transações, avaliações) e
// um DELETE de verdade quebraria essas referências. Só ADM pode fazer isso.
export async function apagarClienteAction(formData: FormData) {
  const admin = await requireAdm();

  const id = texto(formData, "clienteId");
  if (!id) throw new Error("Cliente inválido.");

  const antes = await prisma.clientes.findUnique({ where: { id } });
  if (!antes) throw new Error("Cliente não encontrado.");

  await prisma.clientes.update({
    where: { id },
    data: { status_cadastro: "Arquivado", updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "clientes",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { status_cadastro: antes.status_cadastro },
    dadosDepois: { status_cadastro: "Arquivado", excluido_por: admin.nome }
  });

  revalidatePath("/clientes");
  redirect("/clientes?excluido=1");
}
