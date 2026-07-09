// Listas de opções e rótulos do módulo de Gestões (dentro de Atividades) —
// acompanha o Contrato de Gestão (Captação Exclusiva) desde a geração no
// portal do corretor até o fim do prazo. Mesmo padrão de Manutenção
// (lib/manutencao/opcoes.ts), quadro separado mas Calendário/Painel
// compartilhados entre os dois módulos.

export type ColunaKanban = {
  id: string;
  label: string;
};

// Percurso da gestão, nesta ordem exata — Captação (exclusiva) é onde a
// etiqueta nasce sozinha assim que o corretor gera o contrato pelo portal.
export const COLUNAS_KANBAN: ColunaKanban[] = [
  { id: "captacao_exclusiva", label: "Captação (exclusiva)" },
  { id: "gestao_ativa", label: "Gestão Ativa do Imóvel" },
  { id: "comercializacao", label: "Comercialização" },
  { id: "visitas", label: "Visitas" },
  { id: "proposta_negociacao", label: "Proposta / Negociação" }
];

export function labelColuna(value: string): string {
  return COLUNAS_KANBAN.find((c) => c.id === value)?.label ?? value;
}

// Mesmo domínio de posse de chave já usado em Manutenção — reaproveitado
// aqui pra não inventar um segundo vocabulário pra a mesma coisa.
export const CHAVE_POSSE = ["imobiliaria", "corretor", "proprietario", "inquilino", "terceiro"];

export const CHAVE_POSSE_LABEL: Record<string, string> = {
  imobiliaria: "Imobiliária",
  corretor: "Corretor",
  proprietario: "Proprietário",
  inquilino: "Inquilino",
  terceiro: "Terceiro"
};

export const TIPOS_ATIVIDADE = [
  "vencimento_contrato",
  "visita",
  "proposta",
  "reuniao",
  "documento",
  "outro"
];

export const TIPO_ATIVIDADE_LABEL: Record<string, string> = {
  vencimento_contrato: "Vencimento do contrato",
  visita: "Visita",
  proposta: "Proposta",
  reuniao: "Reunião",
  documento: "Documento",
  outro: "Outro"
};
