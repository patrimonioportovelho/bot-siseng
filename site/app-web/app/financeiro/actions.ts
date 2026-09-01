"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal, somarMeses, formatMoeda, hojePortoVelho } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { saldoDevido } from "@/lib/financeiro/pagamentos-pix";
import {
  ehStatusPagamento,
  transicaoValida,
  mensagemTransicaoInvalida,
  autoConferirRepassesDoRecebimento,
  reverterAutoConferirRepasses
} from "@/lib/financeiro/status-pagamento";
import { mensagemDeErro as mensagemDe } from "@/lib/forms/resultado";

// Deriva os 4 campos de status (status_pagamento + espelho `pago` + metadados)
// a partir de um alvo. quemFez = parceiro que fez a ação (Conferir/Pagar); em
// auto-conferir passa null. Usado por criar/atualizar/marcarStatus.
function camposDeStatusPagamento(alvo: string, quemFezId: string | null) {
  const agora = new Date();
  if (alvo === "Pago") {
    return {
      status_pagamento: "Pago",
      pago: true,
      data_pagamento: hojePortoVelho(),
      conferido_em: agora,
      conferido_por_parceiro_id: quemFezId,
      pago_por_parceiro_id: quemFezId
    };
  }
  if (alvo === "Conferido") {
    return {
      status_pagamento: "Conferido",
      pago: false,
      data_pagamento: null,
      conferido_em: agora,
      conferido_por_parceiro_id: quemFezId,
      pago_por_parceiro_id: null
    };
  }
  return {
    status_pagamento: "Pendente",
    pago: false,
    data_pagamento: null,
    conferido_em: null,
    conferido_por_parceiro_id: null,
    pago_por_parceiro_id: null
  };
}

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

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

// Cadastro de uma nova movimentação (Despesa ou Recebimento). À vista gera
// uma única linha; Parcelado gera N linhas dividindo o Valor total em N
// pedaços (uma por parcela, 1 mês depois da anterior a partir do Vencimento
// informado — ex.: vencimento 07/07 com 12 parcelas gera 07/07, 07/08,
// 07/09 ... até a 12ª); Recorrente gera N linhas também mensais, mas
// repetindo o mesmo Valor em cada uma (sem dividir) — pra cobrança fixa que
// se repete por vários meses.
// Gold Standard de tratamento de erro (ver lib/forms/resultado.ts): retorna
// { erro } em vez de lançar, pro erro aparecer inline no formulário sem
// apagar o que foi digitado. registrarEJogarErro continua gravando tudo no
// logs_erro antes.
import type { ResultadoFormulario } from "@/lib/forms/resultado";
export type { ResultadoFormulario } from "@/lib/forms/resultado";

export async function criarMovimentacaoAction(_prev: unknown, formData: FormData): Promise<ResultadoFormulario> {
  const sessao = await requireAdminSession();

  const tipo = texto(formData, "tipo");
  const categoriaId = texto(formData, "categoria_id");
  const vencimentoBase = texto(formData, "vencimento");
  const formaPagamento = texto(formData, "forma_pagamento") ?? "À vista";

  if (!tipo || !categoriaId || !vencimentoBase) {
    return { erro: "Tipo, categoria e vencimento são obrigatórios." };
  }

  const parceiroId = texto(formData, "parceiro_id");

  // Achado de auditoria (31/08/2026, caso CV-0015): dava pra lançar uma
  // Despesa de "Repasse de Honorários Transações" manualmente sem
  // escolher o parceiro (corretor) — a despesa era criada com valor e sem
  // dono, e como o rateio automático (gerarRateioAction) não passa por
  // aqui, nada mais no sistema pegava esse caso. Essa despesa "órfã" nunca
  // entrava no ranking/Dashboard de ninguém. Único ponto por onde todo
  // lançamento manual de movimentação passa — bloqueado aqui.
  if (tipo === "Despesa") {
    const categoria = await prisma.categorias_financeiras.findUnique({
      where: { id: categoriaId },
      select: { nome: true }
    });
    if (categoria?.nome === "Repasse de Honorários Transações" && !parceiroId) {
      return { erro: "Repasse de honorário precisa de um parceiro (corretor) vinculado — selecione antes de salvar." };
    }
  }

  const base = {
    tipo,
    categoria_id: categoriaId,
    cliente_interessado_id: texto(formData, "cliente_interessado_id"),
    cliente_proprietario_id: texto(formData, "cliente_proprietario_id"),
    parceiro_id: parceiroId,
    transacao_id: texto(formData, "transacao_id"),
    descricao: texto(formData, "descricao"),
    comprovante_url: texto(formData, "comprovante_url"),
    forma_pagamento: formaPagamento
  };

  const idsCriados: string[] = [];

  try {
  if (formaPagamento === "Parcelado") {
    const parcelas = inteiro(formData, "parcelas");
    const valorTotal = valorMonetario(formData, "valor");
    if (!parcelas || parcelas < 1 || !valorTotal) {
      return { erro: "Informe o valor total da dívida e a quantidade de parcelas." };
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
  } else if (formaPagamento === "Recorrente") {
    // Diferente do Parcelado acima (que DIVIDE um valor total em N pedaços),
    // a Recorrência REPETE o mesmo Valor informado em cada uma das N
    // ocorrências — ex.: uma taxa fixa de R$ 50 lançada todo mês por 12
    // meses. Mesma cadência mensal e o mesmo agrupamento por id_parcelamento
    // do Parcelado, só sem a conta de divisão/resto.
    const repeticoes = inteiro(formData, "parcelas");
    const valorUnico = valorMonetario(formData, "valor");
    if (!repeticoes || repeticoes < 1 || !valorUnico) {
      return { erro: "Informe o valor e a quantidade de meses." };
    }

    const idParcelamento = randomUUID();

    for (let i = 1; i <= repeticoes; i++) {
      const vencimentoOcorrenciaTexto = i === 1 ? vencimentoBase : somarMeses(vencimentoBase, i - 1) || vencimentoBase;
      const vencimentoOcorrencia = new Date(vencimentoOcorrenciaTexto + "T00:00:00");

      const criada = await prisma.movimentacoes
        .create({
          data: {
            ...base,
            valor: valorUnico,
            vencimento: vencimentoOcorrencia,
            parcelas: repeticoes,
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
    if (!valor) return { erro: "Informe o valor." };
    // Situação inicial: o formulário manda status_pagamento (Pendente/
    // Conferido/Pago). Na criação as 3 são livres — quem cadastra está
    // dizendo explicitamente em que pé a conta está (a trava "conferir antes
    // de pagar" vale só pra mudar o status de uma movimentação já existente).
    const statusInicial = texto(formData, "status_pagamento") ?? "Pendente";
    if (!ehStatusPagamento(statusInicial)) return { erro: "Situação de pagamento inválida." };
    const campos = camposDeStatusPagamento(statusInicial, sessao.parceiroId);

    const criada = await prisma.movimentacoes
      .create({
        data: {
          ...base,
          valor,
          vencimento: new Date(vencimentoBase + "T00:00:00"),
          ...campos
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
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }

  revalidatePath("/financeiro");
  redirect(`/financeiro?tipo=${tipo === "Recebimento" ? "recebimento" : "despesa"}&salvo=1`);
}

function camposEditaveis(formData: FormData) {
  return {
    categoria_id: texto(formData, "categoria_id") ?? undefined,
    cliente_interessado_id: texto(formData, "cliente_interessado_id"),
    cliente_proprietario_id: texto(formData, "cliente_proprietario_id"),
    parceiro_id: texto(formData, "parceiro_id"),
    descricao: texto(formData, "descricao"),
    comprovante_url: texto(formData, "comprovante_url"),
    valor: valorMonetario(formData, "valor") ?? undefined,
    vencimento: data(formData, "vencimento") ?? undefined,
    updated_at: new Date()
  };
}

export async function atualizarMovimentacaoAction(_prev: unknown, formData: FormData): Promise<ResultadoFormulario> {
  const sessao = await requireAdminSession();

  const id = texto(formData, "movimentacaoId");
  if (!id) return { erro: "Movimentação inválida." };

  const antes = await prisma.movimentacoes.findUnique({ where: { id } });
  if (!antes) return { erro: "Movimentação não encontrada." };

  const campos = camposEditaveis(formData);

  // A situação de pagamento normalmente é mudada pelos botões do detalhe
  // (atualizarStatusPagamentoAction). Este formulário não manda mais
  // status_pagamento — mas se mandar (compat.), só anda uma etapa por vez e
  // NÃO mexe nos metadados (quem conferiu/pagou) quando o status não muda.
  const alvoStatus = texto(formData, "status_pagamento") ?? antes.status_pagamento;
  if (!ehStatusPagamento(alvoStatus)) return { erro: "Situação de pagamento inválida." };
  const statusMudou = alvoStatus !== antes.status_pagamento;
  if (statusMudou && !transicaoValida(antes.status_pagamento, alvoStatus)) {
    return { erro: mensagemTransicaoInvalida(antes.status_pagamento, alvoStatus, antes.tipo) };
  }
  const camposStatus = statusMudou ? camposDeStatusPagamento(alvoStatus, sessao.parceiroId) : {};
  if (
    statusMudou &&
    alvoStatus === "Pago" &&
    antes.status_pagamento === "Conferido" &&
    antes.conferido_por_parceiro_id
  ) {
    (camposStatus as Record<string, unknown>).conferido_por_parceiro_id = antes.conferido_por_parceiro_id;
    (camposStatus as Record<string, unknown>).conferido_em = antes.conferido_em ?? new Date();
  }

  // Mesma trava de criarMovimentacaoAction (achado de auditoria de
  // 31/08/2026) — aqui pro caso de editar uma Despesa de repasse já
  // vinculada e sem querer limpar o parceiro.
  if (antes.tipo === "Despesa") {
    const categoriaIdFinal = campos.categoria_id ?? antes.categoria_id;
    const categoria = await prisma.categorias_financeiras.findUnique({
      where: { id: categoriaIdFinal },
      select: { nome: true }
    });
    if (categoria?.nome === "Repasse de Honorários Transações" && !campos.parceiro_id) {
      return { erro: "Repasse de honorário precisa de um parceiro (corretor) vinculado — selecione antes de salvar." };
    }
  }

  try {
    const depois = await prisma.$transaction(async (tx) => {
      const atualizada = await tx.movimentacoes.update({
        where: { id },
        data: { ...campos, ...camposStatus }
      });
      if (statusMudou) {
        await sincronizarEfeitosStatus(tx as unknown as Prisma.TransactionClient, antes, alvoStatus);
      }
      return atualizada;
    });

    await logAlteracao({
      entidadeTipo: "movimentacoes",
      entidadeId: id,
      acao: "editar",
      dadosAntes: antes,
      dadosDepois: depois
    });
  } catch (erro) {
    await registrarEJogarErro({ entidadeTipo: "movimentacoes", entidadeId: id, acao: "editar", erro }).catch(
      () => undefined
    );
    return { erro: mensagemDe(erro) };
  }

  revalidatePath(`/financeiro/${id}`);
  revalidatePath("/financeiro");
  redirect(`/financeiro/${id}?salvo=1`);
}

// Efeitos colaterais de uma mudança de status_pagamento, sempre dentro da
// mesma transação da atualização da movimentação:
//  - repasse de honorário (Despesa com pagamento_id) que chega em "Pago" ->
//    a linha em `pagamentos` também vira status "Pago" (antes ficava parada
//    em "Pendente" pra sempre, o que deixava o pago_direto travado em "a
//    receber" no Dashboard); sai de "Pago" -> volta pra "Pendente".
//  - Recebimento que chega em "Pago" -> auto-confere os repasses ligados;
//    sai de "Pago" -> desfaz só os que tinham sido conferidos automaticamente.
async function sincronizarEfeitosStatus(
  tx: Prisma.TransactionClient,
  antes: { id: string; tipo: string; pagamento_id: string | null; status_pagamento: string },
  alvo: string
) {
  const eraPago = antes.status_pagamento === "Pago";
  const viraPago = alvo === "Pago";

  if (antes.pagamento_id && antes.tipo === "Despesa" && eraPago !== viraPago) {
    await tx.pagamentos.update({
      where: { id: antes.pagamento_id },
      data: viraPago
        ? { status: "Pago", data_recebimento: hojePortoVelho() }
        : { status: "Pendente", data_recebimento: null }
    });
  }

  if (antes.tipo === "Recebimento" && !eraPago && viraPago) {
    await autoConferirRepassesDoRecebimento(tx, antes.id);
  } else if (antes.tipo === "Recebimento" && eraPago && !viraPago) {
    await reverterAutoConferirRepasses(tx, antes.id);
  }
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
  const voltarPara = id ? `/financeiro/${id}` : "/financeiro";
  let tipoMovimentacao: string | null = null;

  try {
    if (!id) throw new Error("Movimentação inválida.");

    const antes = await prisma.movimentacoes.findUnique({
      where: { id },
      include: { pagamentos: { select: { id: true, pago_direto: true } } }
    });
    if (!antes) throw new Error("Movimentação não encontrada.");
    tipoMovimentacao = antes.tipo;

    // Se é uma Despesa de repasse gerada pelo rateio (tem pagamento_id e NÃO é
    // "pago direto"), apaga a linha de `pagamentos` junto — senão o rateio
    // fica "meio gerado": a Despesa some mas o `pagamentos` continua, e o
    // gerarRateioAction bloqueia regerar pra sempre (jaExiste). Só faz isso
    // pro par 1:1 despesa<->pagamento não-direto (pago_direto não tem Despesa).
    const pagamentoLigado = antes.pagamentos && !antes.pagamentos.pago_direto ? antes.pagamentos.id : null;

    await prisma.$transaction(async (tx) => {
      await tx.movimentacoes.delete({ where: { id } });
      if (pagamentoLigado) {
        await tx.pagamentos.delete({ where: { id: pagamentoLigado } });
      }
    });

    await logAlteracao({
      entidadeTipo: "movimentacoes",
      entidadeId: id,
      acao: "excluir",
      dadosAntes: antes,
      dadosDepois: pagamentoLigado ? { pagamento_rateio_removido: pagamentoLigado } : undefined
    });
  } catch (erro) {
    await registrarEJogarErro({ entidadeTipo: "movimentacoes", entidadeId: id ?? null, acao: "excluir", erro }).catch(
      () => undefined
    );
    redirect(`${voltarPara}?erro=${encodeURIComponent(mensagemDe(erro))}`);
  }

  revalidatePath("/financeiro");
  redirect(`/financeiro?tipo=${tipoMovimentacao === "Recebimento" ? "recebimento" : "despesa"}&excluido=1`);
}

// Move o status de pagamento de uma movimentação uma etapa por vez, direto do
// detalhe (botões "Conferir" / "Marcar como pago" / "Desfazer"). Substituiu o
// antigo marcarPagoAction (toggle pago true/false). Regras:
//  - só anda uma etapa (transicaoValida) — Pendente -> Pago direto é barrado;
//  - Conferir grava quem conferiu + quando; Pagar grava quem pagou;
//  - efeitos colaterais (pagamentos.status, auto-conferir repasse) em
//    sincronizarEfeitosStatus, na mesma transação.
export async function atualizarStatusPagamentoAction(formData: FormData) {
  const sessao = await requireAdminSession();

  const id = texto(formData, "movimentacaoId");
  const alvo = texto(formData, "alvo");
  const voltarPara = id ? `/financeiro/${id}` : "/financeiro";

  try {
    if (!id) throw new Error("Movimentação inválida.");
    if (!alvo || !ehStatusPagamento(alvo)) throw new Error("Situação de pagamento inválida.");

    const antes = await prisma.movimentacoes.findUnique({
      where: { id },
      select: { id: true, tipo: true, pagamento_id: true, status_pagamento: true, conferido_por_parceiro_id: true, conferido_em: true }
    });
    if (!antes) throw new Error("Movimentação não encontrada.");

    if (!transicaoValida(antes.status_pagamento, alvo)) {
      throw new Error(mensagemTransicaoInvalida(antes.status_pagamento, alvo, antes.tipo));
    }

    const camposStatus = camposDeStatusPagamento(alvo, sessao.parceiroId);
    // Pagar não "rouba" a autoria da conferência de quem já tinha conferido.
    if (alvo === "Pago" && antes.status_pagamento === "Conferido" && antes.conferido_por_parceiro_id) {
      camposStatus.conferido_por_parceiro_id = antes.conferido_por_parceiro_id;
      camposStatus.conferido_em = antes.conferido_em ?? camposStatus.conferido_em;
    }

    await prisma.$transaction(async (tx) => {
      await tx.movimentacoes.update({ where: { id }, data: { ...camposStatus, updated_at: new Date() } });
      await sincronizarEfeitosStatus(tx as unknown as Prisma.TransactionClient, antes, alvo);
    });

    await logAlteracao({
      entidadeTipo: "movimentacoes",
      entidadeId: id,
      acao: "status_pagamento",
      dadosAntes: { status_pagamento: antes.status_pagamento },
      dadosDepois: { status_pagamento: alvo, por: sessao.nome }
    });
  } catch (erro) {
    await registrarEJogarErro({ entidadeTipo: "movimentacoes", entidadeId: id ?? null, acao: "status_pagamento", erro }).catch(
      () => undefined
    );
    redirect(`${voltarPara}?erro=${encodeURIComponent(mensagemDe(erro))}`);
  }

  revalidatePath(`/financeiro/${id}`);
  revalidatePath("/financeiro");
  redirect(`/financeiro/${id}?salvo=1`);
}

// Confirma (ou desfaz) um pagamento parcial via Pix gerado pelo corretor no
// Financeiro do Portal (Fase 8, 14/08/2026 — "toda vez que ele gerar um
// pagamento no recebimento da despesa precisa ter um saldo, administrativo
// vai lá vê que no recebimento abre, olha o extrato do banco se realmente
// tiver pago, ele confirma"). Cada clique alterna pago true/false — igual ao
// padrão do marcarPagoAction acima, só que na linha do pedaço parcial em vez
// da movimentação inteira.
//
// Quando a soma dos parciais CONFIRMADOS bate (ou passa) o valor total da
// movimentação, ela fecha sozinha (pago=true na movimentação-mãe) — é o
// "saldo com uma aba diminuindo do valor total até fechar" que o usuário
// descreveu. Desfazer um parcial que tinha fechado a conta reabre a
// movimentação-mãe automaticamente, pra não deixar pago=true com saldo
// devedor > 0.
export async function alternarPagamentoParcialAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "pagamentoPixId");
  let movimentacaoId: string | null = null;

  try {
    if (!id) throw new Error("Pagamento inválido.");

    const atual = await prisma.movimentacoes_pagamentos_pix.findUnique({ where: { id } });
    if (!atual) throw new Error("Pagamento não encontrado.");
    movimentacaoId = atual.movimentacao_id;

    const novoPago = !atual.pago;

    await prisma.$transaction(async (tx) => {
      await tx.movimentacoes_pagamentos_pix.update({
        where: { id },
        data: { pago: novoPago, confirmado_em: novoPago ? new Date() : null }
      });

      const movimentacao = await tx.movimentacoes.findUnique({
        where: { id: atual.movimentacao_id },
        include: { pagamentos_pix: true }
      });
      if (!movimentacao) return;

      const parciais = movimentacao.pagamentos_pix.map((p) => ({
        valor: Number(p.valor),
        pago: p.id === id ? novoPago : p.pago
      }));
      const saldo = saldoDevido(Number(movimentacao.valor), parciais);

      if (saldo <= 0 && !movimentacao.pago) {
        // Fechou pela soma dos parciais — pago_por_parceiro_id fica NULL de
        // propósito (foi o sistema, não um sócio), pra o "desfazer" abaixo
        // saber que pode reabrir sem risco.
        await tx.movimentacoes.update({
          where: { id: movimentacao.id },
          data: {
            status_pagamento: "Pago",
            pago: true,
            data_pagamento: hojePortoVelho(),
            pago_por_parceiro_id: null,
            updated_at: new Date()
          }
        });
      } else if (saldo > 0 && movimentacao.pago && movimentacao.pago_por_parceiro_id === null) {
        // Só reabre se a conta tinha sido fechada PELOS PARCIAIS (pago_por =
        // NULL). Se um sócio marcou "Pago" à mão (pago_por preenchido),
        // confirmar/desfazer um parcial não mexe no status da conta —
        // corrige o bug de "des-quitar" uma conta já paga por outro caminho.
        await tx.movimentacoes.update({
          where: { id: movimentacao.id },
          data: {
            status_pagamento: "Pendente",
            pago: false,
            data_pagamento: null,
            conferido_em: null,
            conferido_por_parceiro_id: null,
            updated_at: new Date()
          }
        });
      }
    });

    await logAlteracao({
      entidadeTipo: "movimentacoes_pagamentos_pix",
      entidadeId: id,
      acao: novoPago ? "confirmar" : "desfazer",
      dadosAntes: { pago: atual.pago },
      dadosDepois: { pago: novoPago }
    });
  } catch (erro) {
    const voltarPara = movimentacaoId ? `/financeiro/${movimentacaoId}` : "/financeiro";
    redirect(`${voltarPara}?erro=${encodeURIComponent(mensagemDe(erro))}`);
  }

  revalidatePath(`/financeiro/${movimentacaoId}`);
  revalidatePath("/financeiro");
  revalidatePath("/portal/financeiro");
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
  // Vendedor pagou a comissão direto na conta do corretor (dinheiro nem
  // passou pela imobiliária) — a linha ainda vira registro em `pagamentos`
  // (histórico do corretor, sai da previsão do dashboard), mas NÃO gera
  // despesa em movimentacoes (não existe saída de caixa nossa pra lançar).
  pago_direto?: boolean;
};

// Gera o rateio de uma transação (Locação ou Compra e Venda) a partir das
// porcentagens já cadastradas nela (porc_honorario, porc_parceria,
// porc_corretor_proprietario, porc_corretor_contraparte) — ver a mesma
// conta em cascata usada em components/transacao-form.tsx (honorário total
// → desconta parceria → resto é rateado entre os corretores). Só roda uma
// vez por transação: cria 1 linha em `pagamentos` + 1 despesa em
// `movimentacoes` (linkada via pagamento_id) por parceiro/corretor
// envolvido. A imobiliária não gera despesa (fica com o valor "em casa").
// Tratamento de erro (16/08/2026, revisão P1 do sistema): a outra ação (além
// de gerarBoletosAction) em que um erro tinha custo real — a tela de rateio
// (components/rateio-form.tsx) deixa cada linha ajustável (desconto, "pago
// direto") antes de confirmar, e um throw aqui derrubava esse ajuste manual
// pro error boundary. Mesmo padrão { erro } + useActionState dos formulários
// grandes: erro aparece inline, linhas ajustadas continuam na tela.
export async function gerarRateioAction(_prev: unknown, formData: FormData): Promise<ResultadoFormulario> {
  await requireAdminSession();

  const transacaoId = texto(formData, "transacao_id");
  const recebimentoId = texto(formData, "recebimento_id");
  const vencimentoTexto = texto(formData, "vencimento");
  const linhasTexto = texto(formData, "linhas");
  // Qual condição de pagamento (fatia do honorário) este Recebimento
  // específico está pagando — vazio/ausente cai no comportamento antigo
  // (honorário total inteiro, transações sem nenhuma condição marcada).
  const condicaoPagamentoId = texto(formData, "condicao_pagamento_id");

  if (!transacaoId || !recebimentoId || !vencimentoTexto || !linhasTexto) {
    return { erro: "Dados incompletos para gerar o rateio." };
  }

  let linhas: LinhaRateio[];
  try {
    linhas = JSON.parse(linhasTexto);
  } catch {
    return { erro: "Rateio inválido." };
  }
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return { erro: "Nenhuma linha de rateio informada." };
  }

  // Achado de auditoria (31/08/2026, caso CV-0015): o loop abaixo pulava
  // (`continue`) em silêncio qualquer linha com valor mas sem parceiro_id
  // — o rateio confirmava "sucesso" com uma parte inteira faltando, sem
  // avisar o admin. components/rateio-form.tsx não deveria mandar uma
  // linha assim (só monta linha quando tem corretor/parceiro), mas
  // validado aqui de novo porque é a Server Action, o único lugar que
  // garante isso de verdade — não dá pra confiar só no client.
  const linhaOrfa = linhas.find((l) => l.valor_final > 0 && !l.parceiro_id);
  if (linhaOrfa) {
    return {
      erro: `A linha "${linhaOrfa.parte || "sem nome"}" tem valor (${formatMoeda(linhaOrfa.valor_final)}) mas nenhum parceiro vinculado — corrija antes de gerar o rateio.`
    };
  }

  try {
    // Checagem por recebimento_id (não transacao_id): uma Locação tem N
    // Recebimentos (um por mês) com o mesmo transacao_id, então travar por
    // transação inteira impedia o rateio dos meses seguintes depois do 1°.
    const jaExiste = await prisma.pagamentos.findFirst({ where: { recebimento_id: recebimentoId } });
    if (jaExiste) {
      return { erro: "O rateio desse recebimento já foi gerado." };
    }

    const [categoria, transacao, condicaoPagamento] = await Promise.all([
      prisma.categorias_financeiras.findFirst({ where: { nome: CATEGORIA_REPASSE_HONORARIO, tipo: "Despesa" } }),
      prisma.transacoes.findUnique({ where: { id: transacaoId } }),
      condicaoPagamentoId ? prisma.condicoes_pagamento.findUnique({ where: { id: condicaoPagamentoId } }) : Promise.resolve(null)
    ]);
    if (!categoria) return { erro: `Categoria "${CATEGORIA_REPASSE_HONORARIO}" não encontrada.` };
    if (!transacao) return { erro: "Transação não encontrada." };
    if (condicaoPagamentoId && (!condicaoPagamento || condicaoPagamento.transacao_id !== transacaoId || !condicaoPagamento.gera_comissao)) {
      return { erro: "Condição de pagamento inválida para esta transação." };
    }

    // Valor do honorário é recalculado aqui a partir do banco, não confiando
    // no valor mandado pelo formulário — igual já é feito nas outras Server
    // Actions do sistema. Quando o Recebimento está vinculado a uma condição
    // marcada como "honorário pago aqui" (ver condicoes_pagamento.gera_comissao),
    // só a fatia dela (porc_comissao) entra no rateio, não o honorário
    // inteiro — sem isso, cada Recebimento de um negócio parcelado pagaria o
    // honorário total de novo.
    const fracaoCondicao = condicaoPagamento ? Number(condicaoPagamento.porc_comissao ?? 0) : 1;
    const valorHonorarioTotal = Number(transacao.valor_transacao) * Number(transacao.porc_honorario ?? 0) * fracaoCondicao;
    const vencimento = new Date(vencimentoTexto + "T00:00:00");

    let pagamentosCriados = 0;
    let despesasCriadas = 0;

    await prisma.$transaction(async (tx) => {
      for (const linha of linhas) {
        if (!linha.parceiro_id || !(linha.valor_final > 0)) continue;

        const pagoDireto = linha.pago_direto === true;

        const pagamento = await tx.pagamentos.create({
          data: {
            // Pago direto já foi recebido pelo corretor por fora — nasce como
            // "Pago" (sem isso ficava preso em "Pendente" pra sempre e o
            // Dashboard nunca contava esse repasse no "Recebido" do corretor).
            status: pagoDireto ? "Pago" : "Pendente",
            data_recebimento: pagoDireto ? hojePortoVelho() : null,
            transacao_id: transacaoId,
            recebimento_id: recebimentoId,
            condicao_pagamento_id: condicaoPagamentoId || null,
            cliente_id: transacao.cliente_id,
            tipo: transacao.tipo,
            parceiro_id: linha.parceiro_id,
            parte: linha.parte,
            porcentagem: linha.porcentagem,
            desconto: linha.desconto > 0 ? linha.desconto : null,
            observacao: linha.observacao,
            valor_honorario: valorHonorarioTotal,
            valor_parceiro: linha.valor_final,
            pago_direto: pagoDireto
          }
        });
        pagamentosCriados += 1;

        // Pago direto: o vendedor já acertou com o corretor sem passar pela
        // nossa conta — não existe despesa nossa pra lançar, só o registro
        // acima (histórico + sai da previsão do dashboard).
        if (pagoDireto) continue;

        await tx.movimentacoes.create({
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
        despesasCriadas += 1;
      }
    });

    if (pagamentosCriados === 0) {
      return { erro: "Nenhuma linha válida para gerar o rateio (confira parceiro e valor de cada uma)." };
    }

    await logAlteracao({
      entidadeTipo: "pagamentos",
      entidadeId: transacaoId,
      acao: "criar",
      dadosDepois: { transacao_id: transacaoId, quantidade: pagamentosCriados, despesas: despesasCriadas }
    });
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }

  revalidatePath(`/financeiro/${recebimentoId}`);
  revalidatePath("/financeiro");
  redirect(`/financeiro/${recebimentoId}?rateio=1`);
}
