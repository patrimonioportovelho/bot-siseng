// Listas de opções do formulário de Administrações — vêm dos CHECK
// constraints em site/database/schema.sql, extraídos das listas reais do
// AppSheet original.

export const STATUS_ADM = ["Captação", "Ativo", "Locado", "Encerrado"];

export const AGUA_OPCOES = ["Água da caerd", "Água do condomínio", "Água do poço"];

export const ENERGIA_OPCOES = ["Ligada", "Desligada com relógio", "Desligada sem relógio"];

// Parceiro captador da administração — mesmo domínio usado em Imóveis e nos
// contratos de associação: só faz sentido para quem atua como corretor.
export const FUNCOES_CAPTADOR = ["Corretor", "Corretor Estagiário"];
