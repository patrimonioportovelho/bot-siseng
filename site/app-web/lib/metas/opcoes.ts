// Catálogo de tipos de Meta — cada um sabe: qual unidade usar, qual texto de
// ajuda mostrar pro administrativo (o "objetivo" pedido: toda meta precisa
// deixar claro o que está sendo medido) e é usado por lib/metas/calculo.ts
// pra saber que consulta rodar no banco pra apurar o progresso.
//
// IMPORTANTE: a chave (primeira posição de cada tupla) é gravada em
// metas.tipo_meta — não pode mudar sem migrar os registros já cadastrados.
export type TipoMetaOpcao = {
  chave: string;
  label: string;
  unidadePadrao: string;
  unidadePlural: string;
  // "quantidade" conta registros (formata como número inteiro); "valor"
  // soma um campo monetário (formata em R$, não faz sentido pluralizar).
  natureza: "quantidade" | "valor";
  ajuda: string;
  // Ação concreta sugerida pro corretor quando ele está atrás da meta —
  // usada na mensagem motivacional do painel do portal ("você precisa...").
  acaoSugerida: string;
};

export const TIPOS_META: TipoMetaOpcao[] = [
  {
    chave: "imoveis_captados",
    label: "Imóveis captados",
    unidadePadrao: "imóvel",
    unidadePlural: "imóveis",
    natureza: "quantidade",
    ajuda: "Quantidade de imóveis novos cadastrados (captados) no período — conta o cadastro em Imóveis, de qualquer origem (admin ou portal).",
    acaoSugerida: "cadastrar um imóvel novo"
  },
  {
    chave: "vendas_fechadas",
    label: "Vendas fechadas (Compra e Venda)",
    unidadePadrao: "venda",
    unidadePlural: "vendas",
    natureza: "quantidade",
    ajuda: "Quantidade de transações de Compra e Venda com Data de assinatura dentro do período (não conta canceladas/distrato).",
    acaoSugerida: "fechar uma Compra e Venda"
  },
  {
    chave: "valor_vendas",
    label: "Valor em vendas (R$)",
    unidadePadrao: "valor (R$)",
    unidadePlural: "valor (R$)",
    natureza: "valor",
    ajuda: "Soma do Valor da transação de todas as Compra e Venda assinadas no período (não conta canceladas/distrato).",
    acaoSugerida: "fechar mais uma Compra e Venda"
  },
  {
    chave: "locacoes_fechadas",
    label: "Locações fechadas",
    unidadePadrao: "locação",
    unidadePlural: "locações",
    natureza: "quantidade",
    ajuda: "Quantidade de transações de Locação com Data de assinatura dentro do período — com ou sem Administração (não conta canceladas/distrato).",
    acaoSugerida: "fechar uma Locação"
  },
  {
    chave: "administracoes_captadas",
    label: "Administrações captadas",
    unidadePadrao: "administração",
    unidadePlural: "administrações",
    natureza: "quantidade",
    ajuda: "Quantidade de administrações novas cadastradas no período (qualquer status).",
    acaoSugerida: "cadastrar uma Administração nova"
  },
  {
    chave: "administracoes_locadas",
    label: "Administrações locadas (conseguiu inquilino)",
    unidadePadrao: "administração",
    unidadePlural: "administrações",
    natureza: "quantidade",
    ajuda: "Quantidade de administrações que passaram de Ativo (sem inquilino) para Locado dentro do período — o objetivo é reduzir o estoque de imóveis administrados vazios.",
    acaoSugerida: "conseguir um inquilino pra uma Administração sem locatário"
  },
  {
    chave: "creditos_aprovados",
    label: "Créditos aprovados (Financiamento)",
    unidadePadrao: "crédito",
    unidadePlural: "créditos",
    natureza: "quantidade",
    ajuda: "Quantidade de Avaliações de crédito com status Aprovado, com data de cadastro dentro do período.",
    acaoSugerida: "aprovar um crédito de Financiamento"
  },
  {
    chave: "consultas_cpf",
    label: "Consultas de CPF realizadas",
    unidadePadrao: "consulta",
    unidadePlural: "consultas",
    natureza: "quantidade",
    ajuda: "Quantidade de Avaliações de crédito cadastradas no período (qualquer status) — o primeiro passo do funil de Financiamento.",
    acaoSugerida: "fazer uma consulta de CPF"
  },
  {
    chave: "clientes_cadastrados",
    label: "Clientes cadastrados",
    unidadePadrao: "cliente",
    unidadePlural: "clientes",
    natureza: "quantidade",
    ajuda: "Quantidade de clientes novos cadastrados no período (de qualquer origem — admin ou portal).",
    acaoSugerida: "cadastrar um cliente novo"
  }
];

export function tipoMetaOpcao(chave: string): TipoMetaOpcao | undefined {
  return TIPOS_META.find((t) => t.chave === chave);
}

export const PERIODO_TIPO_OPCOES = ["Mensal", "Semestral", "Anual"];

// Calcula início/fim de período a partir de uma referência "YYYY-MM" (mês
// que o período contém — pro Semestral usa o semestre daquele mês, pro
// Anual usa o ano inteiro). O admin sempre pode ajustar as datas na mão
// depois — isso só preenche um ponto de partida sensato.
export function calcularPeriodo(tipo: string, referenciaAnoMes: string): { inicio: string; fim: string } | null {
  const [anoTxt, mesTxt] = referenciaAnoMes.split("-");
  const ano = Number(anoTxt);
  const mes = Number(mesTxt); // 1-12
  if (!Number.isFinite(ano) || !Number.isFinite(mes) || mes < 1 || mes > 12) return null;

  function iso(ano: number, mesIndiceZero: number, dia: number): string {
    const d = new Date(Date.UTC(ano, mesIndiceZero, dia));
    return d.toISOString().slice(0, 10);
  }

  if (tipo === "Mensal") {
    const inicio = iso(ano, mes - 1, 1);
    const fim = iso(ano, mes, 0); // dia 0 do mês seguinte = último dia do mês atual
    return { inicio, fim };
  }

  if (tipo === "Semestral") {
    const semestre = mes <= 6 ? 1 : 2;
    const mesInicio = semestre === 1 ? 0 : 6;
    const inicio = iso(ano, mesInicio, 1);
    const fim = iso(ano, mesInicio + 6, 0);
    return { inicio, fim };
  }

  // Anual
  const inicio = iso(ano, 0, 1);
  const fim = iso(ano, 12, 0);
  return { inicio, fim };
}
