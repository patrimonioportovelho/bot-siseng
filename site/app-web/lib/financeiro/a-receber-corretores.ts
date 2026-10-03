import { prisma } from "@/lib/prisma";
import { STATUS_NAO_REALIZADA } from "@/lib/format";
import { previsaoComissaoTransacao } from "@/lib/financeiro/previsao-comissao";
import { DATA_INICIO_ACOMPANHAMENTO_HONORARIO } from "@/lib/financeiro/honorario-lancado";

// Mesmo literal de app/financeiro/actions.ts (aquele arquivo é "use server" e
// não pode exportar constante).
const CATEGORIA_REPASSE_HONORARIO = "Repasse de Honorários Transações";

export type CorretorParaAReceber = {
  id: string;
  porc_proprietario: number | null;
  porc_interessado: number | null;
};

// "A Receber" do quadro Corretores do Dashboard (pedido do usuário em
// 02/10/2026): TUDO que o corretor ainda vai receber de contrato válido, sem
// recorte de período — pode ficar vários meses em aberto. Soma três fontes,
// sem contar nada duas vezes:
//   1) Repasses já lançados no Financeiro e ainda não pagos (Pendente /
//      Conferido);
//   2) Rateios gerados sem Despesa e que não foram "pago direto";
//   3) Previsão dos contratos assinados que o Financeiro ainda NÃO lançou pra
//      esse corretor (mesma conta do "A receber" do Portal do corretor —
//      lib/financeiro/previsao-comissao.ts).
// Ficam de fora: transação cancelada (Cancelado / Locação cancelada — Distrato
// continua, o honorário nem sempre é devolvido), excluída, e — em (2) e (3),
// que vêm do histórico importado — contrato assinado antes de 2026.
export async function buscarAReceberPorParceiro(
  corretores: CorretorParaAReceber[],
  lojasFiltro: string[]
): Promise<Map<string, number>> {
  const totais = new Map<string, number>();
  if (corretores.length === 0) return totais;
  const ids = corretores.map((c) => c.id);
  const idsSet = new Set(ids);
  const padraoPorCorretor = new Map(corretores.map((c) => [c.id, c]));
  const somar = (parceiroId: string, valor: number) =>
    totais.set(parceiroId, (totais.get(parceiroId) ?? 0) + valor);

  // status é nullable: notIn sozinho descartaria status NULL.
  const naoCancelada = { OR: [{ status: null }, { status: { notIn: STATUS_NAO_REALIZADA } }] };
  const transacaoValida = { excluido: false, loja_id: { in: lojasFiltro }, ...naoCancelada };

  const categoriaRepasse = await prisma.categorias_financeiras.findFirst({
    where: { nome: CATEGORIA_REPASSE_HONORARIO, tipo: "Despesa" },
    select: { id: true }
  });

  const [despesasPendentes, rateiosSemDespesa, transacoes] = await Promise.all([
    categoriaRepasse
      ? prisma.movimentacoes.findMany({
          where: {
            tipo: "Despesa",
            categoria_id: categoriaRepasse.id,
            pago: false,
            parceiro_id: { in: ids },
            transacoes: transacaoValida
          },
          select: { parceiro_id: true, valor: true }
        })
      : Promise.resolve([]),
    prisma.pagamentos.findMany({
      where: {
        parceiro_id: { in: ids },
        pago_direto: false,
        movimentacoes: { none: {} },
        transacoes: { ...transacaoValida, data_assinatura: { gte: DATA_INICIO_ACOMPANHAMENTO_HONORARIO } }
      },
      select: { parceiro_id: true, valor_parceiro: true }
    }),
    prisma.transacoes.findMany({
      where: {
        excluido: false,
        loja_id: { in: lojasFiltro },
        tipo: { in: ["Compra e Venda", "Locação"] },
        data_assinatura: { gte: DATA_INICIO_ACOMPANHAMENTO_HONORARIO },
        AND: [
          naoCancelada,
          {
            OR: [
              { corretor_proprietario_id: { in: ids } },
              { corretor_contraparte_id: { in: ids } },
              { transacoes_comissao_extra: { some: { parceiro_id: { in: ids } } } }
            ]
          }
        ]
      },
      select: {
        id: true,
        id_legado: true,
        tipo: true,
        valor_transacao: true,
        porc_honorario: true,
        tem_parceria: true,
        porc_parceria: true,
        porc_corretor_proprietario: true,
        porc_corretor_contraparte: true,
        corretor_proprietario_id: true,
        corretor_contraparte_id: true,
        data_pagamento: true,
        condicoes_pagamento: {
          where: { gera_comissao: true },
          select: { id: true, porc_comissao: true, data_pagamento: true, pagamentos: { select: { parceiro_id: true } } }
        },
        pagamentos: { where: { condicao_pagamento_id: null }, select: { parceiro_id: true } },
        transacoes_comissao_extra: { select: { parceiro_id: true, porcentagem: true } }
      }
    })
  ]);

  for (const d of despesasPendentes) if (d.parceiro_id) somar(d.parceiro_id, Number(d.valor));
  for (const r of rateiosSemDespesa) somar(r.parceiro_id, Number(r.valor_parceiro ?? 0));

  // Repasse (pago ou não) já lançado pro corretor numa transação tira o
  // negócio da previsão — já está em (1) ou já foi pago (mesmo critério do
  // Portal do corretor).
  const repassesLancados = new Set<string>();
  if (categoriaRepasse && transacoes.length > 0) {
    const lancados = await prisma.movimentacoes.findMany({
      where: {
        tipo: "Despesa",
        categoria_id: categoriaRepasse.id,
        parceiro_id: { in: ids },
        transacao_id: { in: transacoes.map((t) => t.id) }
      },
      select: { transacao_id: true, parceiro_id: true }
    });
    for (const m of lancados) repassesLancados.add(`${m.transacao_id}|${m.parceiro_id}`);
  }

  for (const t of transacoes) {
    const candidatos = new Set<string>();
    if (t.corretor_proprietario_id && idsSet.has(t.corretor_proprietario_id)) candidatos.add(t.corretor_proprietario_id);
    if (t.corretor_contraparte_id && idsSet.has(t.corretor_contraparte_id)) candidatos.add(t.corretor_contraparte_id);
    for (const e of t.transacoes_comissao_extra) if (idsSet.has(e.parceiro_id)) candidatos.add(e.parceiro_id);

    for (const parceiroId of candidatos) {
      if (repassesLancados.has(`${t.id}|${parceiroId}`)) continue;
      const padrao = padraoPorCorretor.get(parceiroId);
      const extra = t.transacoes_comissao_extra.find((e) => e.parceiro_id === parceiroId);

      const previsoes = previsaoComissaoTransacao({
        transacao: {
          id: t.id,
          id_legado: t.id_legado,
          tipo: t.tipo,
          valor_transacao: Number(t.valor_transacao),
          porc_honorario: Number(t.porc_honorario),
          tem_parceria: t.tem_parceria,
          porc_parceria: Number(t.porc_parceria ?? 0),
          porc_corretor_proprietario: Number(t.porc_corretor_proprietario),
          porc_corretor_contraparte: Number(t.porc_corretor_contraparte),
          corretor_proprietario_id: t.corretor_proprietario_id,
          corretor_contraparte_id: t.corretor_contraparte_id,
          data_pagamento: t.data_pagamento
        },
        parceiroId,
        temCondicoes: t.condicoes_pagamento.length > 0,
        condicoesPendentes: t.condicoes_pagamento
          .filter((c) => !c.pagamentos.some((p) => p.parceiro_id === parceiroId))
          .map((c) => ({
            id: c.id,
            porc_comissao: c.porc_comissao ? Number(c.porc_comissao) : null,
            data_pagamento: c.data_pagamento
          })),
        semCondicaoJaGerado: t.pagamentos.some((p) => p.parceiro_id === parceiroId),
        fracaoExtra: extra ? Number(extra.porcentagem) : 0,
        porcPadraoProprietario: padrao?.porc_proprietario ?? null,
        porcPadraoInteressado: padrao?.porc_interessado ?? null
      });
      for (const p of previsoes) somar(parceiroId, p.valorPrevisto);
    }
  }

  return totais;
}
