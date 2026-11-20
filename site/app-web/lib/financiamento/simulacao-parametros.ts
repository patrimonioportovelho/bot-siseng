// Parâmetros da simulação habitacional: só a DESCRIÇÃO deles (rótulos, tipos, colunas das tabelas). Os VALORES ficam
// no banco (tabela simulacao_parametros), porque mudam por portaria, resolução ou política da Caixa. Sem importar
// nada do servidor: serve tanto para o motor de cálculo quanto para a tela de edição.

export type TipoCampo = "percentual" | "dinheiro" | "inteiro" | "decimal" | "texto" | "booleano";

export type ColunaTabela = { chave: string; titulo: string; tipo: TipoCampo };

export type DefinicaoParametro =
  | { chave: string; grupo: string; titulo: string; tipo: Exclude<TipoCampo, "texto">; escalar: true }
  | { chave: string; grupo: string; titulo: string; escalar: false; colunas: ColunaTabela[] };

export const DEFINICOES_PARAMETROS: DefinicaoParametro[] = [
  { chave: "comprometimento_max_renda", grupo: "Gerais", titulo: "Comprometimento máximo da renda", tipo: "percentual", escalar: true },
  { chave: "prazo_max_meses", grupo: "Gerais", titulo: "Prazo máximo (meses)", tipo: "inteiro", escalar: true },
  { chave: "idade_max_final_contrato_meses", grupo: "Gerais", titulo: "Idade máxima ao fim do contrato (meses)", tipo: "inteiro", escalar: true },
  { chave: "idade_min_anos", grupo: "Gerais", titulo: "Idade mínima (anos)", tipo: "inteiro", escalar: true },
  { chave: "teto_sfh", grupo: "Gerais", titulo: "Teto do SFH (R$)", tipo: "dinheiro", escalar: true },
  { chave: "sbpe_ltv_sac", grupo: "SBPE", titulo: "Cota máxima SBPE — SAC", tipo: "percentual", escalar: true },
  { chave: "sbpe_ltv_price", grupo: "SBPE", titulo: "Cota máxima SBPE — Price", tipo: "percentual", escalar: true },
  { chave: "sbpe_taxa_nominal_aa_com_relacionamento", grupo: "SBPE", titulo: "Juros nominais a.a. — com relacionamento", tipo: "percentual", escalar: true },
  { chave: "sbpe_taxa_nominal_aa_sem_relacionamento", grupo: "SBPE", titulo: "Juros nominais a.a. — sem relacionamento", tipo: "percentual", escalar: true },
  {
    chave: "mcmv_faixas",
    grupo: "MCMV",
    titulo: "Faixas do MCMV (renda e juros nominais a.a.)",
    escalar: false,
    colunas: [
      { chave: "faixa", titulo: "Faixa", tipo: "inteiro" },
      { chave: "renda_min", titulo: "Renda de (R$)", tipo: "dinheiro" },
      { chave: "renda_max", titulo: "Renda até (R$)", tipo: "dinheiro" },
      { chave: "taxa_cot_nne_min", titulo: "Cotista N/NE mín.", tipo: "percentual" },
      { chave: "taxa_cot_nne_max", titulo: "Cotista N/NE máx.", tipo: "percentual" },
      { chave: "taxa_cot_demais_min", titulo: "Cotista demais mín.", tipo: "percentual" },
      { chave: "taxa_cot_demais_max", titulo: "Cotista demais máx.", tipo: "percentual" },
      { chave: "taxa_nao_cot_min", titulo: "Não cotista mín.", tipo: "percentual" },
      { chave: "taxa_nao_cot_max", titulo: "Não cotista máx.", tipo: "percentual" },
      { chave: "subsidio_usado", titulo: "Subsídio usado (R$)", tipo: "dinheiro" }
    ]
  },
  {
    chave: "mcmv_ltv_usado",
    grupo: "MCMV",
    titulo: "Cota máxima do MCMV para imóvel usado, por faixa",
    escalar: false,
    colunas: [
      { chave: "faixa", titulo: "Faixa", tipo: "inteiro" },
      { chave: "ltv", titulo: "Cota máxima", tipo: "percentual" }
    ]
  },
  {
    chave: "mcmv_tetos",
    grupo: "MCMV",
    titulo: "Tetos do imóvel por município",
    escalar: false,
    colunas: [
      { chave: "municipio", titulo: "Município", tipo: "texto" },
      { chave: "uf", titulo: "UF", tipo: "texto" },
      { chave: "teto_faixa_1_2", titulo: "Teto faixas 1 e 2 (R$)", tipo: "dinheiro" },
      { chave: "teto_faixa_3", titulo: "Teto faixa 3 (R$)", tipo: "dinheiro" },
      { chave: "teto_faixa_4", titulo: "Teto faixa 4 (R$)", tipo: "dinheiro" }
    ]
  },
  {
    chave: "seguro_mip_faixas_idade",
    grupo: "Encargos",
    titulo: "Seguro MIP por idade (taxa mensal sobre o saldo devedor)",
    escalar: false,
    colunas: [
      { chave: "idade_ate", titulo: "Idade até (anos)", tipo: "inteiro" },
      { chave: "taxa_mensal", titulo: "Taxa mensal", tipo: "decimal" }
    ]
  },
  { chave: "seguro_dfi_taxa_mensal", grupo: "Encargos", titulo: "Seguro DFI — taxa mensal sobre o valor do imóvel", tipo: "decimal", escalar: true },
  { chave: "taxa_administracao_mensal", grupo: "Encargos", titulo: "Taxa de administração mensal (R$)", tipo: "dinheiro", escalar: true },
  { chave: "tarifa_avaliacao_pct", grupo: "Encargos", titulo: "Tarifa de avaliação (% do financiado)", tipo: "percentual", escalar: true },
  { chave: "seguro_a_vista", grupo: "Encargos", titulo: "Seguro à vista (R$)", tipo: "dinheiro", escalar: true },
  { chave: "ultima_prestacao_sem_seguros", grupo: "Encargos", titulo: "Última prestação sem MIP/DFI", tipo: "booleano", escalar: true },
  {
    chave: "itbi_aliquotas",
    grupo: "Custos",
    titulo: "Alíquota do ITBI por município",
    escalar: false,
    colunas: [
      { chave: "municipio", titulo: "Município", tipo: "texto" },
      { chave: "uf", titulo: "UF", tipo: "texto" },
      { chave: "aliquota", titulo: "Alíquota", tipo: "percentual" }
    ]
  }
];

export const DEFINICAO_PARAMETRO_POR_CHAVE = new Map(DEFINICOES_PARAMETROS.map((d) => [d.chave, d]));

// Parâmetros como o motor de cálculo os recebe (valor ausente/null = "não configurado").
export type FaixaMcmv = {
  faixa: number;
  renda_min: number;
  renda_max: number;
  taxa_cot_nne_min: number;
  taxa_cot_nne_max: number;
  taxa_cot_demais_min: number;
  taxa_cot_demais_max: number;
  taxa_nao_cot_min: number;
  taxa_nao_cot_max: number;
  subsidio_usado: number;
};

export type ParametrosSimulacao = {
  comprometimento_max_renda?: number | null;
  prazo_max_meses?: number | null;
  idade_max_final_contrato_meses?: number | null;
  idade_min_anos?: number | null;
  teto_sfh?: number | null;
  sbpe_ltv_sac?: number | null;
  sbpe_ltv_price?: number | null;
  sbpe_taxa_nominal_aa_com_relacionamento?: number | null;
  sbpe_taxa_nominal_aa_sem_relacionamento?: number | null;
  mcmv_faixas?: FaixaMcmv[] | null;
  mcmv_ltv_usado?: { faixa: number; ltv: number | null }[] | null;
  mcmv_tetos?: { municipio: string; uf: string; teto_faixa_1_2: number; teto_faixa_3: number; teto_faixa_4: number }[] | null;
  seguro_mip_faixas_idade?: { idade_ate: number; taxa_mensal: number }[] | null;
  seguro_dfi_taxa_mensal?: number | null;
  taxa_administracao_mensal?: number | null;
  tarifa_avaliacao_pct?: number | null;
  seguro_a_vista?: number | null;
  ultima_prestacao_sem_seguros?: boolean | null;
  itbi_aliquotas?: { municipio: string; uf: string; aliquota: number }[] | null;
};

// Valida o valor de um parâmetro antes de gravar. Devolve o valor limpo ou uma mensagem de erro.
export function validarValorParametro(chave: string, bruto: unknown): { ok: true; valor: unknown } | { ok: false; erro: string } {
  const def = DEFINICAO_PARAMETRO_POR_CHAVE.get(chave);
  if (!def) return { ok: false, erro: "Parâmetro desconhecido." };

  const numero = (v: unknown, tipo: TipoCampo): number | null | "invalido" => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return "invalido";
    if (tipo === "inteiro" && !Number.isInteger(n)) return "invalido";
    if (tipo === "percentual" && n > 1) return "invalido";
    return n;
  };

  if (def.escalar) {
    if (def.tipo === "booleano") return { ok: true, valor: bruto === null || bruto === "" ? null : bruto === true || bruto === "true" };
    const n = numero(bruto, def.tipo);
    if (n === "invalido") return { ok: false, erro: `Valor inválido em "${def.titulo}".` };
    return { ok: true, valor: n };
  }

  if (!Array.isArray(bruto)) return { ok: false, erro: "Tabela inválida." };
  const linhas: Record<string, unknown>[] = [];
  for (const [i, linha] of bruto.entries()) {
    const out: Record<string, unknown> = {};
    for (const col of def.colunas) {
      const v = (linha as Record<string, unknown>)?.[col.chave];
      if (col.tipo === "texto") {
        const t = String(v ?? "").trim();
        if (!t) return { ok: false, erro: `Linha ${i + 1}: preencha "${col.titulo}".` };
        out[col.chave] = col.chave === "uf" ? t.toUpperCase() : t;
      } else {
        const n = numero(v, col.tipo);
        if (n === "invalido") return { ok: false, erro: `Linha ${i + 1}: valor inválido em "${col.titulo}".` };
        // a cota por faixa pode ficar em branco (= não configurada); nas demais colunas o número é obrigatório
        if (n === null && !(chave === "mcmv_ltv_usado" && col.chave === "ltv")) return { ok: false, erro: `Linha ${i + 1}: preencha "${col.titulo}".` };
        out[col.chave] = n;
      }
    }
    linhas.push(out);
  }
  return { ok: true, valor: linhas };
}
