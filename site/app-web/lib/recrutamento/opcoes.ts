// Módulo Recrutamento (29/10/2026) — kanban de acompanhamento de recrutados e
// corretores. Tudo que define o quadro (colunas, textos de orientação, listas
// dos campos) fica aqui pra mudar num lugar só.

export type ColunaId =
  | "Lead"
  | "Em contato"
  | "1ª reunião"
  | "2ª reunião"
  | "Em treinamento"
  | "estagiario"
  | "corretor"
  | "saida"
  | "sem_interesse";

export type Coluna = {
  id: ColunaId;
  label: string;
  grupo: "funil" | "equipe" | "fim";
  // Uma linha: o que fazer nessa etapa (aparece no topo da coluna).
  dica: string;
  // Classes do cabeçalho da coluna.
  cor: string;
};

export const COLUNAS: Coluna[] = [
  { id: "Lead", label: "Lead", grupo: "funil", dica: "Chamar em até 1 dia útil (WhatsApp ou ligação).", cor: "bg-gray-100 text-gray-700 border-gray-200" },
  { id: "Em contato", label: "Em contato", grupo: "funil", dica: "Aguardando retorno. Convidar para a 1ª reunião.", cor: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "1ª reunião", label: "1ª reunião", grupo: "funil", dica: "Conhecer a pessoa e mostrar como somos.", cor: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { id: "2ª reunião", label: "2ª reunião", grupo: "funil", dica: "Só para quem tem interesse em ingressar.", cor: "bg-violet-50 text-violet-700 border-violet-200" },
  { id: "Em treinamento", label: "Em treinamento", grupo: "funil", dica: "Ingressou. Acompanhar os treinamentos.", cor: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "estagiario", label: "Corretor Estagiário", grupo: "equipe", dica: "Ativo. Medir evolução (meta: 9 captações em 90 dias).", cor: "bg-green-50 text-green-700 border-green-200" },
  { id: "corretor", label: "Corretor", grupo: "equipe", dica: "Ativo. Acompanhar desempenho.", cor: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "saida", label: "Saída", grupo: "fim", dica: "Desligados — viram Corretor Externo ou Desligado.", cor: "bg-red-50 text-red-700 border-red-200" },
  { id: "sem_interesse", label: "Sem interesse", grupo: "fim", dica: "Não seguiu no recrutamento.", cor: "bg-gray-50 text-gray-500 border-gray-200" }
];

export const COLUNA_POR_ID = new Map(COLUNAS.map((c) => [c.id, c]));

// Etapas que ficam gravadas em recrutamento.etapa (só quem ainda é "Recrutados").
export const ETAPAS_FUNIL: ColunaId[] = ["Lead", "Em contato", "1ª reunião", "2ª reunião", "Em treinamento"];

export function ehEtapaFunil(id: string): id is ColunaId {
  return (ETAPAS_FUNIL as string[]).includes(id);
}

type ParceiroParaColuna = { funcao: string; status_funcao: string; data_saida: Date | null };

// Coluna do quadro derivada do cadastro do parceiro — a função/status mandam;
// `etapa` só vale pro funil de Recrutados. Devolve null pra quem não aparece
// no quadro (parceiros externos, prestadores etc.).
export function colunaDoParceiro(p: ParceiroParaColuna, etapa: string | null | undefined): ColunaId | null {
  if (p.funcao === "Recrutados") {
    if (p.status_funcao === "Inativo") return "sem_interesse";
    if (p.status_funcao === "Excluído") return null;
    return etapa && ehEtapaFunil(etapa) ? etapa : "Lead";
  }
  if (p.status_funcao === "Ativo") {
    if (p.funcao === "Corretor Estagiário") return "estagiario";
    if (p.funcao === "Corretor") return "corretor";
    return null;
  }
  // Saída: quem foi da equipe e hoje é Corretor Externo/Desligado inativo,
  // com data de saída registrada.
  if (p.status_funcao === "Inativo" && p.data_saida && (p.funcao === "Corretor Externo" || p.funcao === "Desligado")) {
    return "saida";
  }
  return null;
}

// Funções que entram no quadro (consulta do banco).
export const FUNCOES_NO_QUADRO = ["Recrutados", "Corretor Estagiário", "Corretor", "Corretor Externo", "Desligado"];

// ---- Contatos / atividades ----
export const TIPOS_CONTATO = ["Ligação", "WhatsApp", "E-mail", "Reunião", "Visita", "Outro"];
export const RESULTADOS_CONTATO = [
  "Atendeu",
  "Não atendeu",
  "Retornar depois",
  "Interessado",
  "Sem interesse",
  "Agendou reunião",
  "Compareceu",
  "Não compareceu"
];
// Registrado automaticamente quando o card muda de coluna.
export const TIPO_MOVIMENTACAO = "Movimentação";

// ---- Reuniões ----
export const STATUS_REUNIAO = ["Agendada", "Realizada", "Não compareceu", "Remarcada"];
export const INTERESSE_OPCOES = ["Ainda não definido", "Tem interesse", "Sem interesse"];

// ---- TTI / CRECI ----
export const TTI_STATUS = ["Não iniciou", "Matriculado", "Cursando", "Concluído"];
export const CRECI_STATUS = ["Não iniciou", "Em processo (estágio)", "Com CRECI"];

// ---- Metas dos 90 dias (Plano inicial de desenvolvimento) ----
export const META_CAPTACOES = 9;
export const PRAZO_META_DIAS = 90;

// Campos que o autosave aceita (ver salvarCampoRecrutamentoAction).
export const CAMPOS_TEXTO = [
  "proxima_acao_texto",
  "reuniao1_status",
  "reuniao1_notas",
  "reuniao2_status",
  "reuniao2_notas",
  "interesse",
  "tti_status",
  "creci_status",
  "notas"
] as const;
export const CAMPOS_DATA = ["proxima_acao_data", "reuniao1_data", "reuniao2_data", "inicio_treinamento"] as const;
