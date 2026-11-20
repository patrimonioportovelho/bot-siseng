import type { FaixaMcmv, ParametrosSimulacao } from "@/lib/financiamento/simulacao-parametros";

// Motor de cálculo da simulação habitacional de imóveis usados (Caixa). Função pura: recebe as respostas e os
// parâmetros (que vêm do banco) e devolve o resultado, sem nenhum valor de taxa, teto ou seguro escrito aqui.
//
// Como a Caixa calcula (conferido contra uma simulação real de 18/09/2026, MCMV, Porto Velho, SAC, 400 meses):
//   - Juros mensais = juros NOMINAIS ao ano ÷ 12 (não é a taxa efetiva convertida). A taxa efetiva (7,93% para
//     7,66% nominal) é só informativa.
//   - Prestação (SAC) = amortização + juros sobre o saldo devedor; a soma das parcelas bate centavo a centavo.
//   - Encargo mensal = prestação + MIP (taxa por faixa de idade × saldo devedor) + DFI (taxa × valor do imóvel)
//     + taxa de administração. Na última prestação a Caixa não cobra MIP/DFI.
//   - CET = TIR do fluxo (valor financiado − seguro à vista − tarifa de avaliação) contra os encargos.
//   - A 1ª prestação da Caixa vem R$ 0,20 acima do encargo calculado aqui (ajuste de dias): é estimativa.

export type Sistema = "SAC" | "PRICE";

export type EntradaSimulacao = {
  valor_compra: number;
  valor_avaliacao?: number | null;
  municipio: string;
  uf: string;
  renda_bruta_familiar: number;
  data_nascimento_mais_velho: string; // YYYY-MM-DD
  sistema_amortizacao: Sistema;
  prazo_desejado_meses?: number | null;
  fgts_3_anos: boolean;
  saldo_fgts?: number | null;
  possui_imovel_residencial_municipio: boolean;
  possui_financiamento_sfh_ativo: boolean;
  ja_usou_fgts_em_financiamento: boolean;
  cotista_fgts: boolean;
  relacionamento_caixa?: boolean | null;
  data_simulacao?: string; // YYYY-MM-DD (padrão: hoje)
};

export type StatusSimulacao = "ok" | "fora_do_escopo" | "inelegivel_idade" | "parametro_ausente" | "sfi" | "entrada_invalida" | "renda_insuficiente";

// [n, prestação, MIP, DFI, taxa de administração, encargo, saldo devedor após o pagamento]
export type LinhaCronograma = [number, number, number, number, number, number, number];

export type ResultadoSimulacao = {
  status: StatusSimulacao;
  mensagem: string | null;
  parametros_ausentes: string[];
  modalidade: "MCMV" | "SBPE" | null;
  faixa_mcmv: number | null;
  motivo_enquadramento: string | null;
  base_calculo: number | null;
  avaliacao_pendente: boolean;
  sistema_amortizacao: Sistema | null;
  taxa_nominal_aa: number | null;
  taxa_efetiva_aa: number | null;
  taxa_am: number | null;
  indexador: "TR";
  prazo_meses: number | null;
  ltv_aplicado: number | null;
  financiamento_max_ltv: number | null;
  financiamento_max_renda: number | null;
  valor_financiado: number | null;
  limitado_por: "ltv" | "renda" | null;
  primeira_prestacao: number | null;
  ultima_prestacao: number | null;
  soma_parcelas: number | null;
  soma_encargos: number | null;
  composicao_primeira: { amortizacao: number; juros: number; mip: number; dfi: number; taxa_administracao: number } | null;
  cet_aa: number | null;
  encargos_incluidos: boolean;
  subsidio: number;
  entrada_total: number | null;
  fgts_elegivel: boolean;
  fgts_utilizavel: number | null;
  recursos_proprios: number | null;
  impacto_avaliacao: number | null;
  custos_iniciais: { tarifa_avaliacao: number | null; seguro_a_vista: number | null; itbi_estimado: number | null };
  primeiro_vencimento: string | null;
  cronograma: LinhaCronograma[];
  alertas: string[];
  checklist_imovel_usado: string[];
  aviso: string;
};

export const AVISO_SIMULACAO =
  "Estimativa. Valores finais dependem da análise de crédito, do laudo de avaliação e da documentação, e das condições vigentes na data da contratação.";

export const CHECKLIST_IMOVEL_USADO = [
  "Avaliação de engenharia pela Caixa (laudo), com custo para o proponente.",
  "Matrícula atualizada, sem ônus impeditivos.",
  "Imóvel regular, habitável e com área construída averbada (área não averbada pode não entrar no valor).",
  "Documentação do vendedor (certidões pessoais e do imóvel).",
  "Débitos de IPTU e condomínio quitados.",
  "ITBI e registro por conta do comprador."
];

const UFS_NORTE_NORDESTE = new Set(["AC", "AP", "AM", "PA", "RO", "RR", "TO", "AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"]);

const r2 = (n: number) => Math.round(n * 100) / 100;
const dinheiro = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number, casas = 2) => `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

function lerData(s: string | undefined | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

// Meses completos entre duas datas (a - b), como na contagem de idade.
function mesesEntre(inicio: Date, fim: Date): number {
  let m = (fim.getUTCFullYear() - inicio.getUTCFullYear()) * 12 + (fim.getUTCMonth() - inicio.getUTCMonth());
  if (fim.getUTCDate() < inicio.getUTCDate()) m -= 1;
  return m;
}

function somarMeses(d: Date, k: number): Date {
  const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d.getUTCDate(), ultimoDia));
  return alvo;
}

function vazio(extra: Partial<ResultadoSimulacao>): ResultadoSimulacao {
  return {
    status: "ok",
    mensagem: null,
    parametros_ausentes: [],
    modalidade: null,
    faixa_mcmv: null,
    motivo_enquadramento: null,
    base_calculo: null,
    avaliacao_pendente: false,
    sistema_amortizacao: null,
    taxa_nominal_aa: null,
    taxa_efetiva_aa: null,
    taxa_am: null,
    indexador: "TR",
    prazo_meses: null,
    ltv_aplicado: null,
    financiamento_max_ltv: null,
    financiamento_max_renda: null,
    valor_financiado: null,
    limitado_por: null,
    primeira_prestacao: null,
    ultima_prestacao: null,
    soma_parcelas: null,
    soma_encargos: null,
    composicao_primeira: null,
    cet_aa: null,
    encargos_incluidos: false,
    subsidio: 0,
    entrada_total: null,
    fgts_elegivel: false,
    fgts_utilizavel: null,
    recursos_proprios: null,
    impacto_avaliacao: null,
    custos_iniciais: { tarifa_avaliacao: null, seguro_a_vista: null, itbi_estimado: null },
    primeiro_vencimento: null,
    cronograma: [],
    alertas: [],
    checklist_imovel_usado: CHECKLIST_IMOVEL_USADO,
    aviso: AVISO_SIMULACAO,
    ...extra
  };
}

// Taxa nominal ao ano da faixa do MCMV: coluna pela região (Norte/Nordeste x demais) e por ser cotista do FGTS.
// Nas faixas em que a taxa tem mínimo e máximo, interpola linearmente pela renda dentro da faixa.
function taxaMcmv(f: FaixaMcmv, renda: number, uf: string, cotista: boolean): { taxa: number; interpolada: boolean } {
  const [min, max] = cotista
    ? UFS_NORTE_NORDESTE.has(uf)
      ? [f.taxa_cot_nne_min, f.taxa_cot_nne_max]
      : [f.taxa_cot_demais_min, f.taxa_cot_demais_max]
    : [f.taxa_nao_cot_min, f.taxa_nao_cot_max];
  if (max === min || f.renda_max <= f.renda_min) return { taxa: min, interpolada: false };
  const t = Math.min(1, Math.max(0, (renda - f.renda_min) / (f.renda_max - f.renda_min)));
  return { taxa: min + (max - min) * t, interpolada: true };
}

// TIR mensal por bisseção (fluxo: entrada positiva no mês 0, encargos negativos depois).
function tirMensal(fluxo: number[]): number | null {
  const valor = (i: number) => fluxo.reduce((s, c, k) => s + c / Math.pow(1 + i, k), 0);
  let lo = 0;
  let hi = 0.1;
  if (valor(lo) * valor(hi) > 0) return null;
  for (let n = 0; n < 200; n++) {
    const meio = (lo + hi) / 2;
    if (valor(meio) > 0) hi = meio;
    else lo = meio;
  }
  return (lo + hi) / 2;
}

export function simular(e: EntradaSimulacao, p: ParametrosSimulacao, agora: Date = new Date()): ResultadoSimulacao {
  const alertas: string[] = [];

  // ---- 0. Entrada ----
  const dataSim = lerData(e.data_simulacao) ?? new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
  const nasc = lerData(e.data_nascimento_mais_velho);
  const erroEntrada = (m: string) => vazio({ status: "entrada_invalida", mensagem: m });
  if (!Number.isFinite(e.valor_compra) || e.valor_compra <= 0) return erroEntrada("Informe o valor do imóvel.");
  if (e.valor_avaliacao != null && (!Number.isFinite(e.valor_avaliacao) || e.valor_avaliacao <= 0)) return erroEntrada("O valor de avaliação, se informado, precisa ser maior que zero.");
  if (!Number.isFinite(e.renda_bruta_familiar) || e.renda_bruta_familiar <= 0) return erroEntrada("Informe a renda bruta familiar.");
  if (!nasc || nasc > dataSim) return erroEntrada("Informe a data de nascimento do proponente mais velho.");
  if (e.sistema_amortizacao !== "SAC" && e.sistema_amortizacao !== "PRICE") return erroEntrada("Escolha o sistema de amortização (SAC ou Price).");
  const uf = (e.uf ?? "").trim().toUpperCase();
  if (!e.municipio?.trim() || uf.length !== 2) return erroEntrada("Informe o município e a UF do imóvel.");
  if (e.prazo_desejado_meses != null && (!Number.isInteger(e.prazo_desejado_meses) || e.prazo_desejado_meses < 1)) return erroEntrada("O prazo desejado precisa ser um número inteiro de meses.");

  // ---- 1. Parâmetros gerais obrigatórios ----
  const geraisFaltando = (["comprometimento_max_renda", "prazo_max_meses", "idade_max_final_contrato_meses", "idade_min_anos", "teto_sfh"] as const).filter((k) => p[k] == null);
  if (geraisFaltando.length > 0) {
    return vazio({
      status: "parametro_ausente",
      mensagem: "Faltam parâmetros gerais da simulação. Preencha em Parâmetros da simulação.",
      parametros_ausentes: [...geraisFaltando]
    });
  }
  const comprometimento = p.comprometimento_max_renda as number;
  const prazoMax = p.prazo_max_meses as number;
  const idadeMaxFinal = p.idade_max_final_contrato_meses as number;
  const idadeMin = p.idade_min_anos as number;
  const tetoSfh = p.teto_sfh as number;

  // ---- 2. Idade, base de cálculo, SFI ----
  const idadeMeses = mesesEntre(nasc, dataSim);
  if (Math.floor(idadeMeses / 12) < idadeMin) {
    return vazio({ status: "inelegivel_idade", mensagem: `O proponente mais velho precisa ter pelo menos ${idadeMin} anos.` });
  }

  const avaliacaoPendente = e.valor_avaliacao == null;
  const valorAvaliacao = e.valor_avaliacao ?? e.valor_compra;
  const base = Math.min(e.valor_compra, valorAvaliacao);
  if (avaliacaoPendente) alertas.push("Valor de avaliação não informado: usei o valor de compra. O laudo de engenharia da Caixa pode avaliar o imóvel por menos.");

  if (base > tetoSfh) {
    return vazio({
      status: "sfi",
      mensagem: `O valor do imóvel (${dinheiro(base)}) passa do teto do SFH (${dinheiro(tetoSfh)}): a operação é SFI, sem FGTS, e fica fora desta simulação.`,
      base_calculo: base,
      avaliacao_pendente: avaliacaoPendente
    });
  }

  // ---- 3. Prazo ----
  const prazoMaxIdade = Math.floor(idadeMaxFinal - idadeMeses);
  if (prazoMaxIdade <= 0) {
    return vazio({ status: "inelegivel_idade", mensagem: "A idade do proponente mais velho não permite financiar (limite de idade ao fim do contrato).", base_calculo: base });
  }
  const prazoTeto = Math.min(prazoMax, prazoMaxIdade);
  let n = e.prazo_desejado_meses != null ? Math.min(e.prazo_desejado_meses, prazoTeto) : prazoTeto;
  if (e.prazo_desejado_meses != null && e.prazo_desejado_meses > prazoTeto) {
    alertas.push(`Prazo reduzido de ${e.prazo_desejado_meses} para ${prazoTeto} meses (${prazoMaxIdade < prazoMax ? "limite de idade" : "prazo máximo"}).`);
  } else if (e.prazo_desejado_meses == null && prazoMaxIdade < prazoMax) {
    alertas.push(`Prazo limitado a ${prazoMaxIdade} meses pela idade do proponente mais velho.`);
  }
  n = Math.max(1, Math.floor(n));

  // ---- 4. Enquadramento: MCMV ou SBPE ----
  const faltando: string[] = [];
  const faixas = [...(p.mcmv_faixas ?? [])].sort((a, b) => a.renda_max - b.renda_max);
  let modalidade: "MCMV" | "SBPE" = "SBPE";
  let faixaSel: FaixaMcmv | null = null;
  let motivo = "";

  if (faixas.length === 0) {
    return vazio({ status: "parametro_ausente", mensagem: "As faixas do MCMV não estão configuradas.", parametros_ausentes: ["mcmv_faixas"], base_calculo: base });
  }
  const faixaDaRenda = faixas.find((f) => e.renda_bruta_familiar <= f.renda_max) ?? null;
  if (!faixaDaRenda) {
    motivo = `Renda de ${dinheiro(e.renda_bruta_familiar)} acima do limite do MCMV (${dinheiro(faixas[faixas.length - 1].renda_max)}): SBPE.`;
  } else if (e.possui_imovel_residencial_municipio || e.possui_financiamento_sfh_ativo) {
    motivo = `${e.possui_imovel_residencial_municipio ? "Possui imóvel residencial no município" : "Possui financiamento ativo no SFH"}: não pode usar o MCMV, enquadrado no SBPE.`;
  } else {
    const teto = (p.mcmv_tetos ?? []).find((t) => normalizar(t.municipio) === normalizar(e.municipio) && t.uf.toUpperCase() === uf);
    if (!teto) {
      return vazio({
        status: "parametro_ausente",
        mensagem: `Falta o teto do MCMV para ${e.municipio.trim()}/${uf}. Inclua o município em Parâmetros da simulação.`,
        parametros_ausentes: [`mcmv_tetos (${e.municipio.trim()}/${uf})`],
        base_calculo: base
      });
    }
    const tetoFaixa = faixaDaRenda.faixa <= 2 ? teto.teto_faixa_1_2 : faixaDaRenda.faixa === 3 ? teto.teto_faixa_3 : teto.teto_faixa_4;
    if (base > tetoFaixa) {
      motivo = `Imóvel de ${dinheiro(base)} acima do teto da faixa ${faixaDaRenda.faixa} do MCMV em ${e.municipio.trim()}/${uf} (${dinheiro(tetoFaixa)}): SBPE.`;
    } else {
      modalidade = "MCMV";
      faixaSel = faixaDaRenda;
      motivo = `Renda dentro da faixa ${faixaDaRenda.faixa} do MCMV e imóvel dentro do teto de ${dinheiro(tetoFaixa)} em ${e.municipio.trim()}/${uf}.`;
    }
  }

  // ---- 5. Taxa e cota (LTV) ----
  let taxaNominal: number;
  let ltv: number;
  let subsidio = 0;
  if (modalidade === "MCMV" && faixaSel) {
    const ltvFaixa = (p.mcmv_ltv_usado ?? []).find((x) => x.faixa === faixaSel!.faixa)?.ltv ?? null;
    if (ltvFaixa == null) {
      return vazio({
        status: "parametro_ausente",
        mensagem: `Falta a cota máxima de financiamento do MCMV (imóvel usado) para a faixa ${faixaSel.faixa}. Confirme no simulador da Caixa e preencha em Parâmetros da simulação.`,
        parametros_ausentes: [`mcmv_ltv_usado (faixa ${faixaSel.faixa})`],
        modalidade,
        faixa_mcmv: faixaSel.faixa,
        motivo_enquadramento: motivo,
        base_calculo: base,
        avaliacao_pendente: avaliacaoPendente
      });
    }
    ltv = ltvFaixa;
    const t = taxaMcmv(faixaSel, e.renda_bruta_familiar, uf, e.cotista_fgts);
    taxaNominal = t.taxa;
    if (t.interpolada) alertas.push("A taxa desta faixa varia com a renda: calculei por interpolação linear entre o mínimo e o máximo. Confirme no simulador da Caixa.");
    subsidio = faixaSel.subsidio_usado ?? 0;
    if (subsidio === 0) alertas.push("Subsídio para imóvel usado considerado zero.");
  } else {
    const ltvSbpe = e.sistema_amortizacao === "SAC" ? p.sbpe_ltv_sac : p.sbpe_ltv_price;
    if (ltvSbpe == null) faltando.push(e.sistema_amortizacao === "SAC" ? "sbpe_ltv_sac" : "sbpe_ltv_price");
    const chaveTaxa = e.relacionamento_caixa ? "sbpe_taxa_nominal_aa_com_relacionamento" : "sbpe_taxa_nominal_aa_sem_relacionamento";
    if (p[chaveTaxa] == null) faltando.push(chaveTaxa);
    if (faltando.length > 0) {
      return vazio({
        status: "parametro_ausente",
        mensagem: "Faltam parâmetros do SBPE. Preencha em Parâmetros da simulação.",
        parametros_ausentes: faltando,
        modalidade,
        motivo_enquadramento: motivo,
        base_calculo: base,
        avaliacao_pendente: avaliacaoPendente
      });
    }
    ltv = ltvSbpe as number;
    taxaNominal = p[chaveTaxa] as number;
  }
  const i = taxaNominal / 12;
  const taxaEfetiva = Math.pow(1 + i, 12) - 1;

  // ---- 6. Encargos ----
  const mipFaixas = [...(p.seguro_mip_faixas_idade ?? [])].sort((a, b) => a.idade_ate - b.idade_ate);
  const temMip = mipFaixas.length > 0;
  const temDfi = p.seguro_dfi_taxa_mensal != null;
  const temAdm = p.taxa_administracao_mensal != null;
  const encargosIncluidos = temMip && temDfi && temAdm;
  if (!encargosIncluidos) alertas.push("Seguros e taxa de administração não estão todos configurados: a prestação saiu sem eles.");
  else alertas.push("Seguros (MIP e DFI) calibrados em uma simulação MCMV da Caixa: confira os valores finais no simulador oficial.");
  const taxaMip = (idadeAnos: number) => (temMip ? (mipFaixas.find((f) => idadeAnos <= f.idade_ate) ?? mipFaixas[mipFaixas.length - 1]).taxa_mensal : 0);
  const dfi = temDfi ? (p.seguro_dfi_taxa_mensal as number) * base : 0;
  const adm = temAdm ? (p.taxa_administracao_mensal as number) : 0;

  const primeiroVenc = somarMeses(dataSim, 1);
  const idadeNaPrimeira = Math.floor(mesesEntre(nasc, primeiroVenc) / 12);

  // ---- 7. Valor financiado ----
  const finLtv = base * ltv;
  const parcelaMax = e.renda_bruta_familiar * comprometimento;
  const fator = (e.sistema_amortizacao === "SAC" ? 1 / n + i : i === 0 ? 1 / n : i / (1 - Math.pow(1 + i, -n))) + taxaMip(idadeNaPrimeira);
  const finRenda = (parcelaMax - dfi - adm) / fator;
  if (finRenda <= 0) {
    return vazio({
      status: "renda_insuficiente",
      mensagem: `A renda de ${dinheiro(e.renda_bruta_familiar)} (comprometimento de ${pct(comprometimento, 0)}) não cobre sequer os encargos fixos mensais.`,
      modalidade,
      faixa_mcmv: faixaSel?.faixa ?? null,
      motivo_enquadramento: motivo,
      base_calculo: base,
      avaliacao_pendente: avaliacaoPendente,
      financiamento_max_ltv: r2(finLtv)
    });
  }
  const limitadoPor: "ltv" | "renda" = finLtv <= finRenda ? "ltv" : "renda";
  const financiado = Math.floor(Math.min(finLtv, finRenda) * 100) / 100;
  if (limitadoPor === "renda") alertas.push("O valor financiado ficou limitado pela renda (comprometimento máximo da 1ª prestação), e não pela cota do imóvel.");

  // ---- 8. Cronograma ----
  const cronograma: LinhaCronograma[] = [];
  const pmtPrice = e.sistema_amortizacao === "PRICE" ? (i === 0 ? financiado / n : (financiado * i) / (1 - Math.pow(1 + i, -n))) : 0;
  const ultimaSemSeguros = p.ultima_prestacao_sem_seguros !== false;
  let saldo = financiado;
  let somaPrest = 0;
  let somaEnc = 0;
  let comp1 = { amortizacao: 0, juros: 0, mip: 0, dfi: 0, taxa_administracao: 0 };
  for (let k = 1; k <= n; k++) {
    const juros = saldo * i;
    const amort = e.sistema_amortizacao === "SAC" ? financiado / n : k === n ? saldo : pmtPrice - juros;
    const prest = amort + juros;
    const venc = somarMeses(dataSim, k);
    const semSeguros = k === n && ultimaSemSeguros;
    const mip = semSeguros ? 0 : saldo * taxaMip(Math.floor(mesesEntre(nasc, venc) / 12));
    const dfiK = semSeguros ? 0 : dfi;
    const enc = prest + mip + dfiK + adm;
    saldo = Math.max(0, saldo - amort);
    somaPrest += prest;
    somaEnc += enc;
    if (k === 1) comp1 = { amortizacao: amort, juros, mip, dfi: dfiK, taxa_administracao: adm };
    cronograma.push([k, r2(prest), r2(mip), r2(dfiK), r2(adm), r2(enc), r2(saldo)]);
  }

  // ---- 9. CET ----
  const tarifa = p.tarifa_avaliacao_pct != null ? financiado * p.tarifa_avaliacao_pct : null;
  const seguroVista = p.seguro_a_vista ?? null;
  const fluxo = [financiado - (tarifa ?? 0) - (seguroVista ?? 0), ...cronograma.map((l) => -l[5])];
  const tir = tirMensal(fluxo);
  const cet = tir == null ? null : Math.pow(1 + tir, 12) - 1;
  if (tarifa == null || seguroVista == null) alertas.push("Tarifa de avaliação ou seguro à vista não configurados: o CET saiu sem esses custos.");

  // ---- 10. Entrada, FGTS, avaliação ----
  const fgtsElegivel = e.fgts_3_anos && !e.possui_imovel_residencial_municipio && !e.ja_usou_fgts_em_financiamento && base <= tetoSfh;
  const entradaTotal = Math.max(0, e.valor_compra - financiado - subsidio);
  const fgtsUsavel = fgtsElegivel ? Math.min(Math.max(0, e.saldo_fgts ?? 0), entradaTotal) : 0;
  if (!fgtsElegivel) {
    const motivos = [
      !e.fgts_3_anos && "menos de 3 anos de FGTS",
      e.possui_imovel_residencial_municipio && "possui imóvel residencial no município",
      e.ja_usou_fgts_em_financiamento && "já usou FGTS em financiamento ativo no SFH"
    ].filter(Boolean);
    if (motivos.length > 0) alertas.push(`Sem uso do FGTS na entrada: ${motivos.join("; ")}.`);
  }
  const impactoAvaliacao = e.valor_avaliacao != null && e.valor_avaliacao < e.valor_compra ? (e.valor_compra - e.valor_avaliacao) * ltv : null;
  if (impactoAvaliacao != null) alertas.push(`Avaliação ${dinheiro(e.valor_compra - (e.valor_avaliacao as number))} abaixo do valor de compra: a diferença recai na entrada (impacto de ${dinheiro(impactoAvaliacao)} no valor financiado).`);

  const aliquotaItbi = (p.itbi_aliquotas ?? []).find((t) => normalizar(t.municipio) === normalizar(e.municipio) && t.uf.toUpperCase() === uf)?.aliquota ?? null;

  alertas.push("A TR não é projetada: a prestação real muda com a atualização monetária do saldo devedor.");

  const ultima = cronograma[cronograma.length - 1];
  const primeira = cronograma[0];
  return vazio({
    status: "ok",
    modalidade,
    faixa_mcmv: faixaSel?.faixa ?? null,
    motivo_enquadramento: motivo,
    base_calculo: r2(base),
    avaliacao_pendente: avaliacaoPendente,
    sistema_amortizacao: e.sistema_amortizacao,
    taxa_nominal_aa: taxaNominal,
    taxa_efetiva_aa: taxaEfetiva,
    taxa_am: i,
    prazo_meses: n,
    ltv_aplicado: ltv,
    financiamento_max_ltv: r2(finLtv),
    financiamento_max_renda: r2(finRenda),
    valor_financiado: financiado,
    limitado_por: limitadoPor,
    primeira_prestacao: primeira[5],
    ultima_prestacao: ultima[5],
    soma_parcelas: r2(somaPrest),
    soma_encargos: r2(somaEnc),
    composicao_primeira: {
      amortizacao: r2(comp1.amortizacao),
      juros: r2(comp1.juros),
      mip: r2(comp1.mip),
      dfi: r2(comp1.dfi),
      taxa_administracao: r2(comp1.taxa_administracao)
    },
    cet_aa: cet,
    encargos_incluidos: encargosIncluidos,
    subsidio,
    entrada_total: r2(entradaTotal),
    fgts_elegivel: fgtsElegivel,
    fgts_utilizavel: r2(fgtsUsavel),
    recursos_proprios: r2(entradaTotal - fgtsUsavel),
    impacto_avaliacao: impactoAvaliacao == null ? null : r2(impactoAvaliacao),
    custos_iniciais: {
      tarifa_avaliacao: tarifa == null ? null : r2(tarifa),
      seguro_a_vista: seguroVista,
      itbi_estimado: aliquotaItbi == null ? null : r2(aliquotaItbi * e.valor_compra)
    },
    primeiro_vencimento: primeiroVenc.toISOString().slice(0, 10),
    cronograma,
    alertas
  });
}
