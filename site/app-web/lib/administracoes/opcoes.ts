// Listas de opções do formulário de Administrações — vêm dos CHECK
// constraints em site/database/schema.sql, extraídos das listas reais do
// AppSheet original.

export const STATUS_ADM = ["Captação", "Ativo", "Locado", "Encerrado"];

// Cor de destaque do cabeçalho de cada grupo de Status na listagem
// (app/administracoes/page.tsx) — mesma ideia do TONE_CLASSES de
// components/transacoes-lista.tsx, mas com as cores do funil próprio de
// Administração (pedido do usuário em 06/08/2026: antes o status aparecia
// só como texto cinza, sem nenhum destaque, difícil de bater o olho e ver
// onde cada administração está). "Captação" fica em âmbar de propósito —
// é o status que acabou de chegar (inclusive vindo do portal do corretor)
// e ainda precisa o administrativo gerar o contrato de verdade.
export const TONE_STATUS_ADM: Record<string, string> = {
  "Captação": "bg-amber-50 text-amber-700 border-amber-200",
  "Ativo": "bg-green-50 text-green-700 border-green-200",
  "Locado": "bg-blue-50 text-blue-700 border-blue-200",
  "Encerrado": "bg-gray-50 text-gray-500 border-gray-200"
};
export const TONE_STATUS_ADM_PADRAO = "bg-gray-50 text-gray-500 border-gray-200";

export const AGUA_OPCOES = ["Água da caerd", "Água do condomínio", "Água do poço"];

export const ENERGIA_OPCOES = ["Ligada", "Desligada com relógio", "Desligada sem relógio"];

// Parceiro captador da administração — mesmo domínio usado em Imóveis e nos
// contratos de associação: só faz sentido para quem atua como corretor.
export const FUNCOES_CAPTADOR = ["Corretor", "Corretor Estagiário"];
