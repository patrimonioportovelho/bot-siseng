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
