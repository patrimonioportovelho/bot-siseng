import { prisma } from "@/lib/prisma";
import { hojePortoVelho, formatMoeda } from "@/lib/format";

// Ranking mensal de honorários RECEBIDOS por Corretor — pedido do usuário
// (29/08/2026): "dashboard externo... ranking de quem mais recebeu
// honorários, somando locação e compra e venda... deu pago em Financeiro
// pode ir somando pra lá". Reaproveita a MESMA definição de "Honorários
// recebido" já usada e confiável no painel do corretor (app/portal/page.tsx)
// — só que aqui somada SÓ dentro do mês corrente (reseta todo dia 1º) e
// agrupada por corretor pra ranquear:
//   1) Despesa de repasse de honorário já marcada como paga em Financeiro
//      (movimentacoes: tipo=Despesa, pagamento_id preenchido, pago=true),
//      pela Data de pagamento.
//   2) Rateio "pago direto" (pagamentos.pago_direto=true — vendedor pagou o
//      corretor sem passar pela nossa conta, não gera Despesa nenhuma pra
//      marcar como paga) — contado assim que o rateio é gerado
//      (created_at), já que não existe uma confirmação de "pago" separada
//      pra esse caso.
// Só função "Corretor" entra (não Corretor Estagiário — pedido do usuário).
export type LinhaRankingHonorario = {
  parceiroId: string;
  nome: string;
  fotoUrl: string | null;
  valor: number;
};

// Extraído em 30/08/2026 (achado da auditoria comparando esse ranking com a
// coluna "Recebido" do quadro Corretores no Dashboard admin): as duas telas
// tinham cada uma sua própria lógica de "quanto o corretor recebeu", e a do
// Dashboard media outra coisa (rateio de transação ASSINADA no período, não o
// dinheiro que efetivamente ENTROU no período) e também classificava todo
// rateio "pago direto" como "A Receber" pra sempre (pagamentos.status nunca
// vira "Pago" em lugar nenhum do sistema — só nasce "Pendente"). Essa função
// agora é a ÚNICA fonte de verdade de "honorário recebido num período",
// reaproveitada tanto aqui (ranking, sem filtro de loja, só função Corretor)
// quanto no Dashboard (com filtro de loja, Corretor + Corretor Estagiário).
export async function buscarHonorariosRecebidosPorParceiro(
  inicio: Date,
  fimExclusivo: Date,
  lojasFiltro?: string[]
): Promise<Map<string, number>> {
  const filtroLojaMovimentacao = lojasFiltro ? { transacoes: { loja_id: { in: lojasFiltro } } } : {};
  const filtroLojaPagamento = lojasFiltro ? { transacoes: { loja_id: { in: lojasFiltro } } } : {};

  const [repassesPagos, pagosDireto] = await Promise.all([
    prisma.movimentacoes.groupBy({
      by: ["parceiro_id"],
      where: {
        tipo: "Despesa",
        pagamento_id: { not: null },
        pago: true,
        parceiro_id: { not: null },
        data_pagamento: { gte: inicio, lt: fimExclusivo },
        ...filtroLojaMovimentacao
      },
      _sum: { valor: true }
    }),
    prisma.pagamentos.groupBy({
      by: ["parceiro_id"],
      where: {
        pago_direto: true,
        created_at: { gte: inicio, lt: fimExclusivo },
        ...filtroLojaPagamento
      },
      _sum: { valor_parceiro: true }
    })
  ]);

  const totais = new Map<string, number>();
  for (const r of repassesPagos) {
    if (!r.parceiro_id) continue;
    totais.set(r.parceiro_id, (totais.get(r.parceiro_id) ?? 0) + Number(r._sum.valor ?? 0));
  }
  for (const p of pagosDireto) {
    totais.set(p.parceiro_id, (totais.get(p.parceiro_id) ?? 0) + Number(p._sum.valor_parceiro ?? 0));
  }
  return totais;
}

export async function buscarRankingHonorariosMes(referencia: Date = hojePortoVelho()): Promise<LinhaRankingHonorario[]> {
  const inicioMes = new Date(referencia.getFullYear(), referencia.getMonth(), 1);
  const fimMes = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 1);

  const [totais, corretores] = await Promise.all([
    buscarHonorariosRecebidosPorParceiro(inicioMes, fimMes),
    prisma.parceiros.findMany({
      where: { funcao: "Corretor", status_funcao: { not: "Excluído" } },
      select: { id: true, nome: true, foto_url: true }
    })
  ]);

  return corretores
    .map((c) => ({ parceiroId: c.id, nome: c.nome, fotoUrl: c.foto_url, valor: totais.get(c.id) ?? 0 }))
    .filter((l) => l.valor > 0)
    .sort((a, b) => b.valor - a.valor);
}

export type SituacaoRankingCorretor =
  | { status: "sem_valor"; mensagem: string }
  | { status: "ranking"; posicao: number; valor: number; mensagem: string };

// Mensagem motivacional pro painel do corretor (pedido do usuário: "algo
// intuitivo para rankear eles") — 1º comemora, 2º/3º mostram quanto falta em
// R$ pra ultrapassar quem está na frente, 4º em diante comemora o valor já
// recebido e incentiva a entrar no top 3. Quem ainda não recebeu nada esse
// mês (fora do ranking) recebe um empurrão neutro, sem soar como cobrança.
export function avaliarRankingCorretor(ranking: LinhaRankingHonorario[], parceiroId: string): SituacaoRankingCorretor {
  const indice = ranking.findIndex((l) => l.parceiroId === parceiroId);
  if (indice === -1) {
    return {
      status: "sem_valor",
      mensagem: "Você ainda não recebeu honorário este mês — feche uma Locação ou Compra e Venda e entre no ranking!"
    };
  }

  const posicao = indice + 1;
  const valor = ranking[indice].valor;
  const valorTexto = formatMoeda(valor);

  if (posicao === 1) {
    return {
      status: "ranking",
      posicao,
      valor,
      mensagem: `Parabéns! Você está em 1º lugar no ranking de honorários deste mês, com ${valorTexto} recebidos.`
    };
  }

  const anterior = ranking[indice - 1];
  const faltaTexto = formatMoeda(Math.max(0, anterior.valor - valor));

  if (posicao === 2) {
    return {
      status: "ranking",
      posicao,
      valor,
      mensagem: `Você está em 2º lugar, com ${valorTexto}. Faltam ${faltaTexto} para ultrapassar o 1º colocado.`
    };
  }
  if (posicao === 3) {
    return {
      status: "ranking",
      posicao,
      valor,
      mensagem: `Você está em 3º lugar, com ${valorTexto}. Faltam ${faltaTexto} para chegar ao 2º colocado.`
    };
  }

  const terceiro = ranking[2];
  const faltaTop3 = terceiro ? formatMoeda(Math.max(0, terceiro.valor - valor)) : null;
  return {
    status: "ranking",
    posicao,
    valor,
    mensagem: faltaTop3
      ? `Parabéns, você já recebeu ${valorTexto} em honorários este mês! Vamos focar no ranking — faltam ${faltaTop3} para entrar no top 3.`
      : `Parabéns, você já recebeu ${valorTexto} em honorários este mês! Vamos focar no ranking.`
  };
}
