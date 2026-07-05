"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";

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

function decimal(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
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
    renda_bruta: decimal(formData, "renda_bruta"),
    data_nascimento: data(formData, "data_nascimento"),
    cat_profissao: texto(formData, "cat_profissao"),
    tipo_servidor: texto(formData, "tipo_servidor"),
    profissao: texto(formData, "profissao"),
    endereco: texto(formData, "endereco"),
    observacao: texto(formData, "observacao"),
    parceiro_id: texto(formData, "parceiro_id"),
    loja_id: texto(formData, "loja_id"),
    status_cadastro: texto(formData, "status_cadastro"),
    tipo_vinculo: texto(formData, "tipo_vinculo"),
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

  const novo = await prisma.clientes.create({
    data: {
      nome,
      ...camposEditaveis(formData),
      tipo_cliente: tipoCliente
    }
  });

  await logAlteracao({
    entidadeTipo: "clientes",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { nome: novo.nome, tipo_cliente: novo.tipo_cliente }
  });

  revalidatePath("/clientes");
  redirect(`/clientes/${novo.id}`);
}

export async function atualizarClienteAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "clienteId");
  if (!id) throw new Error("Cliente inválido.");

  const antes = await prisma.clientes.findUnique({ where: { id } });
  if (!antes) throw new Error("Cliente não encontrado.");

  const depois = await prisma.clientes.update({
    where: { id },
    data: camposEditaveis(formData)
  });

  await logAlteracao({
    entidadeTipo: "clientes",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
}
