"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { registrarEJogarErro } from "@/lib/erros";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// Telefone e CPF são digitados com máscara mas gravados só com dígitos,
// mesmo padrão usado no resto da base (ver app/parceiros/actions.ts).
function somenteDigitos(formData: FormData, campo: string): string | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = t.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

function decimal(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function booleano(formData: FormData, campo: string): boolean {
  return formData.get(campo) === "on" || formData.get(campo) === "true";
}

// ==================== Avaliação ====================

function camposAvaliacao(formData: FormData) {
  return {
    tipo_avaliacao: texto(formData, "tipo_avaliacao"),
    banco_id: texto(formData, "banco_id"),
    status: texto(formData, "status") ?? undefined,
    data_avaliacao: data(formData, "data_avaliacao"),
    cliente_id: texto(formData, "cliente_id"),
    telefone: somenteDigitos(formData, "telefone"),
    cpf: somenteDigitos(formData, "cpf"),
    parceiro_id: texto(formData, "parceiro_id"),
    data_validade: data(formData, "data_validade"),
    tipo_imovel: texto(formData, "tipo_imovel"),
    produto: texto(formData, "produto"),
    tabela: texto(formData, "tabela"),
    indexador: texto(formData, "indexador"),
    valor_aprovado: decimal(formData, "valor_aprovado"),
    valor_financiamento: decimal(formData, "valor_financiamento"),
    prestacao: decimal(formData, "prestacao"),
    usa_fgts: booleano(formData, "usa_fgts"),
    valor_fgts: decimal(formData, "valor_fgts"),
    usa_subsidio: booleano(formData, "usa_subsidio"),
    valor_subsidio: decimal(formData, "valor_subsidio"),
    imagem_consulta_url: texto(formData, "imagem_consulta_url"),
    observacao: texto(formData, "observacao"),
    updated_at: new Date()
  };
}

export async function criarAvaliacaoAction(formData: FormData) {
  await requireAdminSession();

  const campos = camposAvaliacao(formData);
  if (!campos.cliente_id && !campos.cpf) {
    throw new Error("Selecione o cliente ou informe ao menos o CPF pra identificar a avaliação.");
  }

  const novo = await prisma.avaliacoes
    .create({ data: { ...campos, status: campos.status ?? "Montagem de processo" } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "avaliacoes", acao: "criar", erro }));

  await logAlteracao({
    entidadeTipo: "avaliacoes",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { cliente_id: novo.cliente_id, status: novo.status }
  });

  revalidatePath("/financiamento");
  redirect(`/financiamento/${novo.id}?salvo=1`);
}

export async function atualizarAvaliacaoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "avaliacaoId");
  if (!id) throw new Error("Avaliação inválida.");

  const antes = await prisma.avaliacoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Avaliação não encontrada.");

  const campos = camposAvaliacao(formData);

  const depois = await prisma.avaliacoes
    .update({ where: { id }, data: campos })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "avaliacoes", entidadeId: id, acao: "editar", erro }));

  await logAlteracao({
    entidadeTipo: "avaliacoes",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/financiamento/${id}`);
  revalidatePath("/financiamento");
  redirect(`/financiamento/${id}?salvo=1`);
}

// ==================== Andamento ====================

function camposAndamento(formData: FormData) {
  return {
    data_inicio: data(formData, "data_inicio"),
    cliente_vendedor_id: texto(formData, "cliente_vendedor_id"),
    abrir_conta: booleano(formData, "abrir_conta"),
    imovel_id: texto(formData, "imovel_id"),
    tipo_contrato: texto(formData, "tipo_contrato"),
    status_andamento: texto(formData, "status_andamento") ?? undefined,
    status_andamento_complementar: texto(formData, "status_andamento_complementar"),
    processo: texto(formData, "processo"),
    valor_avaliado: decimal(formData, "valor_avaliado"),
    valor_venda: decimal(formData, "valor_venda"),
    tem_entrada: booleano(formData, "tem_entrada"),
    valor_recurso: decimal(formData, "valor_recurso"),
    valor_fgts: decimal(formData, "valor_fgts"),
    subsidio: decimal(formData, "subsidio"),
    valor_financiado: decimal(formData, "valor_financiado"),
    observacao: texto(formData, "observacao"),
    data_conclusao: data(formData, "data_conclusao"),
    updated_at: new Date()
  };
}

// Regra herdada do sistema antigo (Apps Script "andamento.txt"): quando o
// Andamento entra em "Concluído", a Avaliação vinculada acompanha
// automaticamente — é assim que as duas "andam juntas" no fechamento do
// processo, sem precisar editar as duas fichas separadamente. Só mexe nesse
// sentido (Andamento concluído → Avaliação concluída); não desfaz sozinho se
// o Andamento for reaberto depois, pra não reabrir uma avaliação que o
// administrativo já tratou como encerrada por outro motivo.
async function sincronizarStatusAvaliacao(avaliacaoId: string, statusAndamento: string | undefined) {
  if (statusAndamento !== "Concluído") return;
  const avaliacao = await prisma.avaliacoes.findUnique({ where: { id: avaliacaoId }, select: { status: true } });
  if (!avaliacao || avaliacao.status === "Concluído") return;
  await prisma.avaliacoes.update({ where: { id: avaliacaoId }, data: { status: "Concluído", updated_at: new Date() } });
}

export async function criarAndamentoAction(formData: FormData) {
  await requireAdminSession();

  const avaliacaoId = texto(formData, "avaliacaoId");
  if (!avaliacaoId) throw new Error("Avaliação inválida.");

  const campos = camposAndamento(formData);

  const novo = await prisma.andamentos
    .create({ data: { avaliacao_id: avaliacaoId, ...campos, status_andamento: campos.status_andamento ?? "Pendente" } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "andamentos", acao: "criar", erro }));

  await sincronizarStatusAvaliacao(avaliacaoId, novo.status_andamento);

  await logAlteracao({
    entidadeTipo: "andamentos",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { avaliacao_id: avaliacaoId, status_andamento: novo.status_andamento }
  });

  revalidatePath(`/financiamento/${avaliacaoId}`);
  revalidatePath("/financiamento");
  redirect(`/financiamento/${avaliacaoId}?salvo=1`);
}

export async function atualizarAndamentoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "andamentoId");
  if (!id) throw new Error("Andamento inválido.");

  const antes = await prisma.andamentos.findUnique({ where: { id } });
  if (!antes) throw new Error("Andamento não encontrado.");

  const campos = camposAndamento(formData);

  const depois = await prisma.andamentos
    .update({ where: { id }, data: campos })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "andamentos", entidadeId: id, acao: "editar", erro }));

  await sincronizarStatusAvaliacao(antes.avaliacao_id, depois.status_andamento);

  await logAlteracao({
    entidadeTipo: "andamentos",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/financiamento/${antes.avaliacao_id}`);
  revalidatePath("/financiamento");
  redirect(`/financiamento/${antes.avaliacao_id}?salvo=1`);
}

// ==================== Lançamentos ====================

// Lançamentos (parcelas de remuneração do financiamento) são editados como
// uma lista inteira de uma vez só — mesmo padrão de
// sincronizarCondicoesPagamento (app/portal/compra-venda/actions.ts): quem
// não veio mais no array enviado é apagado, quem veio com id é atualizado,
// quem veio sem id é criado. Evita precisar de uma Server Action separada
// pra cada linha só pra adicionar/remover/editar um lançamento.
export async function sincronizarLancamentosAction(formData: FormData) {
  await requireAdminSession();

  const andamentoId = texto(formData, "andamentoId");
  if (!andamentoId) throw new Error("Andamento inválido.");

  const andamento = await prisma.andamentos.findUnique({ where: { id: andamentoId }, select: { avaliacao_id: true } });
  if (!andamento) throw new Error("Andamento não encontrado.");

  const bruto = texto(formData, "lancamentosJson");
  let lista: Array<Record<string, unknown>> = [];
  if (bruto) {
    try {
      const parsed = JSON.parse(bruto);
      if (Array.isArray(parsed)) lista = parsed;
    } catch {
      lista = [];
    }
  }

  const linhas = lista.map((l) => {
    const valorTxt = String(l.valor_financiado ?? "").trim();
    const remuneracaoTxt = String(l.remuneracao ?? "").trim();
    const dataTxt = String(l.data_pagamento ?? "").trim();
    const dataPagamento = dataTxt ? new Date(dataTxt) : null;
    return {
      id: typeof l.id === "string" && l.id.length > 0 ? l.id : null,
      valor_financiado: valorTxt ? Number(valorTxt.replace(/\./g, "").replace(",", ".")) : null,
      remuneracao: remuneracaoTxt ? Number(remuneracaoTxt.replace(/\./g, "").replace(",", ".")) : null,
      status: String(l.status ?? "Previsão").trim() || "Previsão",
      data_pagamento: dataPagamento && !Number.isNaN(dataPagamento.getTime()) ? dataPagamento : null
    };
  });

  const existentes = await prisma.lancamentos_financiamento.findMany({
    where: { andamento_id: andamentoId },
    select: { id: true }
  });
  const idsEnviados = new Set(linhas.map((l) => l.id).filter((id): id is string => Boolean(id)));
  const idsParaApagar = existentes.filter((e) => !idsEnviados.has(e.id)).map((e) => e.id);

  if (idsParaApagar.length > 0) {
    await prisma.lancamentos_financiamento.deleteMany({ where: { id: { in: idsParaApagar } } });
  }

  for (const l of linhas) {
    if (l.id) {
      await prisma.lancamentos_financiamento
        .update({
          where: { id: l.id },
          data: {
            valor_financiado: l.valor_financiado,
            remuneracao: l.remuneracao,
            status: l.status,
            data_pagamento: l.data_pagamento
          }
        })
        .catch((erro) => registrarEJogarErro({ entidadeTipo: "lancamentos_financiamento", entidadeId: l.id!, acao: "editar", erro }));
    } else {
      await prisma.lancamentos_financiamento
        .create({
          data: {
            andamento_id: andamentoId,
            valor_financiado: l.valor_financiado,
            remuneracao: l.remuneracao,
            status: l.status,
            data_pagamento: l.data_pagamento
          }
        })
        .catch((erro) => registrarEJogarErro({ entidadeTipo: "lancamentos_financiamento", acao: "criar", erro }));
    }
  }

  await logAlteracao({
    entidadeTipo: "lancamentos_financiamento",
    entidadeId: andamentoId,
    acao: "sincronizar",
    dadosDepois: { total: linhas.length }
  });

  revalidatePath(`/financiamento/${andamento.avaliacao_id}`);
  redirect(`/financiamento/${andamento.avaliacao_id}?salvo=1`);
}
