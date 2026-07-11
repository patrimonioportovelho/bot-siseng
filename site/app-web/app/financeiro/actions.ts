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
    const valorTotal = valorMonetario(formData, "valor");
    if (!parcelas || parcelas < 1 || !valorTotal) {
      throw new Error("Informe o valor total da dívida e a quantidade de parcelas.");
    }

    const idParcelamento = randomUUID();

    // Divide o valor total em centavos pra não acumular erro de ponto
    // flutuante (ex.: 500 / 3 não fecha exato em decimal) — todas as
    // parcelas ficam iguais e o resto da divisão (poucos centavos) cai na
    // última, garantindo que a soma das parcelas bate exatamente o total
    // informado.
    const totalCentavos = Math.round(valorTotal * 100);
    const baseCentavos = Math.floor(totalCentavos / parcelas);
    const restoCentavos = totalCentavos - baseCentavos * parcelas;

    for (let i = 1; i <= parcelas; i++) {
      // A 1ª parcela usa o Vencimento informado; as seguintes somam 1 mês a
      // cada uma (somarMeses trata 0 mês como "sem soma", por isso a 1ª usa
      // o valor base direto em vez de chamar a função com 0).
      const vencimentoParcelaTexto = i === 1 ? vencimentoBase : somarMeses(vencimentoBase, i - 1) || vencimentoBase;
      const vencimentoParcela = new Date(vencimentoParcelaTexto + "T00:00:00");
      const valorParcela = (baseCentavos + (i === parcelas ? restoCentavos : 0)) / 100;

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

// Exclui de vez uma movimentação (Despesa ou Recebimento) — pedido pra
// corrigir lançamento errado ou duplicado sem deixar rastro no financeiro.
// Não tenta desfazer rateio nem repasse vinculados: se a movimentação for
// uma despesa gerada automaticamente (gerado_automaticamente) ou tiver um
// recebimento/transação ligados, quem exclui deve conferir antes se isso não
// vai deixar outra tela (Rateio, Transação) com referência solta.
export async function excluirMovimentacaoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "movimentacaoId");
  if (!id) throw new Error("Movimentação inválida.");

  const antes = await prisma.movimentacoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Movimentação não encontrada.");

  await prisma.movimentacoes
    .delete({ where: { id } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "movimentacoes", entidadeId: id, acao: "excluir", erro }));

  await logAlteracao({
    entidadeTipo: "movimentacoes",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: antes
  });

  revalidatePath("/financeiro");
  redirect(`/financeiro?tipo=${antes.tipo === "Recebimento" ? "recebimento" : "despesa"}&excluido=1`);
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

// Categoria fixa usada nas despesas geradas pelo rateio — já existe importada
// da planilha legada (ver Cat0021 "Repasse de Honorários Transações" em
// categorias_financeiras, tipo Despesa).
const CATEGORIA_REPASSE_HONORARIO = "Repasse de Honorários Transações";

type LinhaRateio = {
  parte: string;
  parceiro_id: string;
  parceiro_nome: string;
  porcentagem: number;
  valor_final: number;
  desconto: number;
  observacao: string | null;
};

// Gera o rateio de uma transação (Locação ou Compra e Venda) a partir das
// porcentagens já cadastradas nela (porc_honorario, porc_parceria,
// porc_corretor_proprietario, porc_corretor_contraparte) — ver a mesma
// conta em cascata usada em components/transacao-form.tsx (honorário total
// → desconta parceria → resto é rateado entre os corretores). Só roda uma
// vez por transação: cria 1 linha em `pagamentos` + 1 despesa em
// `movimentacoes` (linkada via pagamento_id) por parceiro/corretor
// envolvido. A imobiliária não gera despesa (fica com o valor "em casa").
export async function gerarRateioAction(formData: FormData) {
  await requireAdminSession();

  const transacaoId = texto(formData, "transacao_id");
  const recebimentoId = texto(formData, "recebimento_id");
  const vencimentoTexto = texto(formData, "vencimento");
  const linhasTexto = texto(formData, "linhas");

  if (!transacaoId || !recebimentoId || !vencimentoTexto || !linhasTexto) {
    throw new Error("Dados incompletos para gerar o rateio.");
  }

  let linhas: LinhaRateio[];
  try {
    linhas = JSON.parse(linhasTexto);
  } catch {
    throw new Error("Rateio inválido.");
  }
  if (!Array.isArray(linhas) || linhas.length === 0) {
    throw new Error("Nenhuma linha de rateio informada.");
  }

  // Checagem por recebimento_id (não transacao_id): uma Locação tem N
  // Recebimentos (um por mês) com o mesmo transacao_id, então travar por
  // transação inteira impedia o rateio dos meses seguintes depois do 1°.
  const jaExiste = await prisma.pagamentos.findFirst({ where: { recebimento_id: recebimentoId } });
  if (jaExiste) {
    throw new Error("O rateio desse recebimento já foi gerado.");
  }

  const [categoria, transacao] = await Promise.all([
    prisma.categorias_financeiras.findFirst({ where: { nome: CATEGORIA_REPASSE_HONORARIO, tipo: "Despesa" } }),
    prisma.transacoes.findUnique({ where: { id: transacaoId } })
  ]);
  if (!categoria) throw new Error(`Categoria "${CATEGORIA_REPASSE_HONORARIO}" não encontrada.`);
  if (!transacao) throw new Error("Transação não encontrada.");

  // Valor do honorário é fixo por transação (valor_transacao x porc_honorario)
  // — recalculado aqui a partir do banco, não confiando no valor mandado
  // pelo formulário, igual já é feito nas outras Server Actions do sistema.
  const valorHonorarioTotal = Number(transacao.valor_transacao) * Number(transacao.porc_honorario ?? 0);
  const vencimento = new Date(vencimentoTexto + "T00:00:00");

  const idsCriados: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const linha of linhas) {
      if (!linha.parceiro_id || !(linha.valor_final > 0)) continue;

      const pagamento = await tx.pagamentos.create({
        data: {
          status: "Pendente",
          transacao_id: transacaoId,
          recebimento_id: recebimentoId,
          cliente_id: transacao.cliente_id,
          tipo: transacao.tipo,
          parceiro_id: linha.parceiro_id,
          parte: linha.parte,
          porcentagem: linha.porcentagem,
          desconto: linha.desconto > 0 ? linha.desconto : null,
          observacao: linha.observacao,
          valor_honorario: valorHonorarioTotal,
          valor_parceiro: linha.valor_final
        }
      });

      const movimentacao = await tx.movimentacoes.create({
        data: {
          tipo: "Despesa",
          categoria_id: categoria.id,
          transacao_id: transacaoId,
          parceiro_id: linha.parceiro_id,
          pagamento_id: pagamento.id,
          descricao: `Repasse de honorário — ${linha.parte} — ${linha.parceiro_nome}`,
          valor: linha.valor_final,
          vencimento,
          pago: false,
          gerado_automaticamente: true
        }
      });

      idsCriados.push(movimentacao.id);
    }
  });

  if (idsCriados.length === 0) {
    throw new Error("Nenhuma linha válida para gerar o rateio (confira parceiro e valor de cada uma).");
  }

  await logAlteracao({
    entidadeTipo: "pagamentos",
    entidadeId: transacaoId,
    acao: "criar",
    dadosDepois: { transacao_id: transacaoId, quantidade: idsCriados.length }
  });

  revalidatePath(`/financeiro/${recebimentoId}`);
  revalidatePath("/financeiro");
  redirect(`/financeiro/${recebimentoId}?rateio=1`);
}
