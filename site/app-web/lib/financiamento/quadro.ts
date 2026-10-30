// Financiamento em Kanban (30/10/2026). Cada card é uma Avaliação; do crédito
// (Consulta de CPF → Montagem de processo → Aprovado) ela entra no PROCESSO
// quando o Andamento começa (Documentação → Engenharia → Conformidade →
// Comitê → Contrato → Registro) até Concluído. A coluna é derivada do status
// da avaliação e do status do andamento — ver colunaDoCard.

export type ColunaFinId =
  | "cpf"
  | "montagem"
  | "restricao"
  | "standbye"
  | "condicionado"
  | "aprovado"
  | "documentacao"
  | "engenharia"
  | "conformidade"
  | "comite"
  | "contrato"
  | "registro"
  | "concluido"
  | "encerrado";

export type ColunaFin = {
  id: ColunaFinId;
  label: string;
  grupo: "credito" | "processo" | "fim";
  dica: string;
  cor: string;
  // Meta sugerida de permanência na coluna, em dias (ajustável aqui). Passou
  // da meta = card em atraso. null = sem meta.
  slaDias: number | null;
  // Colunas de crédito: valor de avaliacoes.status.
  statusAvaliacao?: string;
  // Colunas de processo: valores de andamentos.status_andamento (o 1º é o
  // padrão ao mover o card pra coluna).
  statusAndamento?: string[];
};

export const COLUNAS_FIN: ColunaFin[] = [
  { id: "cpf", label: "Consulta de CPF", grupo: "credito", dica: "Consultar o CPF e abrir a avaliação de crédito.", cor: "bg-gray-100 text-gray-700 border-gray-200", slaDias: 1, statusAvaliacao: "Consulta de CPF" },
  { id: "montagem", label: "Montagem de processo", grupo: "credito", dica: "Levantamento de crédito: renda, comprometimento e documentos.", cor: "bg-blue-50 text-blue-700 border-blue-200", slaDias: 5, statusAvaliacao: "Montagem de processo" },
  { id: "restricao", label: "Restrição", grupo: "credito", dica: "Cliente com restrição: orientar a regularização.", cor: "bg-red-50 text-red-700 border-red-200", slaDias: 15, statusAvaliacao: "Restrição" },
  { id: "standbye", label: "Standbye", grupo: "credito", dica: "Em espera a pedido do cliente ou do banco.", cor: "bg-amber-50 text-amber-700 border-amber-200", slaDias: 15, statusAvaliacao: "Standbye" },
  { id: "condicionado", label: "Condicionado", grupo: "credito", dica: "Aprovado com condição a cumprir.", cor: "bg-orange-50 text-orange-700 border-orange-200", slaDias: 10, statusAvaliacao: "Condicionado" },
  { id: "aprovado", label: "Aprovado", grupo: "credito", dica: "Crédito aprovado. Acompanhe a validade e inicie o processo.", cor: "bg-indigo-50 text-indigo-700 border-indigo-200", slaDias: 10, statusAvaliacao: "Aprovado" },
  { id: "documentacao", label: "Documentação", grupo: "processo", dica: "Documentos do comprador, do vendedor e do imóvel.", cor: "bg-sky-50 text-sky-700 border-sky-200", slaDias: 10, statusAndamento: ["Pendente", "Aguardando Documentos do vendedor", "Aguardando Documentos do comprador", "Aguardando Documento do Imóvel"] },
  { id: "engenharia", label: "Engenharia e laudo", grupo: "processo", dica: "Vistoria do engenheiro e laudo de avaliação do imóvel.", cor: "bg-cyan-50 text-cyan-700 border-cyan-200", slaDias: 10, statusAndamento: ["Aguardando a Engenharia", "Aguardando o Laudo"] },
  { id: "conformidade", label: "Conformidade", grupo: "processo", dica: "Análise documental e jurídica: conforme ou inconforme.", cor: "bg-violet-50 text-violet-700 border-violet-200", slaDias: 5, statusAndamento: ["Aguardando Conformidade", "Conforme", "Inconforme"] },
  { id: "comite", label: "Comitê e dotação", grupo: "processo", dica: "Aprovação do comitê e dotação orçamentária.", cor: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", slaDias: 15, statusAndamento: ["Aguardando comitê", "Dotação Orçamentária"] },
  { id: "contrato", label: "Assinatura do contrato", grupo: "processo", dica: "Assinar o contrato (alienação fiduciária).", cor: "bg-teal-50 text-teal-700 border-teal-200", slaDias: 7, statusAndamento: ["Assinando Contrato"] },
  { id: "registro", label: "Registro", grupo: "processo", dica: "Registro do contrato na matrícula, em cartório.", cor: "bg-lime-50 text-lime-700 border-lime-200", slaDias: 30, statusAndamento: ["Aguardando Registro"] },
  { id: "concluido", label: "Concluído", grupo: "fim", dica: "Financiamento concluído.", cor: "bg-green-50 text-green-700 border-green-200", slaDias: null, statusAvaliacao: "Concluído", statusAndamento: ["Concluído"] },
  { id: "encerrado", label: "Encerrados", grupo: "fim", dica: "Reprovação, avaliação cancelada ou vencida.", cor: "bg-gray-50 text-gray-500 border-gray-200", slaDias: null }
];

export const COLUNA_FIN_POR_ID = new Map(COLUNAS_FIN.map((c) => [c.id, c]));

export const ENCERRAMENTOS = ["Reprovação", "Avaliação cancelada", "Avaliação vencida"];

export const COLUNAS_CREDITO = COLUNAS_FIN.filter((c) => c.grupo === "credito");
export const COLUNAS_PROCESSO = COLUNAS_FIN.filter((c) => c.grupo === "processo");

// status do andamento -> coluna
const COLUNA_POR_STATUS_ANDAMENTO = new Map<string, ColunaFinId>();
for (const c of COLUNAS_FIN) for (const s of c.statusAndamento ?? []) COLUNA_POR_STATUS_ANDAMENTO.set(s, c.id);

export const STATUS_ANDAMENTO_CONHECIDOS = new Set(COLUNA_POR_STATUS_ANDAMENTO.keys());

// Status que são resultado da conformidade (tratados por botões próprios, com
// motivo da inconformidade — não pelo seletor comum de status).
export const STATUS_CONFORMIDADE = ["Conforme", "Inconforme"];

// Códigos antigos (ex.: "SA0010") e o padrão "Em andamento" vindos da planilha
// de origem viram um status válido: com a avaliação Concluída, é Concluído;
// senão volta pra Pendente.
export function normalizarStatusAndamento(status: string | null | undefined, avaliacaoStatus: string): string {
  if (status && STATUS_ANDAMENTO_CONHECIDOS.has(status)) return status;
  if (avaliacaoStatus === "Concluído") return "Concluído";
  return "Pendente";
}

export function colunaDoCard(avaliacaoStatus: string, andamentoStatus: string | null | undefined): ColunaFinId {
  if (ENCERRAMENTOS.includes(avaliacaoStatus)) return "encerrado";
  if (avaliacaoStatus === "Concluído") return "concluido";
  if (avaliacaoStatus === "Aprovado" && andamentoStatus !== undefined && andamentoStatus !== null) {
    const norm = normalizarStatusAndamento(andamentoStatus, avaliacaoStatus);
    return COLUNA_POR_STATUS_ANDAMENTO.get(norm) ?? "documentacao";
  }
  const direta = COLUNAS_CREDITO.find((c) => c.statusAvaliacao === avaliacaoStatus);
  return direta?.id ?? "cpf";
}

// Etapa em granularidade fina (usada nas atividades pra medir tempo): o status
// do andamento quando o card está no processo, senão o status da avaliação.
export function etapaDoCard(avaliacaoStatus: string, andamentoStatus: string | null | undefined): string {
  const col = colunaDoCard(avaliacaoStatus, andamentoStatus);
  if (COLUNA_FIN_POR_ID.get(col)?.grupo === "processo") return normalizarStatusAndamento(andamentoStatus, avaliacaoStatus);
  return avaliacaoStatus;
}

// Dias de antecedência pro alerta de validade de uma aprovação (mesmo valor da
// lista antiga do Financiamento).
export const DIAS_ALERTA_VALIDADE = 30;

export type SituacaoSla = "ok" | "alerta" | "atrasado" | "sem_meta";

// alerta = a partir de 80% da meta.
export function situacaoSla(coluna: ColunaFinId, diasNaEtapa: number): SituacaoSla {
  const meta = COLUNA_FIN_POR_ID.get(coluna)?.slaDias;
  if (!meta) return "sem_meta";
  if (diasNaEtapa > meta) return "atrasado";
  if (diasNaEtapa >= meta * 0.8) return "alerta";
  return "ok";
}

// ---- tipos de atividade ----
export const TIPO_ETAPA = "etapa";
export const TIPO_CONFORMIDADE = "conformidade";
export const TIPO_INCONFORMIDADE = "inconformidade";
export const TIPO_CONTATO_FIN = "contato";
export const TIPO_NOTA_FIN = "nota";

export const TIPOS_CONTATO_FIN = ["WhatsApp", "Ligação", "E-mail", "Reunião", "Visita ao banco", "Outro"];
