// Listas de opções do formulário de Transações — vêm dos CHECK constraints
// em site/database/schema.sql, extraídas das listas reais do AppSheet
// original. Status (aberto/concluído/cancelado) fica em lib/format.ts, que
// já tem o levantamento real feito direto no Supabase.

export const TIPOS_TRANSACAO = ["Locação", "Compra e Venda"];

export const GARANTIA_OPCOES = ["Fiador", "Caução", "Seguro fiança", "Sem garantias"];

export const FORMA_PAGAMENTO_OPCOES = ["Pix", "Boleto"];

export const FINALIDADE_LOCACAO_OPCOES = ["Residencial", "Comercial", "Mista"];

// IPTU e TRSD, dos encargos abaixo, são os únicos que a imobiliária cobra À
// PARTE, junto com o aluguel (fracionado nas mensalidades, ver campos
// iptu/trsd em transacoes) — por isso SOMAM no "Valor de pacote"
// (lib/transacoes/valores.ts). Condomínio é diferente: quando marcado, o
// valor informado já vem EMBUTIDO dentro do valor_transacao (não é cobrado
// à parte) — por isso é DESCONTADO no "Valor da locação", não somado no
// pacote. Água/Energia/Gás continuam sendo só um registro de quem é
// responsável por pagar, cobrados direto pelo terceiro (concessionária),
// sem valor nem cobrança passando pela imobiliária.
export const ENCARGO_IPTU = "IPTU do ano vigente ao andamento do contrato";
export const ENCARGO_TRSD = "TRSD do ano vigente ao andamento do contrato";
export const ENCARGO_CONDOMINIO = "Condomínio";

export const ENCARGOS_OPCOES = [ENCARGO_IPTU, ENCARGO_TRSD, ENCARGO_CONDOMINIO, "Água", "Energia elétrica", "Gás"];

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

// "Elaboração do Contrato de Promessa de Compra e Venda" e "Cancelado"
// adicionados em 01/08/2026 (pedido do usuário) — o primeiro é uma etapa
// intermediária que só o administrativo vê/escolhe (o portal do corretor
// nunca mostra esse dropdown; toda transação criada por lá nasce sempre em
// STATUS_COMPRA_VENDA_OPCOES[0], então basta não colocar o novo status no
// índice 0 pra ele ficar "invisível" pro corretor). "Cancelado" é novo,
// separado de "Distrato" — mesmo padrão que Locação já tinha (Distrato +
// Locação cancelada como dois status distintos). Ver ANDAMENTO_COMPRA_VENDA_OPCOES
// logo abaixo pro sub-status de andamento do contrato, que é um campo
// independente deste.
export const STATUS_COMPRA_VENDA_OPCOES = [
  "Elaboração do Contrato de Compra e Venda",
  "Elaboração do Contrato de Promessa de Compra e Venda",
  "Transação Finalizada",
  "Distrato",
  "Cancelado"
];

// Status de Compra e Venda que, ao serem escolhidos, forçam o Andamento
// (ver ANDAMENTO_COMPRA_VENDA_OPCOES) para "Cancelado" automaticamente —
// aplicado no servidor (app/transacoes/actions.ts), não só na tela.
export const STATUS_COMPRA_VENDA_CANCELAMENTO = ["Distrato", "Cancelado"];

export function statusOpcoesPorTipo(tipo: string): string[] {
  return tipo === "Locação" ? STATUS_LOCACAO_OPCOES : STATUS_COMPRA_VENDA_OPCOES;
}

// Sub-status de ANDAMENTO do contrato de Compra e Venda — pedido do usuário
// em 01/08/2026: diferente do Status normal (que reflete a etapa comercial:
// elaboração/finalizada/distrato/cancelado), o Andamento acompanha o
// processo burocrático de verdade e continua avançando MESMO depois do
// Status já estar "Transação Finalizada" (o negócio em si fechou, mas o
// registro em cartório, por exemplo, ainda pode levar meses). Só existe
// pra Compra e Venda; Locação não usa este campo (fica sempre NULL). Só o
// administrativo altera (mesmo padrão do Status — o portal do corretor
// nunca oferece esse controle).
export const ANDAMENTO_COMPRA_VENDA_OPCOES = [
  "Elaboração",
  "Conferência",
  "Assinatura",
  "Escritura",
  "Financiamento",
  "Registro",
  "Conclusão",
  "Cancelado"
];

// Valor padrão do Andamento pra toda Compra e Venda nova (admin ou portal).
export const ANDAMENTO_COMPRA_VENDA_PADRAO = ANDAMENTO_COMPRA_VENDA_OPCOES[0];

// Mesma paleta de "Tone" usada em statusTone (lib/format.ts) — cores
// diferentes por enquanto: Cancelado vira "cancelada" (vermelho), Conclusão
// vira "concluida" (verde), o resto do processo (ainda rodando) vira
// "ativa" (azul).
export function andamentoTone(andamento: string | null | undefined): "ativa" | "concluida" | "pendente" | "cancelada" {
  if (!andamento) return "pendente";
  if (andamento === "Cancelado") return "cancelada";
  if (andamento === "Conclusão") return "concluida";
  return "ativa";
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
