"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireAdm, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal, percentualParaDecimal } from "@/lib/format";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function inteiro(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function valorMonetario(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return valorEditavelParaDecimal(t);
}

function percentual(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return percentualParaDecimal(t);
}

function booleano(formData: FormData, campo: string): boolean {
  return formData.get(campo) === "on" || formData.get(campo) === "true";
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Id sequencial (ADM-0001, ADM-0002, ...) gerado só para administrações novas
// cadastradas pelo site — os registros importados da planilha legada usam o
// id_legado original do AppSheet. Esse Id é o identificador usado no dia a
// dia (inclusive para localizar a administração certa na hora de gerar o
// contrato), já que o uuid interno não é fácil de reconhecer visualmente.
async function gerarProximoId(): Promise<string> {
  const registros = await prisma.adm_imoveis.findMany({
    where: { id_legado: { startsWith: "ADM-" } },
    select: { id_legado: true }
  });

  let maior = 0;
  for (const r of registros) {
    const n = Number(r.id_legado?.replace("ADM-", ""));
    if (Number.isFinite(n) && n > maior) maior = n;
  }

  return `ADM-${String(maior + 1).padStart(4, "0")}`;
}

function camposEditaveis(formData: FormData) {
  return {
    loja_id: texto(formData, "loja_id") ?? undefined,
    cliente_id: texto(formData, "cliente_id") ?? undefined,
    imovel_id: texto(formData, "imovel_id") ?? undefined,
    parceiro_id: texto(formData, "parceiro_id"),
    status: texto(formData, "status") ?? undefined,
    data_entrada: data(formData, "data_entrada"),
    data_assinatura: data(formData, "data_assinatura"),
    prazo_contrato_meses: inteiro(formData, "prazo_contrato_meses"),
    valor_transacao: valorMonetario(formData, "valor_transacao"),
    porc_honorario: percentual(formData, "porc_honorario"),
    tx_administracao: percentual(formData, "tx_administracao"),
    valor_cliente: valorMonetario(formData, "valor_cliente"),
    valor_administracao: valorMonetario(formData, "valor_administracao"),
    iptu: valorMonetario(formData, "iptu"),
    tem_vistoria: booleano(formData, "tem_vistoria"),
    arquivo_vistoria_url: texto(formData, "arquivo_vistoria_url"),
    tem_condominio: booleano(formData, "tem_condominio"),
    condominio: valorMonetario(formData, "condominio"),
    agua: texto(formData, "agua"),
    uc_caerd: texto(formData, "uc_caerd"),
    energia: texto(formData, "energia"),
    uc_energisa: texto(formData, "uc_energisa"),
    observacao: texto(formData, "observacao"),
    pasta_url: texto(formData, "pasta_url"),
    updated_at: new Date()
  };
}

export async function criarAdministracaoAction(formData: FormData) {
  await requireAdminSession();

  const lojaId = texto(formData, "loja_id");
  const clienteId = texto(formData, "cliente_id");
  const imovelId = texto(formData, "imovel_id");
  if (!lojaId || !clienteId || !imovelId) {
    throw new Error("Loja, cliente (proprietário) e imóvel são obrigatórios.");
  }

  const idLegado = await gerarProximoId();

  const novo = await prisma.adm_imoveis.create({
    data: {
      ...camposEditaveis(formData),
      loja_id: lojaId,
      cliente_id: clienteId,
      imovel_id: imovelId,
      id_legado: idLegado,
      status: texto(formData, "status") ?? "Captação"
    }
  });

  await logAlteracao({
    entidadeTipo: "adm_imoveis",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { id_legado: novo.id_legado, status: novo.status }
  });

  revalidatePath("/administracoes");
  redirect(`/administracoes/${novo.id}?salvo=1`);
}

export async function atualizarAdministracaoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "administracaoId");
  if (!id) throw new Error("Administração inválida.");

  const antes = await prisma.adm_imoveis.findUnique({ where: { id } });
  if (!antes) throw new Error("Administração não encontrada.");

  const depois = await prisma.adm_imoveis.update({
    where: { id },
    data: camposEditaveis(formData)
  });

  await logAlteracao({
    entidadeTipo: "adm_imoveis",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/administracoes/${id}`);
  revalidatePath("/administracoes");
  redirect(`/administracoes/${id}?salvo=1`);
}

// "Apagar" aqui é sempre um soft-delete (excluido=true) — a administração
// costuma ter histórico real vinculado (transações, documentos gerados) e
// um DELETE de verdade quebraria essas referências. Só ADM pode fazer isso.
export async function apagarAdministracaoAction(formData: FormData) {
  const admin = await requireAdm();

  const id = texto(formData, "administracaoId");
  if (!id) throw new Error("Administração inválida.");

  const antes = await prisma.adm_imoveis.findUnique({ where: { id } });
  if (!antes) throw new Error("Administração não encontrada.");

  await prisma.adm_imoveis.update({
    where: { id },
    data: { excluido: true, updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "adm_imoveis",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { status: antes.status },
    dadosDepois: { excluido: true, excluido_por: admin.nome }
  });

  revalidatePath("/administracoes");
  redirect("/administracoes?excluido=1");
}
