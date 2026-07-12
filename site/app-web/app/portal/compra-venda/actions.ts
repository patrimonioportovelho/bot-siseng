"use server";

import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { valorEditavelParaDecimal, percentualParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { STATUS_COMPRA_VENDA_OPCOES } from "@/lib/transacoes/opcoes";
import { buscarGestaoPorImovel } from "@/lib/transacoes/buscas";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
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

function inteiro(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Mesmo esquema de numeração do admin (CV-0001, CV-0002...) — as duas
// origens (admin e portal) escrevem na mesma tabela transacoes, então o
// próximo número sempre olha pra todos os registros com esse prefixo, não só
// os criados por aqui.
async function gerarProximoIdCV(): Promise<string> {
  const registros = await prisma.transacoes.findMany({
    where: { id_legado: { startsWith: "CV-" } },
    select: { id_legado: true }
  });

  let maior = 0;
  for (const r of registros) {
    const n = Number(r.id_legado?.replace("CV-", ""));
    if (Number.isFinite(n) && n > maior) maior = n;
  }

  return `CV-${String(maior + 1).padStart(4, "0")}`;
}

async function sincronizarCondicoesPagamento(transacaoId: string, formData: FormData) {
  const bruto = texto(formData, "condicoes_pagamento_json");
  let lista: Array<Record<string, unknown>> = [];
  if (bruto) {
    try {
      const parsed = JSON.parse(bruto);
      if (Array.isArray(parsed)) lista = parsed;
    } catch {
      lista = [];
    }
  }

  const linhas = lista
    .map((c) => {
      const valor = valorEditavelParaDecimal(String(c.valor ?? "").trim());
      const parcelasTxt = String(c.parcelas ?? "").trim();
      const parcelasNum = parcelasTxt ? Number(parcelasTxt) : NaN;
      const dataTxt = String(c.data_pagamento ?? "").trim();
      const dataPagamento = dataTxt ? new Date(dataTxt) : null;
      return {
        tipo: String(c.tipo ?? "").trim() || null,
        valor,
        forma_pagamento: String(c.forma_pagamento ?? "").trim() || null,
        parcelas: Number.isFinite(parcelasNum) ? Math.trunc(parcelasNum) : null,
        momento: String(c.momento ?? "").trim() || null,
        data_pagamento: dataPagamento && !Number.isNaN(dataPagamento.getTime()) ? dataPagamento : null,
        descricao: String(c.descricao ?? "").trim() || null
      };
    })
    .filter((c): c is typeof c & { valor: number } => c.valor !== null);

  if (linhas.length > 0) {
    await prisma.condicoes_pagamento.createMany({
      data: linhas.map((c) => ({ transacao_id: transacaoId, ...c }))
    });
  }
}

// Gera a "Elaboração de Contrato de Compra e Venda" a partir do portal do
// corretor. Diferente do Contrato de Gestão e da Proposta, aqui não gera
// nenhum documento — só cadastra a transação de verdade (status sempre
// "Elaboração do Contrato de Compra e Venda"), pra o ADM assumir dali pra
// frente (inclusive a divisão do comissionamento entre os corretores, que
// não é preenchida por aqui).
//
// Se o imóvel escolhido já tem uma Gestão cadastrada, vincula automático
// (gestao_id) e lança uma atividade no quadro dela — sem mudar a coluna do
// Kanban, isso continua manual, o ADM decide quando mover. Se não tiver
// Gestão e não for "compra sem gestão", guarda os dados que o corretor
// souber digitar (historico_gestao_*) só pra comparação — não cria Gestão
// nenhuma.
export async function gerarCompraVendaAction(
  formData: FormData
): Promise<{ ok: true; idLegado: string | null } | { ok: false; erro: string }> {
  const session = await requirePortalSession();

  try {
    const lojaId = texto(formData, "loja_id");
    const imovelId = texto(formData, "imovel_id");
    const compraSemGestao = booleano(formData, "compra_sem_gestao");

    const compradorIds = formData
      .getAll("comprador_id")
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);

    if (!lojaId || !imovelId) {
      return { ok: false, erro: "Selecione a loja e o imóvel." };
    }
    if (compradorIds.length === 0) {
      return { ok: false, erro: "Adicione ao menos um cliente comprador." };
    }

    const primeiroProprietario = await prisma.imoveis_proprietarios.findFirst({
      where: { imovel_id: imovelId },
      orderBy: { ordem: "asc" },
      select: { cliente_id: true }
    });
    if (!primeiroProprietario) {
      return {
        ok: false,
        erro: "O imóvel selecionado não tem proprietário cadastrado — não dá pra gerar a transação."
      };
    }

    // Vínculo com a Gestão — reconfere no servidor (não confia só no que
    // veio do formulário) qual é a gestão ativa desse imóvel agora.
    let gestaoId: string | null = null;
    let historicoData: Date | null = null;
    let historicoPrazoMeses: number | null = null;
    let historicoValor: number | null = null;

    if (!compraSemGestao) {
      const gestaoExistente = await buscarGestaoPorImovel(imovelId);
      if (gestaoExistente) {
        gestaoId = gestaoExistente.id;
      } else {
        historicoData = data(formData, "historico_gestao_data_assinatura");
        historicoPrazoMeses = inteiro(formData, "historico_gestao_prazo_meses");
        const historicoValorTxt = texto(formData, "historico_gestao_valor");
        historicoValor = historicoValorTxt ? valorEditavelParaDecimal(historicoValorTxt) : null;
      }
    }

    const valorTransacaoTxt = texto(formData, "valor_transacao");
    const valorTransacao = valorTransacaoTxt ? valorEditavelParaDecimal(valorTransacaoTxt) ?? 0 : 0;
    const dataAssinatura = data(formData, "data_assinatura") ?? new Date();
    const chave = texto(formData, "chave");

    const porcHonorarioTxt = texto(formData, "porc_honorario");
    const porcHonorario = porcHonorarioTxt ? percentualParaDecimal(porcHonorarioTxt) ?? 0 : 0;
    const temParceria = booleano(formData, "tem_parceria");
    const parceiroExternoId = texto(formData, "parceiro_externo_id");
    const porcParceriaTxt = texto(formData, "porc_parceria");
    const porcParceria = temParceria && porcParceriaTxt ? percentualParaDecimal(porcParceriaTxt) : null;

    const corretorProprietarioId = texto(formData, "corretor_proprietario_id");
    const corretorContraparteId = texto(formData, "corretor_contraparte_id");

    const idLegado = await gerarProximoIdCV();

    const novo = await prisma.transacoes
      .create({
        data: {
          tipo: "Compra e Venda",
          id_legado: idLegado,
          loja_id: lojaId,
          imovel_id: imovelId,
          cliente_id: primeiroProprietario.cliente_id,
          cliente_contraparte_id: compradorIds[0],
          status: STATUS_COMPRA_VENDA_OPCOES[0],
          data_assinatura: dataAssinatura,
          valor_transacao: valorTransacao,
          chave,
          porc_honorario: porcHonorario,
          tem_parceria: temParceria,
          porc_parceria: porcParceria,
          parceiro_externo_id: temParceria ? parceiroExternoId : null,
          corretor_proprietario_id: corretorProprietarioId,
          corretor_contraparte_id: corretorContraparteId,
          gestao_id: gestaoId,
          compra_sem_gestao: compraSemGestao,
          historico_gestao_data_assinatura: historicoData,
          historico_gestao_prazo_meses: historicoPrazoMeses,
          historico_gestao_valor: historicoValor,
          criado_no_portal: true
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "transacoes", acao: "criar_via_portal", erro }));

    await prisma.transacoes_contrapartes.createMany({
      data: compradorIds.map((clienteId, ordem) => ({ transacao_id: novo.id, cliente_id: clienteId, ordem }))
    });

    await sincronizarCondicoesPagamento(novo.id, formData);

    // Atividade no quadro de atividades da Gestão — só quando a transação
    // ficou vinculada a uma. A coluna/Kanban da Gestão não muda sozinha.
    if (gestaoId) {
      await prisma.gestao_atividades.create({
        data: {
          gestao_id: gestaoId,
          tipo: "compra_venda_iniciada",
          titulo: `Elaboração de Contrato de Compra e Venda iniciada (${idLegado})`,
          data: dataAssinatura,
          feito: false
        }
      });
    }

    await logAlteracaoPortal({
      parceiroId: session.parceiroId,
      entidadeTipo: "transacoes",
      entidadeId: novo.id,
      acao: "gerar_compra_venda",
      dadosDepois: { id_legado: novo.id_legado, imovel_id: imovelId, compradores: compradorIds, gestao_id: gestaoId }
    });

    return { ok: true, idLegado: novo.id_legado };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: mensagem };
  }
}
