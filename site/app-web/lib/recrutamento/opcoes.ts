// Módulo Recrutamento — kanban de acompanhamento de recrutados e corretores.
// Segue o "Processo de Recrutamento e Treinamento de Corretores — RE/MAX
// Engimob" (Josi, atualizado em 02/10/2026): esteira de seleção, turmas
// quinzenais, regra dos 100%, acolhida em até 30 dias e acompanhamento de 90
// dias. Tudo que define o quadro fica aqui pra mudar num lugar só.

export type ColunaId =
  | "Lead"
  | "Em contato"
  | "1ª reunião"
  | "2ª reunião"
  | "Decisão e documentação"
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
  { id: "Lead", label: "Lead", grupo: "funil", dica: "1º contato em até 1 hora útil (roteiro do 1º contato).", cor: "bg-gray-100 text-gray-700 border-gray-200" },
  { id: "Em contato", label: "Em contato", grupo: "funil", dica: "Agendar a 1ª reunião (até 3 dias). Follow-up D+1, D+3, D+7, D+15, D+30.", cor: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "1ª reunião", label: "1ª reunião", grupo: "funil", dica: "Diagnóstico (30–45 min): perfil, motivação, reserva e disponibilidade.", cor: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { id: "2ª reunião", label: "2ª reunião", grupo: "funil", dica: "Modelo de negócio (60 min). O broker aprova a associação.", cor: "bg-violet-50 text-violet-700 border-violet-200" },
  { id: "Decisão e documentação", label: "Decisão e documentação", grupo: "funil", dica: "Até 7 dias: documentos, referências e contrato de associação.", cor: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  { id: "Em treinamento", label: "Em treinamento", grupo: "funil", dica: "Turma: 9 Passos + específicos. Acolhida só com 100% de presença.", cor: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "estagiario", label: "Corretor Estagiário", grupo: "equipe", dica: "Acolhido. Check-in semanal nos primeiros 90 dias.", cor: "bg-green-50 text-green-700 border-green-200" },
  { id: "corretor", label: "Corretor", grupo: "equipe", dica: "Acolhido. Check-in semanal nos primeiros 90 dias.", cor: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "saida", label: "Saída", grupo: "fim", dica: "Desligados — viram Corretor Externo ou Desligado.", cor: "bg-red-50 text-red-700 border-red-200" },
  { id: "sem_interesse", label: "Sem interesse", grupo: "fim", dica: "Desistiu ou não seguiu. O motivo é obrigatório.", cor: "bg-gray-50 text-gray-500 border-gray-200" }
];

export const COLUNA_POR_ID = new Map(COLUNAS.map((c) => [c.id, c]));

// Etapas que ficam gravadas em recrutamento.etapa (só quem ainda é "Recrutados").
export const ETAPAS_FUNIL: ColunaId[] = ["Lead", "Em contato", "1ª reunião", "2ª reunião", "Decisão e documentação", "Em treinamento"];

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

// ---- Canal de origem (metas do mês: 60 tráfego pago, 40 prospecção, 20 indicações) ----
export const CANAIS = ["Tráfego pago", "Prospecção ativa", "Indicação"] as const;
export const META_CANAL_MES: Record<string, number> = { "Tráfego pago": 60, "Prospecção ativa": 40, Indicação: 20 };

// ---- Contatos / atividades ----
export const TIPOS_CONTATO = ["Ligação", "WhatsApp", "E-mail", "Reunião", "Follow-up", "Check-in semanal", "Visita", "Outro"];
export const RESULTADOS_CONTATO = [
  "Mensagem enviada",
  "Atendeu",
  "Não atendeu",
  "Retornar depois",
  "Confirmou presença",
  "Interessado",
  "Sem interesse",
  "Agendou reunião",
  "Compareceu",
  "Não compareceu",
  "Remarcou",
  "Desistiu"
];
// Registrado automaticamente quando o card muda de coluna.
export const TIPO_MOVIMENTACAO = "Movimentação";
export const TIPO_CHECKIN = "Check-in semanal";

// ---- Reuniões ----
export const STATUS_REUNIAO = ["Agendada", "Confirmada", "Realizada", "Não compareceu", "Remarcada"];
export const INTERESSE_OPCOES = ["Ainda não definido", "Tem interesse", "Sem interesse"];

// ---- Motivo de falta ou desistência (100% dos casos com motivo registrado) ----
export const MOTIVOS_DESISTENCIA = [
  "Financeiro / sem reserva",
  "Família",
  "Emprego atual ou horário",
  "Não se identificou com o modelo",
  "Escolheu outra imobiliária",
  "Sem retorno",
  "Outro"
];

// ---- TTI / CRECI ----
export const TTI_STATUS = ["Não iniciou", "Matriculado", "Cursando", "Concluído"];
export const CRECI_STATUS = ["Não iniciou", "Em processo (estágio)", "Com CRECI"];

// ---- Cadência de follow-up de quem ainda não decidiu ----
export type PassoFollowup = { chave: string; dias: number; titulo: string };
export const CADENCIA_FOLLOWUP: PassoFollowup[] = [
  { chave: "d1", dias: 1, titulo: "D+1 — agradecimento" },
  { chave: "d3", dias: 3, titulo: "D+3 — resposta a dúvidas" },
  { chave: "d7", dias: 7, titulo: "D+7 — convite para conhecer o escritório" },
  { chave: "d15", dias: 15, titulo: "D+15 — depoimento de um corretor da casa" },
  { chave: "d30", dias: 30, titulo: "D+30 — convite para a próxima turma" }
];
// Etapas em que a cadência vale (depois de uma reunião realizada).
export const ETAPAS_COM_FOLLOWUP: ColunaId[] = ["1ª reunião", "2ª reunião", "Decisão e documentação"];

// ---- Diagnóstico da 1ª reunião (perguntas do processo) ----
export const DIAGNOSTICO_PERGUNTAS = [
  { chave: "porque_mudar", texto: "Por que quer mudar de carreira agora?" },
  { chave: "gosta_nao_gosta", texto: "O que mais gosta e menos gosta no trabalho atual?" },
  { chave: "sustento", texto: "Como se sustentaria nos primeiros meses sem comissão? (reserva financeira)" },
  { chave: "horas", texto: "Quantas horas por semana pode dedicar?" },
  { chave: "apoio", texto: "Quem na família apoia a decisão?" },
  { chave: "trilha_100", texto: "Consegue cumprir 100% da trilha de treinamento nas datas da turma?" },
  { chave: "teste_comportamental", texto: "Resultado do teste comportamental" }
];
export const CHAVES_DIAGNOSTICO = new Set(DIAGNOSTICO_PERGUNTAS.map((p) => p.chave));

// ---- Roteiro do primeiro contato ----
export const ROTEIRO_PRIMEIRO_CONTATO = [
  "Apresente-se: “Oi, [nome], aqui é a Josi, da RE/MAX Engimob. Vi que você se interessou pela carreira de corretor.”",
  "Seja gentil: “Tem dois minutinhos agora?”",
  "Entenda o momento: “O que te chamou atenção no mercado imobiliário?”",
  "Busque o encontro, não a venda: “Vale a gente conversar 30 minutos para eu entender seu momento e te mostrar como funciona.”",
  "Agendamento: “Fica melhor amanhã às 10h ou às 15h?”"
];
export const AVISO_PRIMEIRO_CONTATO =
  "Nunca prometer ganho e nunca falar em “vaga”. Avisar que o modelo é empreendedor, sem salário fixo nem vínculo empregatício, e que é preciso reserva financeira até a primeira venda.";

// ---- Regras do processo ----
export const PRAZO_ACOLHIDA_DIAS = 30; // acolhida em até 30 dias do início da turma
export const JANELA_ACOMPANHAMENTO_DIAS = 90; // check-in semanal nos primeiros 90 dias
export const PRAZO_CHECKIN_DIAS = 7;
export const PRAZO_PRIMEIRO_CONTATO_HORAS = 1;
export const DIAS_INSCRICAO_ANTES_TURMA = 3; // inscrições fecham 3 dias antes da turma

// ---- Metas mensais (ponto de partida do processo; a partir do 2º mês usar as taxas reais) ----
export const METAS_MES = {
  prospectados: 120,
  reunioes1Agendadas: 45,
  reunioes1Realizadas: 36,
  positivas: 16,
  reunioes2Realizadas: 16,
  recrutados: 5,
  acolhidos: 5,
  comparecimento: 0.8
};

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
  "notas",
  "canal",
  "motivo_desistencia",
  "motivo_obs"
] as const;
export const CAMPOS_DATA = [
  "proxima_acao_data",
  "reuniao1_data",
  "reuniao2_data",
  "inicio_treinamento",
  "aprovacao_broker_em",
  "contrato_assinado_em",
  "acolhida_em"
] as const;
