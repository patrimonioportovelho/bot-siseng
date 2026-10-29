// Catálogo de treinamentos acompanhados no Recrutamento. Quem acompanha marca
// "feito" por pessoa (recrutamento.treinamentos = { chave: { feito, data } }).
// Pra incluir um treinamento novo é só somar uma linha aqui — não precisa de
// migração.
//
// Fontes: "Plano inicial de desenvolvimento — novo agente RE/MAX Housy"
// (12 semanas / 90 dias) e Onboarding RE/MAX (programa de 30 dias; até agora
// só o Módulo 5 foi enviado — os demais módulos entram aqui quando vierem).

export type Treinamento = { chave: string; titulo: string };
export type GrupoTreinamento = { id: string; titulo: string; itens: Treinamento[] };

export const GRUPOS_TREINAMENTO: GrupoTreinamento[] = [
  {
    id: "onboarding",
    titulo: "Onboarding RE/MAX (programa de 30 dias)",
    itens: [{ chave: "onb_modulo5", titulo: "Módulo 5 — ACM + Objeções" }]
  },
  {
    id: "plano12",
    titulo: "Plano inicial de desenvolvimento (12 semanas)",
    itens: [
      { chave: "sem01", titulo: "Semana 1 — Trilha do Novo Agente, TTI/CRECI e kit inicial" },
      { chave: "sem02", titulo: "Semana 2 — Projeto 100, zona de posicionamento e 3 visitas de captação" },
      { chave: "sem03", titulo: "Semana 3 — Avaliação do imóvel e 1ª visita" },
      { chave: "sem04", titulo: "Semana 4 — E-mail marketing, ACM e administração de locação" },
      { chave: "sem05", titulo: "Semana 5 — Captação ativa e “Nunca fique sem clientes”" },
      { chave: "sem06", titulo: "Semana 6 — 50 contatos na semana e campanha de e-mail" },
      { chave: "sem07", titulo: "Semana 7 — Acompanhar visitas e “Apresentando-se e entendendo o cliente”" },
      { chave: "sem08", titulo: "Semana 8 — 1 captação por semana e reavaliação das captações" },
      { chave: "sem09", titulo: "Semana 9 — Exclusividade e plano de marketing dos imóveis" },
      { chave: "sem10", titulo: "Semana 10 — Documentação imobiliária e feedback aos clientes" },
      { chave: "sem11", titulo: "Semana 11 — Meta de captações e ACM com um colega" },
      { chave: "sem12", titulo: "Semana 12 — Fechamento do plano de 90 dias" }
    ]
  }
];

export const TODOS_TREINAMENTOS: Treinamento[] = GRUPOS_TREINAMENTO.flatMap((g) => g.itens);
export const CHAVES_TREINAMENTO = new Set(TODOS_TREINAMENTOS.map((t) => t.chave));

export type EstadoTreinamentos = Record<string, { feito: boolean; data?: string }>;

export function progressoTreinamentos(estado: EstadoTreinamentos | null | undefined): { feitos: number; total: number } {
  const e = estado ?? {};
  return {
    feitos: TODOS_TREINAMENTOS.filter((t) => e[t.chave]?.feito).length,
    total: TODOS_TREINAMENTOS.length
  };
}
