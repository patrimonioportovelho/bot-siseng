// Opções fechadas usadas nos formulários de Financiamento (Avaliação,
// Andamento, Lançamento) — levantadas a partir dos valores reais que já
// existiam na planilha raiz (aba Avaliacao/Andamento/Lancamento/
// StatusAndamento/StatusAndamentoCom), na importação de 2026-07.

// Status de uma Avaliação (aprovação de crédito junto ao banco). Ordem de
// prioridade definida pelo usuário — é essa ordem que manda tanto no select
// quanto no agrupamento do dashboard (ver STATUS_AVALIACAO_PRIORIDADE):
// "Montagem de processo" abre a lista por ser o ponto de partida (ainda nem
// entrou em Consulta de CPF), depois Aprovado (que é onde a avaliação vira
// negócio de verdade e precisa de acompanhamento de vencimento), Standbye,
// Condicionado, Avaliação vencida, Avaliação cancelada, Restrição, Concluído,
// Reprovação, e por último Consulta de CPF (é só o passo inicial, sem
// urgência ainda).
export const STATUS_AVALIACAO_OPCOES = [
  "Montagem de processo",
  "Aprovado",
  "Standbye",
  "Condicionado",
  "Avaliação vencida",
  "Avaliação cancelada",
  "Restrição",
  "Concluído",
  "Reprovação",
  "Consulta de CPF"
];

// Ordem de prioridade pro agrupamento do dashboard — mesma lista acima, só
// dando nome mais claro pra quem for usar como critério de ordenação (em vez
// de reaproveitar STATUS_AVALIACAO_OPCOES "por acaso" ter a ordem certa).
export const STATUS_AVALIACAO_PRIORIDADE = STATUS_AVALIACAO_OPCOES;

// Situações que contam como "em andamento" pro dashboard — usado pra
// destacar/agrupar o que ainda precisa de acompanhamento.
export const STATUS_AVALIACAO_ATIVOS = [
  "Montagem de processo",
  "Consulta de CPF",
  "Standbye",
  "Restrição",
  "Condicionado",
  "Aprovado"
];

export const STATUS_AVALIACAO_ENCERRADOS = ["Reprovação", "Avaliação cancelada", "Avaliação vencida"];

export const TIPO_AVALIACAO_OPCOES = ["Financiamento", "Análise de crédito", "Locação"];

export const TIPO_IMOVEL_AVALIACAO_OPCOES = [
  "Imóvel Usado",
  "Imóvel Novo",
  "Construção em Terreno Próprio",
  "Aquisição de Terreno",
  "Terreno e Construção"
];

export const PRODUTO_AVALIACAO_OPCOES = ["Minha Casa Minha Vida", "Sistema Brasileiro de Poupança e Empréstimo"];

export const TABELA_AVALIACAO_OPCOES = ["PRICE", "SAC"];

export const INDEXADOR_AVALIACAO_OPCOES = ["TR", "Poupança"];

// Status do Andamento (processo de fato, depois que a avaliação vira
// negócio) — mesmos 14 nomes já cadastrados na aba StatusAndamento da
// planilha antiga (lá ficavam com um Id tipo SA0001; aqui é só o nome, mais
// simples de tratar/mostrar).
export const STATUS_ANDAMENTO_OPCOES = [
  "Pendente",
  "Aguardando Documentos do vendedor",
  "Aguardando Documentos do comprador",
  "Aguardando Documento do Imóvel",
  "Aguardando a Engenharia",
  "Aguardando o Laudo",
  "Aguardando Conformidade",
  "Inconforme",
  "Conforme",
  "Aguardando comitê",
  "Dotação Orçamentária",
  "Assinando Contrato",
  "Aguardando Registro",
  "Concluído"
];

// Status que ainda precisam de atenção — todos exceto o desfecho final.
export const STATUS_ANDAMENTO_ATIVOS = STATUS_ANDAMENTO_OPCOES.filter((s) => s !== "Concluído");

// Status complementar (sub-motivo) por Status do Andamento — mesma relação
// da aba StatusAndamentoCom da planilha antiga (cada complementar pertencia
// a um StatusAndamento pai). Campo é sempre opcional/texto livre no banco,
// isso aqui só alimenta o select — se o usuário digitou algo fora da lista
// na planilha antiga, o valor entra do mesmo jeito (não é enum travado no
// banco).
export const STATUS_ANDAMENTO_COM_OPCOES: Record<string, string[]> = {
  "Aguardando Documentos do vendedor": [
    "Atualização de documentos vendedor",
    "Averbação dos documentos vendedor",
    "Averbação conjugê vendedor",
    "Averbação estado civil vendedor"
  ],
  "Aguardando Documentos do comprador": ["Atualização de documentos comprador"],
  "Aguardando a Engenharia": [
    "Aguardando pagamento do boleto",
    "Aguardando agendamento do engenheiro",
    "Agendamento realizado",
    "Aguardando engenheiro incluir laudo no Siopi"
  ],
  "Aguardando Registro": [
    "Registro com Depachante imobiliária",
    "Registro com Despachante externo",
    "Registro por conta do comprador"
  ],
  Concluído: ["Documentação entregue ao gerente", "Valor de financiamento pago", "Processo arquivado"]
};

export const TIPO_CONTRATO_ANDAMENTO_OPCOES = ["Contrato Físico", "Contrato Nato"];

export const STATUS_LANCAMENTO_OPCOES = ["Previsão", "Pago"];
