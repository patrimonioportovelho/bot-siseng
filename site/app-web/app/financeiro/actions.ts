"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal, somarMeses } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";

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

function booleano(formData: FormData, campo: string): boolean {
  return formData.get(campo) === "on" || formData.get(campo) === "true";
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

// Cadastro de uma nova movimentação (Despesa ou Recebimento). À vista gera
// uma única linha; Parcelado gera N linhas (uma por parcela), cada uma 1 mês
// depois da anterior a partir do Vencimento informado — ex.: vencimento
// 07/07 com 12 parcelas gera 07/07, 07/08, 07/09 ... até a 12ª.
export async function criarMovimentacaoAction(formData: FormData) {
  await requireAdminSession();

  const tipo = texto(formData, "tipo");
  const categoriaId = texto(formData, "categoria_id");
  const vencimentoBase = texto(formData, "vencimento");
  const formaPagamento = texto(formData, "forma_pagamento") ?? "À vista";

  if (!tipo || !categoriaId || !vencimentoBase) {
    throw new Error("Tipo, categoria e vencimento são obrigatórios.");
  }

  const base = {
    tipo,
    categoria_id: categoriaId,
    cliente_interessado_id: texto(formData, "cliente_interessado_id"),
    cliente_proprietario_id: texto(formData, "cliente_proprietario_id"),
    parceiro_id: texto(formData, "parceiro_id"),
    transacao_id: texto(formData, "transacao_id"),
    descricao: texto(formData, "descricao"),
    comprovante_url: texto(formData, "comprovante_url"),
    forma_pagamento: formaPagamento
  };

  const idsCriados: string[] = [];

  if (formaPagamento === "Parcelado") {
    const parcelas = inteiro(formData, "parcelas");
    const valorParcela = valorMonetario(formData, "valor_parcela");
    if (!parcelas || parcelas < 1 || !valorParcela) {
      throw new Error("Informe a quantidade de parcelas e o valor de cada parcela.");
    }

    const idParcelamento = randomUUID();

    for (let i = 1; i <= parcelas; i++) {
      // A 1ª parcela usa o Vencimento informado; as seguintes somam 1 mês a
      // cada uma (somarMeses trata 0 mês como "sem soma", por isso a 1ª usa
      // o valor base direto em vez de chamar a função com 0).
      const vencimentoParcelaTexto = i === 1 ? vencimentoBase : somarMeses(vencimentoBase, i - 1) || vencimentoBase;
      const vencimentoParcela = new Date(vencimentoParcelaTexto + "T00:00:00");

      const criada = await prisma.movimentacoes
        .create({
          data: {
            ...base,
            valor: valorParcela,
            vencimento: vencimentoParcela,
            parcelas,
            num_parcela: i,
            id_parcelamento: idParcelamento,
            pago: false
          }
        })
        .catch((erro) => registrarEJogarErro({ entidadeTipo: "movimentacoes", acao: "criar", erro }));
      idsCriados.push(criada.id);
    }
  } else {
    const valor = valorMonetario(formData, "valor");
    if (!valor) throw new Error("Informe o valor.");
    const pago = booleano(formData, "pago");
    const dataPagamento = pago ? data(formData, "data_pagamento") : null;

    const criada = await prisma.movimentacoes
      .create({
        data: {
          ...base,
          valor,
          vencimento: new Date(vencimentoBase + "T00:00:00"),
          pago,
          data_pagamento: dataPagamento
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "movimentacoes", acao: "criar", erro }));
    idsCriados.push(criada.id);
  }

  await logAlteracao({
    entidadeTipo: "movimentacoes",
    entidadeId: idsCriados[0],
    acao: "criar",
    dadosDepois: { tipo, categoria_id: categoriaId, quantidade: idsCriados.length }
  });

  revalidatePath("/financeiro");
  redirect(`/financeiro?tipo=${tipo === "Recebimento" ? "recebimento" : "despesa"}&salvo=1`);
}

function camposEditaveis(formData: FormData) {
  const pago = booleano(formData, "pago");
  return {
    categoria_id: texto(formData, "categoria_id") ?? undefined,
    cliente_interessado_id: texto(formData, "cliente_interessado_id"),
    cliente_proprietario_id: texto(formData, "cliente_proprietario_id"),
    parceiro_id: texto(formData, "parceiro_id"),
    descricao: texto(formData, "descricao"),
    comprovante_url: texto(formData, "comprovante_url"),
    valor: valorMonetario(formData, "valor") ?? undefined,
    vencimento: data(formData, "vencimento") ?? undefined,
    pago,
    data_pagamento: pago ? data(formData, "data_pagamento") : null,
    updated_at: new Date()
  };
}

export async function atualizarMovimentacaoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "movimentacaoId");
  if (!id) throw new Error("Movimentação inválida.");

  const antes = await prisma.movimentacoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Movimentação não encontrada.");

  const depois = await prisma.movimentacoes
    .update({ where: { id }, data: camposEditaveis(formData) })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "movimentacoes", entidadeId: id, acao: "editar", erro }));

  await logAlteracao({
    entidadeTipo: "movimentacoes",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/financeiro/${id}`);
  revalidatePath("/financeiro");
  redirect(`/financeiro/${id}?salvo=1`);
}

// Marca/desmarca como Pago-Recebido direto da lista ou do detalhe, sem abrir
// o formulário de edição inteiro — usado no botão rápido "Marcar como pago".
export async function marcarPagoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "movimentacaoId");
  if (!id) throw new Error("Movimentação inválida.");

  const antes = await prisma.movimentacoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Movimentação não encontrada.");

  const pago = !antes.pago;
  const dataPagamentoTexto = texto(formData, "data_pagamento");
  const dataPagamento = pago ? (dataPagamentoTexto ? data(formData, "data_pagamento") : new Date()) : null;

  await prisma.movimentacoes.update({
    where: { id },
    data: { pago, data_pagamento: dataPagamento, updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "movimentacoes",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { pago: antes.pago },
    dadosDepois: { pago }
  });

  revalidatePath(`/financeiro/${id}`);
  revalidatePath("/financeiro");
  redirect(`/financeiro/${id}?salvo=1`);
}
