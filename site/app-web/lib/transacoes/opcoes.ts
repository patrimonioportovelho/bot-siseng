// Listas de opções do formulário de Transações — vêm dos CHECK constraints
// em site/database/schema.sql, extraídas das listas reais do AppSheet
// original. Status (aberto/concluído/cancelado) fica em lib/format.ts, que
// já tem o levantamento real feito direto no Supabase.

export const TIPOS_TRANSACAO = ["Locação", "Compra e Venda"];

export const GARANTIA_OPCOES = ["Fiador", "Caução", "Seguro fiança", "Sem garantias"];

export const FORMA_PAGAMENTO_OPCOES = ["Pix", "Boleto"];

export const FINALIDADE_LOCACAO_OPCOES = ["Residencial", "Comercial", "Mista"];

export const ENCARGOS_OPCOES = [
  "IPTU do ano vigente ao andamento do contrato",
  "TRSD do ano vigente ao andamento do contrato",
  "Condomínio",
  "Água",
  "Energia elétrica",
  "Gás"
];

// Momento de entrega das chaves (usado no cálculo de risco de posse em
// contratos de compra e venda).
export const CHAVE_OPCOES = [
  "na assinatura do contrato de compra e venda",
  "na assinatura do contrato de financiamento",
  "na quitação de todos os itens da cláusula terceira",
  "30 dias após a quitação da cláusula terceira"
];

export const STATUS_HONORARIO_OPCOES = ["Pago", "Pendente", "Parcelado"];

// Parceiro captador (corretor responsável) — mesmo domínio usado em
// Imóveis/Administrações: só faz sentido para quem atua como corretor.
export const FUNCOES_CORRETOR = ["Corretor", "Corretor Estagiário"];

// Status separados por Tipo de transação — levantamento real feito em cima
// dos 263 registros vindos da planilha (coluna Status, ex.: "Imóvel em
// Locação: Locação" / "Transação Finalizada: Compra e Venda" — o sufixo
// depois dos dois-pontos indica o tipo, removido na importação). Usado pra
// o Status do cadastro virar um select fechado (igual ao StatusTransacaoSelect
// da tela de Administração) em vez de texto livre.
export const STATUS_LOCACAO_OPCOES = [
  "Elaboração de Contrato de Locação",
  "Imóvel em locação sem administração",
  "Imóvel em Locação",
  "Transação Finalizada",
  "Distrato",
  "Locação cancelada"
];

export const STATUS_COMPRA_VENDA_OPCOES = ["Elaboração do Contrato de Compra e Venda", "Transação Finalizada", "Distrato"];

export function statusOpcoesPorTipo(tipo: string): string[] {
  return tipo === "Locação" ? STATUS_LOCACAO_OPCOES : STATUS_COMPRA_VENDA_OPCOES;
}

// Condições de pagamento (o "negócio" em si) — Tipo de cada parcela/etapa do
// pagamento, levantado em cima dos 30 registros já existentes na tabela
// condicoes_pagamento (majoritariamente Compra e Venda: entrada + saldo
// financiado, às vezes parcelado direto com o vendedor ou permuta).
// ATENÇÃO: espelha o CHECK constraint condicoes_pagamento_tipo_check no
// banco — qualquer valor fora desta lista quebra o cadastro (erro 23514).
export const TIPO_CONDICAO_OPCOES = ["Entrada", "Saldo", "Financiamento", "Permuta", "Parcelado"];

// Forma de pagamento de cada condição — espelha o CHECK constraint
// condicoes_pagamento_forma_pagamento_check no banco. Antes era texto
// livre, o que permitia digitar qualquer frase e quebrar o cadastro com
// erro 23514; agora é sempre um destes 4 valores fechados.
export const FORMA_PAGAMENTO_CONDICAO_OPCOES = ["pix", "transferência bancária", "dinheiro", "parcelado"];

// Momento do pagamento de cada condição — espelha o CHECK constraint
// condicoes_pagamento_momento_check no banco. Mesma lógica: era texto
// livre, agora é fechado.
export const MOMENTO_CONDICAO_OPCOES = [
  "assinatura do contrato de compra e venda",
  "conforme parcelas",
  "assinatura do contrato de financiamento"
];
