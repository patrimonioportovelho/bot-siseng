// Catálogo dos checklists acompanhados no Recrutamento, conforme o "Processo de
// Recrutamento e Treinamento de Corretores — RE/MAX Engimob" (Josi,
// 02/10/2026). Quem acompanha marca "feito" por pessoa
// (recrutamento.treinamentos = { chave: { feito, data } }). Pra incluir um item
// novo é só somar uma linha aqui — não precisa de migração.

export type Treinamento = { chave: string; titulo: string };
export type GrupoTreinamento = { id: string; titulo: string; itens: Treinamento[] };

// Presenças que contam na regra dos 100% (4 encontros dos 9 Passos + 2 tardes
// de específicos). Acolhida e acessos só para quem fez todas.
export const PRESENCAS_TURMA: Treinamento[] = [
  { chave: "enc1", titulo: "Encontro 1 (ter) — Posicionamento e Estudo de mercado" },
  { chave: "enc2", titulo: "Encontro 2 (qua) — Dossiê do corretor e Plano de marketing" },
  {
    chave: "enc3",
    titulo: "Encontro 3 (qui) — Representação exclusiva e Dossiê do imóvel (captação com e sem gestão)"
  },
  { chave: "enc4", titulo: "Encontro 4 (sex) — Acompanhamento, Fotografia e Parcerias" },
  {
    chave: "esp_a",
    titulo: "Específicos A (ter, 14h–18h) — Comercial, Marketing, Simulação habitacional e Financeiro"
  },
  {
    chave: "esp_b",
    titulo: "Específicos B (qui, 14h–18h) — Locação, Despachante, Empreendimentos e mentorias (Vinicius e Marta)"
  }
];
export const CHAVES_PRESENCA = PRESENCAS_TURMA.map((p) => p.chave);

export const GRUPOS_TREINAMENTO: GrupoTreinamento[] = [
  {
    id: "documentacao",
    titulo: "Decisão e documentação (até 7 dias após a 2ª reunião)",
    itens: [
      { chave: "doc_pessoais", titulo: "Documentos pessoais" },
      { chave: "doc_creci", titulo: "CRECI (ou plano para tirar)" },
      { chave: "doc_teste", titulo: "Teste comportamental" },
      { chave: "doc_referencias", titulo: "Referências verificadas" },
      { chave: "doc_contrato", titulo: "Contrato de associação assinado (= recrutado)" }
    ]
  },
  {
    id: "turma",
    titulo: "Turma — presença (100% para a acolhida)",
    itens: PRESENCAS_TURMA
  },
  {
    id: "acolhida",
    titulo: "Acolhida e acessos (só com 100% na turma)",
    itens: [
      { chave: "acolhida", titulo: "Acolhida realizada (missão, visão, valores, “todos ganham”)" },
      { chave: "plano90", titulo: "Plano de 90 dias entregue" },
      { chave: "acesso_google", titulo: "Acesso Google" },
      { chave: "acesso_maxpro", titulo: "Acesso MAX PRO" },
      { chave: "acesso_universidade", titulo: "Acesso Universidade RE/MAX" },
      { chave: "acesso_remarkt", titulo: "Acesso Remarkt" },
      { chave: "cracha_pin", titulo: "Crachá e pin" }
    ]
  },
  {
    id: "universidade",
    titulo: "Universidade RE/MAX (opcional)",
    itens: [{ chave: "onb_modulo5", titulo: "Onboarding — Módulo 5: ACM + Objeções" }]
  }
];

export const TODOS_TREINAMENTOS: Treinamento[] = GRUPOS_TREINAMENTO.flatMap((g) => g.itens);
export const CHAVES_TREINAMENTO = new Set(TODOS_TREINAMENTOS.map((t) => t.chave));

export type EstadoTreinamentos = Record<string, { feito: boolean; data?: string }>;

export function presencaTurma(estado: EstadoTreinamentos | null | undefined): { feitas: number; total: number } {
  const e = estado ?? {};
  return { feitas: CHAVES_PRESENCA.filter((c) => e[c]?.feito).length, total: CHAVES_PRESENCA.length };
}

// Mantido pro quadro: progresso da turma (presenças) é o que importa em
// "Em treinamento".
export function progressoTreinamentos(estado: EstadoTreinamentos | null | undefined): { feitos: number; total: number } {
  const p = presencaTurma(estado);
  return { feitos: p.feitas, total: p.total };
}
