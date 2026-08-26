import { prisma } from "@/lib/prisma";
import { diasParaVencimento, formatMoeda } from "@/lib/format";
import { tipoMetaOpcao } from "./opcoes";

// Tipos de meta que se apoiam num modelo com loja_id — o filtro de Loja
// (quando a meta tiver uma escolhida) só se aplica a esses. imoveis e
// avaliacoes não têm loja_id no cadastro, então metas desses tipos ignoram
// esse filtro (a Loja na meta fica só como referência/organização).
const TIPOS_COM_LOJA = new Set([
  "vendas_fechadas",
  "valor_vendas",
  "locacoes_fechadas",
  "administracoes_captadas",
  "administracoes_locadas",
  "clientes_cadastrados",
  "quantidade_transacoes",
  "vgh"
]);

// Compra e Venda + Locação juntos — usado pelos dois tipos novos que somam
// as duas modalidades no mesmo total (VGH e Quantidade de transações),
// diferente dos tipos antigos que são separados por modalidade.
const TIPOS_TRANSACAO_CONTRATO = ["Compra e Venda", "Locação"];

export type MetaParaCalculo = {
  tipo_meta: string;
  parceiro_id: string | null;
  loja_id: string | null;
  periodo_inicio: Date;
  periodo_fim: Date;
  valor_meta: unknown;
};

// data_assinatura é @db.Date (só o dia, sem hora) — comparar direto com as
// datas do período (também @db.Date) funciona sem ajuste.
function rangeData(inicio: Date, fim: Date) {
  return { gte: inicio, lte: fim };
}

// created_at/updated_at são @db.Timestamptz (dia + hora) — sem empurrar o
// fim do período pro fim do dia (23:59:59.999), qualquer registro feito
// depois da meia-noite do último dia ficaria de fora da contagem.
function rangeTimestamp(inicio: Date, fim: Date) {
  const fimAjustado = new Date(fim);
  fimAjustado.setUTCHours(23, 59, 59, 999);
  return { gte: inicio, lte: fimAjustado };
}

// Quantidade (ou soma, pro tipo "valor_vendas") já alcançada por uma meta —
// meta.parceiro_id null conta TODOS os corretores juntos (meta Geral, da
// imobiliária); preenchido conta só o que aquele corretor específico fez
// (de qualquer lado da transação, quando for o caso).
export async function calcularAlcancado(meta: MetaParaCalculo): Promise<number> {
  const lojaFiltro = meta.loja_id && TIPOS_COM_LOJA.has(meta.tipo_meta) ? { loja_id: meta.loja_id } : {};
  const corretorTransacao = meta.parceiro_id
    ? { OR: [{ corretor_proprietario_id: meta.parceiro_id }, { corretor_contraparte_id: meta.parceiro_id }] }
    : {};

  switch (meta.tipo_meta) {
    case "imoveis_captados":
      return prisma.imoveis.count({
        where: {
          excluido: false,
          created_at: rangeTimestamp(meta.periodo_inicio, meta.periodo_fim),
          ...(meta.parceiro_id ? { parceiro_id: meta.parceiro_id } : {})
        }
      });

    case "vendas_fechadas":
      return prisma.transacoes.count({
        where: {
          tipo: "Compra e Venda",
          excluido: false,
          data_assinatura: rangeData(meta.periodo_inicio, meta.periodo_fim),
          ...lojaFiltro,
          ...corretorTransacao
        }
      });

    case "valor_vendas": {
      const r = await prisma.transacoes.aggregate({
        where: {
          tipo: "Compra e Venda",
          excluido: false,
          data_assinatura: rangeData(meta.periodo_inicio, meta.periodo_fim),
          ...lojaFiltro,
          ...corretorTransacao
        },
        _sum: { valor_transacao: true }
      });
      return Number(r._sum.valor_transacao ?? 0);
    }

    case "locacoes_fechadas":
      return prisma.transacoes.count({
        where: {
          tipo: "Locação",
          excluido: false,
          data_assinatura: rangeData(meta.periodo_inicio, meta.periodo_fim),
          ...lojaFiltro,
          ...corretorTransacao
        }
      });

    case "administracoes_captadas":
      return prisma.adm_imoveis.count({
        where: {
          excluido: false,
          created_at: rangeTimestamp(meta.periodo_inicio, meta.periodo_fim),
          ...lojaFiltro,
          ...(meta.parceiro_id ? { parceiro_id: meta.parceiro_id } : {})
        }
      });

    case "administracoes_locadas":
      // Não existe histórico separado de "quando virou Locado" — updated_at
      // é a melhor aproximação (só muda quando o registro é alterado, e a
      // troca Ativo -> Locado é justamente uma dessas alterações, seja pela
      // Elaboração de Locação do portal ou pelo administrativo).
      return prisma.adm_imoveis.count({
        where: {
          excluido: false,
          status: "Locado",
          updated_at: rangeTimestamp(meta.periodo_inicio, meta.periodo_fim),
          ...lojaFiltro,
          ...(meta.parceiro_id ? { parceiro_id: meta.parceiro_id } : {})
        }
      });

    case "creditos_aprovados":
      return prisma.avaliacoes.count({
        where: {
          excluido: false,
          status: "Aprovado",
          created_at: rangeTimestamp(meta.periodo_inicio, meta.periodo_fim),
          ...(meta.parceiro_id ? { parceiro_id: meta.parceiro_id } : {})
        }
      });

    case "consultas_cpf":
      return prisma.avaliacoes.count({
        where: {
          excluido: false,
          created_at: rangeTimestamp(meta.periodo_inicio, meta.periodo_fim),
          ...(meta.parceiro_id ? { parceiro_id: meta.parceiro_id } : {})
        }
      });

    case "clientes_cadastrados":
      return prisma.clientes.count({
        where: {
          created_at: rangeTimestamp(meta.periodo_inicio, meta.periodo_fim),
          ...lojaFiltro,
          ...(meta.parceiro_id ? { parceiro_id: meta.parceiro_id } : {})
        }
      });

    // Junta Locação + Compra e Venda (diferente de vendas_fechadas/
    // locacoes_fechadas, que são separados por modalidade). Meta Geral conta
    // o total de contratos assinados; meta de corretor específico conta cada
    // LADO (proprietário/captador e contraparte) separado — por isso são
    // duas contagens somadas em vez de um único count com OR, senão um
    // corretor que fechou os dois lados da mesma transação (captou do
    // proprietário e trouxe o comprador/locatário) contaria só 1 em vez de 2.
    case "quantidade_transacoes": {
      const filtroBase = {
        tipo: { in: TIPOS_TRANSACAO_CONTRATO },
        excluido: false,
        data_assinatura: rangeData(meta.periodo_inicio, meta.periodo_fim),
        ...lojaFiltro
      };
      if (!meta.parceiro_id) {
        return prisma.transacoes.count({ where: filtroBase });
      }
      const [comoProprietario, comoContraparte] = await Promise.all([
        prisma.transacoes.count({ where: { ...filtroBase, corretor_proprietario_id: meta.parceiro_id } }),
        prisma.transacoes.count({ where: { ...filtroBase, corretor_contraparte_id: meta.parceiro_id } })
      ]);
      return comoProprietario + comoContraparte;
    }

    // VGH (Valor Geral de Honorários) — mesma conta em cascata de
    // lib/financeiro/previsao-comissao.ts (honorarioTotal = valor_transacao ×
    // porc_honorario, descontada a parceria externa quando houver), só que
    // aqui é sobre o honorário JÁ GERADO (transação assinada no período), não
    // uma previsão de recebimento futuro — por isso não filtra por condição
    // de pagamento nem por status_honorario. Meta Geral soma o honorário
    // inteiro de cada transação; meta de corretor específico soma só a
    // fração dele, somando os dois lados quando ele participou dos dois
    // (mesmo raciocínio de quantidade_transacoes acima). Não dá pra fazer
    // isso com um _sum do Prisma porque é produto de duas colunas — por isso
    // busca as linhas e soma em JS.
    case "vgh": {
      const filtroBase = {
        tipo: { in: TIPOS_TRANSACAO_CONTRATO },
        excluido: false,
        data_assinatura: rangeData(meta.periodo_inicio, meta.periodo_fim),
        ...lojaFiltro
      };
      const linhas = await prisma.transacoes.findMany({
        where: { ...filtroBase, ...corretorTransacao },
        select: {
          valor_transacao: true,
          porc_honorario: true,
          tem_parceria: true,
          porc_parceria: true,
          porc_corretor_proprietario: true,
          porc_corretor_contraparte: true,
          corretor_proprietario_id: true,
          corretor_contraparte_id: true
        }
      });
      let total = 0;
      for (const t of linhas) {
        const honorarioTotal = Number(t.valor_transacao) * Number(t.porc_honorario);
        const valorParceria = t.tem_parceria ? honorarioTotal * Number(t.porc_parceria) : 0;
        const restante = honorarioTotal - valorParceria;
        if (!meta.parceiro_id) {
          total += restante;
          continue;
        }
        const fracaoProprietario = t.corretor_proprietario_id === meta.parceiro_id ? Number(t.porc_corretor_proprietario) : 0;
        const fracaoContraparte = t.corretor_contraparte_id === meta.parceiro_id ? Number(t.porc_corretor_contraparte) : 0;
        total += restante * (fracaoProprietario + fracaoContraparte);
      }
      return Math.round(total * 100) / 100;
    }

    default:
      return 0;
  }
}

export type SituacaoMeta = "concluida" | "no_prazo" | "atencao" | "atrasada" | "vencida";

// Classificação puramente cosmética (gamificação, pedido do usuário: "faça
// que além de desafiador, divertido") — não é gravada em lugar nenhum, é só
// derivada do percentual pra dar uma sensação de progresso tipo "subir de
// nível", igual jogo. Diamante exige ter batido a meta de verdade (não é só
// chegar perto).
export type ClassificacaoMeta = "bronze" | "prata" | "ouro" | "diamante";

function classificarMeta(percentual: number, concluida: boolean): ClassificacaoMeta {
  if (concluida) return "diamante";
  if (percentual >= 80) return "ouro";
  if (percentual >= 50) return "prata";
  return "bronze";
}

export type AvaliacaoMeta = {
  alcancado: number;
  alvo: number;
  percentual: number;
  falta: number;
  diasRestantes: number | null;
  diasTotais: number | null;
  situacao: SituacaoMeta;
  mensagem: string;
  classificacao: ClassificacaoMeta;
  // Ritmo necessário DAQUI PRA FRENTE (não é a média do período inteiro) —
  // quanto falta dividido pelos dias que restam, formatado pronto pra
  // mostrar ("3 imóveis/dia"). Null quando já concluída/vencida ou quando a
  // meta não tem prazo (diasRestantes null).
  ritmoDiarioTexto: string | null;
  ritmoSemanalTexto: string | null;
};

// Ritmo esperado: quantos % da meta já deveriam ter sido feitos até hoje,
// se o progresso fosse distribuído em linha reta ao longo do período — é
// contra essa régua que a situação (no prazo / atenção / atrasada) é
// decidida, não só contra o prazo final.
function ritmoEsperadoPercentual(diasTotais: number, diasRestantes: number): number {
  if (diasTotais <= 0) return 100;
  const diasDecorridos = Math.min(diasTotais, Math.max(0, diasTotais - diasRestantes));
  return (diasDecorridos / diasTotais) * 100;
}

// Formata uma quantidade (natureza "valor" vira R$, "quantidade" vira
// "N unidade(s)" com plural correto do português, sem tentar regra
// genérica — cada tipo já traz singular/plural certos em opcoes.ts).
export function formatarQuantidade(valor: number, opcao: ReturnType<typeof tipoMetaOpcao>): string {
  if (!opcao) return String(valor);
  if (opcao.natureza === "valor") return formatMoeda(valor);
  const inteiro = Math.round(valor);
  return `${inteiro} ${inteiro === 1 ? opcao.unidadePadrao : opcao.unidadePlural}`;
}

export function avaliarMeta(meta: MetaParaCalculo, alcancado: number): AvaliacaoMeta {
  const opcao = tipoMetaOpcao(meta.tipo_meta);
  const acao = opcao?.acaoSugerida ?? "cadastrar mais uma atividade";

  const alvo = Number(meta.valor_meta) || 0;
  const percentual = alvo > 0 ? Math.round((alcancado / alvo) * 100) : 0;
  const falta = Math.max(0, alvo - alcancado);
  const concluida = alvo > 0 && alcancado >= alvo;

  const diasRestantes = diasParaVencimento(meta.periodo_fim);
  const diasTotais =
    Math.round((new Date(meta.periodo_fim).getTime() - new Date(meta.periodo_inicio).getTime()) / (1000 * 60 * 60 * 24)) + 1;

  let situacao: SituacaoMeta;
  if (concluida) {
    situacao = "concluida";
  } else if (diasRestantes !== null && diasRestantes < 0) {
    situacao = "vencida";
  } else if (diasRestantes !== null) {
    const ritmo = ritmoEsperadoPercentual(diasTotais, diasRestantes);
    if (percentual + 1 >= ritmo) situacao = "no_prazo";
    else if (percentual + 20 >= ritmo) situacao = "atencao";
    else situacao = "atrasada";
  } else {
    situacao = "no_prazo";
  }

  const faltaTexto = formatarQuantidade(falta, opcao);
  const alcancadoTexto = formatarQuantidade(alcancado, opcao);
  const alvoTexto = formatarQuantidade(alvo, opcao);
  const diasTexto = diasRestantes !== null ? `${diasRestantes} dia${diasRestantes === 1 ? "" : "s"}` : null;

  let mensagem: string;
  if (situacao === "concluida") {
    mensagem = `Meta batida! Você já fez ${alcancadoTexto} (meta era ${alvoTexto}).`;
  } else if (situacao === "vencida") {
    mensagem = `O período encerrou e a meta não foi batida — foram ${alcancadoTexto} de ${alvoTexto}.`;
  } else if (situacao === "no_prazo") {
    mensagem = diasTexto
      ? `Faltam ${faltaTexto} para bater a meta — ${diasTexto} restantes. Você está no ritmo certo, continue assim.`
      : `Faltam ${faltaTexto} para bater a meta. Você está no ritmo certo, continue assim.`;
  } else if (situacao === "atencao") {
    mensagem = diasTexto
      ? `Faltam ${faltaTexto}. Restam ${diasTexto} — dá pra alcançar, mas precisa acelerar: ${acao}.`
      : `Faltam ${faltaTexto} — precisa acelerar: ${acao}.`;
  } else {
    mensagem = diasTexto
      ? `Faltam ${faltaTexto} e restam só ${diasTexto} — você está atrás do ritmo. Priorize ${acao} nos próximos dias.`
      : `Faltam ${faltaTexto} — você está atrás do ritmo. Priorize ${acao}.`;
  }

  // Ritmo necessário só faz sentido enquanto ainda dá pra agir — com a meta
  // já concluída ou o prazo vencido, mostrar "quanto por dia" só confundiria.
  const podeCalcularRitmo = !concluida && situacao !== "vencida" && diasRestantes !== null && diasRestantes > 0;
  const ritmoDiarioTexto = podeCalcularRitmo ? formatarQuantidade(falta / diasRestantes!, opcao) : null;
  const ritmoSemanalTexto = podeCalcularRitmo ? formatarQuantidade((falta / diasRestantes!) * 7, opcao) : null;
  const classificacao = classificarMeta(percentual, concluida);

  return {
    alcancado,
    alvo,
    percentual,
    falta,
    diasRestantes,
    diasTotais,
    situacao,
    mensagem,
    classificacao,
    ritmoDiarioTexto,
    ritmoSemanalTexto
  };
}
