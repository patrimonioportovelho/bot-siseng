// Previsão de comissão do corretor a partir de negócios ABERTOS — Fase 8c
// (16/08/2026). Pedido do usuário depois de ver a Fase 8 no ar: "o A receber
// precisa puxar do pendente da transação de compra e venda ou locação, uma
// administração sem locação também é uma previsão mas é diferente, não é
// garantida". Até aqui "A receber" só mostrava despesa de repasse JÁ
// rateada (gerarRateioAction já rodou) esperando pagamento — isso não
// aparece pra negócio que ainda nem teve o rateio gerado (ex.: CV-0017/
// CV-0018 do Jota Silvestre, transação assinada, sem rateio ainda).
//
// Mesma conta em cascata de gerarRateioAction (app/financeiro/actions.ts) e
// components/rateio-form.tsx, só que projetada pra frente (o negócio ainda
// não foi rateado) em vez de aplicada sobre um rateio real:
//   valor_transacao × porc_honorario × (porc_comissao da condição, ou 1 se
//   não tem condição) = honorarioTotal
//   honorarioTotal − (tem_parceria ? honorarioTotal × porc_parceria : 0) = restante
//   restante × fração do corretor (proprietário/contraparte/participante
//   extra) = valor previsto pra ELE especificamente
//
// Não desconta condicao_pagamento.desconto_comissao (isso é um abatimento
// aplicado linha a linha na hora do rateio de verdade, não dá pra prever
// com precisão) — por isso é sempre uma ESTIMATIVA, o valor real pode vir
// um pouco menor quando o rateio for gerado.
export type TransacaoParaPrevisao = {
  id: string;
  id_legado: string | null;
  tipo: string;
  valor_transacao: number;
  porc_honorario: number;
  tem_parceria: boolean;
  porc_parceria: number;
  porc_corretor_proprietario: number;
  porc_corretor_contraparte: number;
  corretor_proprietario_id: string | null;
  corretor_contraparte_id: string | null;
  data_pagamento: Date | null;
};

export type CondicaoParaPrevisao = {
  id: string;
  porc_comissao: number | null;
  data_pagamento: Date | null;
};

export type PrevisaoComissao = {
  transacaoId: string;
  idLegado: string | null;
  tipo: string;
  condicaoId: string | null;
  dataPrevista: Date | null;
  valorPrevisto: number;
};

// temCondicoes: se a transação TEM alguma condição de pagamento marcada com
// gera_comissao=true (independente de já ter sido rateada ou não) — decide
// qual dos dois modos de cálculo usar (por fatia de condição, ou honorário
// inteiro de uma vez). condicoesPendentes: só as condições com
// gera_comissao=true que AINDA não geraram pagamentos pra ESSE corretor
// (filtrar antes de chamar) — se temCondicoes=true e condicoesPendentes vier
// vazio, é porque TODAS já foram rateadas pra ele, então não sobra nada pra
// prever (não cai no modo "honorário inteiro" por engano, senão contaria
// duas vezes). semCondicaoJaGerado só importa quando temCondicoes=false: diz
// se o honorário inteiro (sem fatiar por condição) já foi rateado pra ele.
export function previsaoComissaoTransacao(params: {
  transacao: TransacaoParaPrevisao;
  parceiroId: string;
  temCondicoes: boolean;
  condicoesPendentes: CondicaoParaPrevisao[];
  semCondicaoJaGerado: boolean;
  fracaoExtra?: number;
}): PrevisaoComissao[] {
  const { transacao, parceiroId, temCondicoes, condicoesPendentes, semCondicaoJaGerado, fracaoExtra } = params;

  const fracaoCorretor =
    (transacao.corretor_proprietario_id === parceiroId ? transacao.porc_corretor_proprietario : 0) +
    (transacao.corretor_contraparte_id === parceiroId ? transacao.porc_corretor_contraparte : 0) +
    (fracaoExtra ?? 0);
  if (fracaoCorretor <= 0) return [];

  function valorParaFracaoCondicao(fracaoCondicao: number): number {
    const honorarioTotal = transacao.valor_transacao * transacao.porc_honorario * fracaoCondicao;
    const valorParceria = transacao.tem_parceria ? honorarioTotal * transacao.porc_parceria : 0;
    const restante = honorarioTotal - valorParceria;
    return Math.round(restante * fracaoCorretor * 100) / 100;
  }

  if (temCondicoes) {
    return condicoesPendentes
      .map((c) => ({
        transacaoId: transacao.id,
        idLegado: transacao.id_legado,
        tipo: transacao.tipo,
        condicaoId: c.id,
        dataPrevista: c.data_pagamento,
        valorPrevisto: valorParaFracaoCondicao(Number(c.porc_comissao ?? 0))
      }))
      .filter((p) => p.valorPrevisto > 0);
  }

  if (semCondicaoJaGerado) return [];

  const valorPrevisto = valorParaFracaoCondicao(1);
  if (valorPrevisto <= 0) return [];
  return [
    {
      transacaoId: transacao.id,
      idLegado: transacao.id_legado,
      tipo: transacao.tipo,
      condicaoId: null,
      dataPrevista: transacao.data_pagamento,
      valorPrevisto
    }
  ];
}
