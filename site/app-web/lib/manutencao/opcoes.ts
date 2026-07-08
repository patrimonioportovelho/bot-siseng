// Listas de opções e rótulos do módulo de Manutenção · Administração —
// ferramenta interna (não comercial) pra acompanhar solicitações de
// manutenção dos imóveis. Ver spec-manutencao-administracao.md.docx.

export type ColunaKanban = {
  id: string;
  label: string;
};

// Colunas fixas do quadro, nesta ordem exata (ver spec).
export const COLUNAS_KANBAN: ColunaKanban[] = [
  { id: "solicitado", label: "Solicitado" },
  { id: "orcamento", label: "Orçamento" },
  { id: "aprovado", label: "Aprovado p/ Proprietário" },
  { id: "contratado", label: "Prestador Contratado" },
  { id: "em_execucao", label: "Em Execução" },
  { id: "concluido", label: "Concluído" },
  { id: "pago", label: "Pago/Encerrado" }
];

export const TIPOS_SERVICO: { value: string; label: string; icone: string }[] = [
  { value: "copia_chave", label: "Cópia de chave", icone: "🔑" },
  { value: "eletrica", label: "Elétrica", icone: "⚡" },
  { value: "hidraulica", label: "Hidráulica", icone: "🚿" },
  { value: "telhado", label: "Telhado", icone: "🏠" },
  { value: "pintura", label: "Pintura", icone: "🎨" },
  { value: "portoes_fechaduras", label: "Portões/Fechaduras", icone: "🚪" },
  { value: "jardim", label: "Jardim", icone: "🌿" },
  { value: "dedetizacao", label: "Dedetização", icone: "🐜" },
  { value: "ar_condicionado", label: "Ar-condicionado", icone: "❄️" },
  { value: "limpeza", label: "Limpeza", icone: "🧹" },
  { value: "reforma", label: "Reforma", icone: "🛠️" },
  { value: "outro", label: "Outro", icone: "📋" }
];

export const URGENCIAS = ["baixa", "media", "alta", "emergencial"] as const;

export const URGENCIA_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  emergencial: "Emergencial"
};

// Cores da identidade visual do protótipo já validado (ver spec).
export const URGENCIA_COR: Record<string, { bg: string; texto: string; borda: string }> = {
  baixa: { bg: "bg-gray-100", texto: "text-gray-600", borda: "border-gray-300" },
  media: { bg: "bg-[#33587F]/10", texto: "text-[#33587F]", borda: "border-[#33587F]/30" },
  alta: { bg: "bg-[#A9822E]/10", texto: "text-[#A9822E]", borda: "border-[#A9822E]/40" },
  emergencial: { bg: "bg-[#B14226]/10", texto: "text-[#B14226]", borda: "border-[#B14226]/40" }
};

export const SOLICITADO_POR = ["proprietario", "inquilino", "corretor", "vistoria", "equipe_interna"];

export const SOLICITADO_POR_LABEL: Record<string, string> = {
  proprietario: "Proprietário",
  inquilino: "Inquilino",
  corretor: "Corretor",
  vistoria: "Vistoria",
  equipe_interna: "Equipe interna"
};

export const AUTORIZADO_POR = ["pendente", "proprietario", "imobiliaria"];

export const AUTORIZADO_POR_LABEL: Record<string, string> = {
  pendente: "Pendente",
  proprietario: "Proprietário",
  imobiliaria: "Imobiliária"
};

export const CHAVE_POSSE = ["imobiliaria", "corretor", "proprietario", "inquilino", "terceiro"];

export const CHAVE_POSSE_LABEL: Record<string, string> = {
  imobiliaria: "Imobiliária",
  corretor: "Corretor",
  proprietario: "Proprietário",
  inquilino: "Inquilino",
  terceiro: "Terceiro"
};

export const TIPOS_ATIVIDADE = [
  "vistoria_periodica",
  "manutencao",
  "visita",
  "reuniao",
  "entrega_chave",
  "documento",
  "outro"
];

export const TIPO_ATIVIDADE_LABEL: Record<string, string> = {
  vistoria_periodica: "Vistoria periódica",
  manutencao: "Manutenção",
  visita: "Visita",
  reuniao: "Reunião",
  entrega_chave: "Entrega de chave",
  documento: "Documento",
  outro: "Outro"
};

export function labelTipoServico(value: string): string {
  return TIPOS_SERVICO.find((t) => t.value === value)?.label ?? value;
}

export function iconeTipoServico(value: string): string {
  return TIPOS_SERVICO.find((t) => t.value === value)?.icone ?? "📋";
}

export function labelColuna(value: string): string {
  return COLUNAS_KANBAN.find((c) => c.id === value)?.label ?? value;
}
