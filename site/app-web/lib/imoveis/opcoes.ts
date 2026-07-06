// Listas de opções usadas no formulário de Imóveis — vêm dos CHECK
// constraints em site/database/schema.sql, que por sua vez foram extraídos
// das listas (dropdowns) reais do AppSheet original.

export const TIPOS_IMOVEL = ["Residencial", "Comercial", "Terreno", "Rural", "Multifamiliar", "Misto"];

export const STATUS_IMOVEL = ["Pendente", "Parcial", "Completo", "Vencido", "Irregular"];

// No AppSheet, "TipoOferta" é o estágio do funil de captação/oferta do
// imóvel — não é Venda/Locação/Administração.
export const TIPOS_OFERTA = [
  "Rascunho",
  "Em análise",
  "Administração",
  "Em negociação",
  "Inativo",
  "Arquivado"
];

// Parceiro vinculado ao imóvel (captador) — só faz sentido para quem atua
// como corretor, mesmo domínio usado nos contratos de associação.
export const FUNCOES_CAPTADOR = ["Corretor", "Corretor Estagiário"];
