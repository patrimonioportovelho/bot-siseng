"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireAdm, logAlteracao } from "@/lib/auth";
import { percentualParaDecimal } from "@/lib/format";
import { FUNCOES_EQUIPE } from "@/lib/parceiros/opcoes";
import { registrarEJogarErro } from "@/lib/erros";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// Telefone e CPF são digitados com máscara mas gravados só com dígitos, no
// mesmo formato já usado no restante da base.
function somenteDigitos(formData: FormData, campo: string): string | null {
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
// existente. Nome fica de fora de propósito: é a âncora de identidade usada
// no login (nome + CPF) e só muda via aprovação de acesso em Configurações
// — nunca por este formulário, nem por ADM. CPF, a pedido do ADM, passou a
// ser editável por aqui (era protegido antes) — atenção: mudar o CPF de um
// parceiro que já usa o portal muda o que ele precisa digitar pra entrar.
function camposEditaveis(formData: FormData) {
  return {
    cpf: somenteDigitos(formData, "cpf"),
    telefone: somenteDigitos(formData, "telefone"),
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
    data_saida: data(formData, "data_saida"),
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

  const novo = await prisma.parceiros
    .create({
      data: {
        nome,
        ...camposEditaveis(formData),
        funcao
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "parceiros", acao: "criar", erro }));

  await logAlteracao({
    entidadeTipo: "parceiros",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { nome: novo.nome, funcao: novo.funcao }
  });

  revalidatePath("/parceiros");
  redirect(`/parceiros/${novo.id}?salvo=1`);
}

export async function atualizarParceiroAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "parceiroId");
  if (!id) throw new Error("Parceiro inválido.");

  const antes = await prisma.parceiros.findUnique({ where: { id } });
  if (!antes) throw new Error("Parceiro não encontrado.");

  const campos = camposEditaveis(formData);

  // Quando Administrativo/Corretor/Corretor Estagiário muda para Inativo, a
  // função sai automaticamente da equipe: vira Corretor Externo se tiver
  // CRECI (continua atuando de forma externa) ou Desligado se não tiver.
  // A data de saída, se ainda não informada, é preenchida com a data de hoje.
  const funcaoAtual = campos.funcao ?? antes.funcao;
  if (campos.status_funcao === "Inativo" && FUNCOES_EQUIPE.includes(funcaoAtual)) {
    const creciAtual = campos.creci ?? antes.creci;
    campos.funcao = creciAtual ? "Corretor Externo" : "Desligado";
    if (!campos.data_saida && !antes.data_saida) {
      campos.data_saida = new Date();
    }
  }

  const depois = await prisma.parceiros
    .update({
      where: { id },
      data: campos
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "parceiros", entidadeId: id, acao: "editar", erro }));

  await logAlteracao({
    entidadeTipo: "parceiros",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/parceiros/${id}`);
  revalidatePath("/parceiros");
  redirect(`/parceiros/${id}?salvo=1`);
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
  redirect("/parceiros?excluido=1");
}
