// Listas de opções e rótulos do módulo de Marketing — mesmo padrão de
// lib/gestoes/opcoes.ts e lib/manutencao/opcoes.ts (quadro Kanban próprio,
// Calendário/Painel compartilhados com os outros dois módulos via
// components/atividades-tabs.tsx). Baseado no Manual Operacional do
// Marketing — Método IMPACTO v3, enviado pelo usuário em 09/08/2026.

export type ColunaKanban = {
  id: string;
  label: string;
};

// Etapas da Ordem de Marketing (Manual, seção 9), nesta ordem exata —
// "recebido" é o valor default da coluna no banco (schema.prisma).
export const COLUNAS_KANBAN: ColunaKanban[] = [
  { id: "recebido", label: "Recebido" },
  { id: "aguardando_briefing", label: "Aguardando briefing" },
  { id: "validacao", label: "Validação" },
  { id: "roteiro", label: "Roteiro" },
  { id: "aguardando_corretor", label: "Aguardando corretor" },
  { id: "gravacao", label: "Gravação" },
  { id: "triagem", label: "Triagem" },
  { id: "edicao", label: "Edição" },
  { id: "aprovacao", label: "Aprovação" },
  { id: "agendado", label: "Agendado" },
  { id: "publicado", label: "Publicado" },
  { id: "resultados", label: "Resultados" }
];

export function labelColuna(value: string): string {
  return COLUNAS_KANBAN.find((c) => c.id === value)?.label ?? value;
}

// Metodologia IMPACTO (versão operacional do Manual IMPACTO da REMAX, que o
// usuário trouxe de um workspace Notion em 09/08/2026 — pedido: "etiquetas
// bem dinâmico, o próprio sistema pode ter um nível de andamentamento da
// metodologia"). É um 2º acrônimo IMPACTO, diferente do usado na Fase 1
// (aquele é o funil de conteúdo da empresa toda; este é o ciclo de vida de
// UMA demanda — Identificar, Mapear, Planejar, Acompanhar, Controlar,
// Transformar, Otimizar) e é o que faz sentido etiquetar por card.
//
// A etiqueta é sempre CALCULADA a partir da coluna do Kanban (nunca um campo
// solto que alguém escolhe à mão) — assim ela nunca fica dessincronizada do
// card: mover a coluna já avança o pilar sozinho, exatamente o "nível de
// andamento" que o usuário pediu.
export type PilarImpacto = {
  id: string;
  letra: string;
  label: string;
};

export const PILARES_IMPACTO: PilarImpacto[] = [
  { id: "identificar", letra: "I", label: "Identificar" },
  { id: "mapear", letra: "M", label: "Mapear" },
  { id: "planejar", letra: "P", label: "Planejar" },
  { id: "acompanhar", letra: "A", label: "Acompanhar" },
  { id: "controlar", letra: "C", label: "Controlar" },
  { id: "transformar", letra: "T", label: "Transformar" },
  { id: "otimizar", letra: "O", label: "Otimizar" }
];

// Cada coluna do quadro pertence a exatamente um pilar — mapeamento fixo,
// não editável pelo usuário (é estrutural, igual às próprias colunas).
const COLUNA_PARA_PILAR: Record<string, string> = {
  recebido: "identificar",
  aguardando_briefing: "mapear",
  validacao: "mapear",
  roteiro: "planejar",
  aguardando_corretor: "planejar",
  gravacao: "acompanhar",
  triagem: "acompanhar",
  edicao: "controlar",
  aprovacao: "controlar",
  agendado: "transformar",
  publicado: "transformar",
  resultados: "otimizar"
};

export function pilarImpactoDaColuna(coluna: string): PilarImpacto {
  const id = COLUNA_PARA_PILAR[coluna] ?? "identificar";
  return PILARES_IMPACTO.find((p) => p.id === id) ?? PILARES_IMPACTO[0];
}

// Cor da etiqueta por pilar — mesma paleta de "urgência"/"prioridade" já
// usada no resto do sistema (tons discretos, sem novas cores no design).
export const PILAR_IMPACTO_COR: Record<string, string> = {
  identificar: "bg-gray-100 text-gray-600 border-gray-200",
  mapear: "bg-[#33587F]/10 text-[#33587F] border-[#33587F]/30",
  planejar: "bg-[#33587F]/10 text-[#33587F] border-[#33587F]/30",
  acompanhar: "bg-[#A9822E]/10 text-[#A9822E] border-[#A9822E]/30",
  controlar: "bg-[#A9822E]/10 text-[#A9822E] border-[#A9822E]/30",
  transformar: "bg-primary/10 text-primary border-primary/30",
  otimizar: "bg-green-100 text-green-700 border-green-200"
};

// Tipo de material do card (Manual, seção 9.1).
export const TIPOS_MATERIAL = ["Foto", "Vídeo", "Ambos"];

// Prioridade do card — "Normal" é o default no banco.
export const PRIORIDADE_OPCOES = ["Baixa", "Normal", "Alta", "Urgente"];

// Situação da aprovação (aparece quando o card chega em "Aprovação").
export const APROVACAO_STATUS_OPCOES = ["Aguardando", "Aprovado", "Reprovado — ajustar"];

// Tipo de atividade que alimenta o calendário compartilhado
// (marketing_atividades.tipo) — mesmo papel do TIPOS_ATIVIDADE de
// lib/gestoes/opcoes.ts, só que no vocabulário de Marketing.
export const TIPOS_ATIVIDADE = ["captacao", "roteiro", "gravacao", "edicao", "aprovacao", "publicacao", "reuniao", "outro"];

export const TIPO_ATIVIDADE_LABEL: Record<string, string> = {
  captacao: "Captação",
  roteiro: "Roteiro",
  gravacao: "Gravação",
  edicao: "Edição",
  aprovacao: "Aprovação",
  publicacao: "Publicação",
  reuniao: "Reunião",
  outro: "Outro"
};

// Checklist por pilar IMPACTO — itens exatos do Manual IMPACTO (Notion, "Os
// sete pilares" → cada um com seu "Checklist"). Substitui o CHECKLIST_PADRAO
// genérico da Fase 1: agora o botão na ficha do card insere só os itens do
// pilar em que a Ordem está AGORA (derivado da coluna — ver
// pilarImpactoDaColuna), então o checklist muda junto com o andamento real
// em vez de ser uma lista única despejada de uma vez no início.
export const CHECKLIST_POR_PILAR: Record<string, string[]> = {
  identificar: ["Demanda registrada", "Objetivo definido", "Responsável inicial definido"],
  mapear: ["Briefing completo", "Materiais anexados", "Persona definida", "Aprovador identificado"],
  planejar: ["Cronograma criado", "Equipe informada", "Datas confirmadas", "Responsáveis definidos"],
  acompanhar: ["Quadro atualizado", "Bloqueios resolvidos", "Prazos mantidos ou reprogramados"],
  controlar: ["Conteúdo aprovado", "Sem erros", "Dentro do prazo", "Orçamento conferido"],
  transformar: ["Conteúdo publicado", "Comercial acionado", "Campanha ativa", "Leads encaminhados e registrados"],
  otimizar: ["KPIs analisados", "Lições registradas", "Melhorias definidas"]
};

// Os 5 modelos de briefing (Manual, seção 7) — guardados em
// marketing_ordens.briefing_dados (Json), escolhidos por briefing_tipo.
// Campos dinâmicos: cada um vira um input no formulário (Fase 2).
export type CampoBriefing = {
  key: string;
  label: string;
  tipo?: "text" | "textarea" | "date";
};

export type TipoBriefing = {
  id: string;
  label: string;
  campos: CampoBriefing[];
};

export const BRIEFING_TIPOS: TipoBriefing[] = [
  {
    id: "imovel_venda",
    label: "Imóvel para venda",
    campos: [
      { key: "corretor", label: "Corretor responsável" },
      { key: "data_horario", label: "Data e horário da captação" },
      { key: "tipo_material", label: "Tipo de material (foto/vídeo/ambos)" },
      { key: "tipo_imovel", label: "Tipo de imóvel" },
      { key: "endereco", label: "Endereço" },
      { key: "valor", label: "Valor" },
      { key: "publico", label: "Público-alvo" },
      { key: "diferenciais", label: "3 a 5 diferenciais", tipo: "textarea" },
      { key: "objetivo", label: "Objetivo da publicação" },
      { key: "formato", label: "Formato (reels, carrossel, stories...)" },
      { key: "corretor_aparece", label: "Corretor aparece no material?" },
      { key: "cta", label: "Chamada para ação (CTA)" },
      { key: "prazo_publicacao", label: "Prazo de publicação", tipo: "date" },
      { key: "observacoes", label: "Observações", tipo: "textarea" }
    ]
  },
  {
    id: "locacao",
    label: "Locação",
    campos: [
      { key: "finalidade", label: "Finalidade" },
      { key: "valor_taxas", label: "Valor e taxas" },
      { key: "publico", label: "Público-alvo" },
      { key: "diferenciais", label: "Diferenciais", tipo: "textarea" },
      { key: "disponibilidade", label: "Disponibilidade" },
      { key: "restricoes", label: "Restrições" },
      { key: "objetivo", label: "Objetivo da publicação" },
      { key: "formato", label: "Formato (reels, carrossel, stories...)" },
      { key: "cta", label: "Chamada para ação (CTA)" }
    ]
  },
  {
    id: "empreendimento",
    label: "Empreendimento",
    campos: [
      { key: "nome", label: "Nome do empreendimento" },
      { key: "representante", label: "Representante/contato" },
      { key: "fase", label: "Fase da obra" },
      { key: "unidades_prioritarias", label: "Unidades prioritárias" },
      { key: "publico", label: "Público-alvo" },
      { key: "mensagem_principal", label: "Mensagem principal", tipo: "textarea" },
      { key: "materiais_existentes", label: "Materiais existentes/faltantes", tipo: "textarea" },
      { key: "entregas_planejadas", label: "Entregas planejadas" },
      { key: "aprovacao", label: "Fluxo de aprovação" },
      { key: "reutilizacao", label: "Pode reutilizar material anterior?" }
    ]
  },
  {
    id: "autoridade_corretor",
    label: "Autoridade do corretor",
    campos: [
      { key: "tema", label: "Tema" },
      { key: "objetivo", label: "Objetivo" },
      { key: "publico", label: "Público-alvo" },
      { key: "gancho", label: "Gancho" },
      { key: "pontos", label: "Pontos a abordar", tipo: "textarea" },
      { key: "formato", label: "Formato (reels, carrossel, stories...)" },
      { key: "cta", label: "Chamada para ação (CTA)" },
      { key: "referencia", label: "Referência/inspiração" }
    ]
  },
  {
    id: "evento_institucional",
    label: "Evento / ação institucional",
    campos: [
      { key: "evento", label: "Nome do evento" },
      { key: "data_local", label: "Data e local" },
      { key: "objetivo", label: "Objetivo" },
      { key: "publico", label: "Público-alvo" },
      { key: "momentos_obrigatorios", label: "Momentos obrigatórios de registro", tipo: "textarea" },
      { key: "entregas", label: "Entregas esperadas" },
      { key: "aprovacao", label: "Fluxo de aprovação" },
      { key: "prazo", label: "Prazo", tipo: "date" }
    ]
  }
];

export function campoBriefing(tipoId: string): TipoBriefing | undefined {
  return BRIEFING_TIPOS.find((t) => t.id === tipoId);
}
