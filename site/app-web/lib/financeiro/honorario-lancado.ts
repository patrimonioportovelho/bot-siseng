import { prisma } from "@/lib/prisma";
import { statusCancelado } from "@/lib/format";

// Acompanhamento do LANÇAMENTO do honorário no Financeiro (pedido do usuário
// em 02/10/2026): o Financeiro só lançava quando já estava pago, então o
// administrativo não enxergava o que estava por vir. Regra, derivada ao vivo
// (nada é gravado — não tem como ficar desatualizado):
//
//   Recebimento de honorário = movimentacao tipo "Recebimento", ligada à
//   transação (transacao_id), na categoria do honorário daquele contrato:
//     Compra e Venda -> "Compra e venda"
//     Locação (com ou sem administração) -> "Locações"
//   ("Aluguéis", "Administração de Imóveis Locados" e "Locações - cauções" são
//   mensalidade/caução, não contam.)
//
//   - Sem data de assinatura, assinada antes de 2026, cancelada (Distrato /
//     Locação cancelada / Cancelado) ou excluída ........ "nao_se_aplica"
//     (cancelada que JÁ tem lançamento mostra o estado real dele — o dinheiro
//     existe no Financeiro; cancelada sem lançamento sai do acompanhamento).
//   - Assinada em 2026+ e sem nenhum Recebimento de honorário ..... "nao_lancado"
//   - Lançado, nenhum pago ........................................ "pendente"
//   - Lançado, parte paga ......................................... "parcial"
//   - Lançado, todos pagos ........................................ "pago"
export type SituacaoHonorario = "nao_se_aplica" | "nao_lancado" | "pendente" | "parcial" | "pago";

// Foco em 2026: o histórico anterior foi importado da planilha e não tem o
// Financeiro lançado de forma comparável.
export const DATA_INICIO_ACOMPANHAMENTO_HONORARIO = new Date(Date.UTC(2026, 0, 1));

export const CATEGORIA_HONORARIO_COMPRA_VENDA = "Compra e venda";
export const CATEGORIA_HONORARIO_LOCACAO = "Locações";

export function categoriaHonorarioDoTipo(tipo: string): string {
  return tipo === "Locação" ? CATEGORIA_HONORARIO_LOCACAO : CATEGORIA_HONORARIO_COMPRA_VENDA;
}

export type TransacaoParaHonorario = {
  id: string;
  tipo: string;
  status: string | null;
  data_assinatura: Date | null;
};

export type ResumoHonorario = {
  situacao: SituacaoHonorario;
  lancamentos: number;
  pagos: number;
  valorLancado: number;
};

const SEM_ACOMPANHAMENTO: ResumoHonorario = { situacao: "nao_se_aplica", lancamentos: 0, pagos: 0, valorLancado: 0 };

export function resumoHonorario(
  t: TransacaoParaHonorario,
  lancamentos: { status_pagamento: string; valor: number }[]
): ResumoHonorario {
  const pagos = lancamentos.filter((m) => m.status_pagamento === "Pago").length;
  const valorLancado = lancamentos.reduce((soma, m) => soma + m.valor, 0);

  if (lancamentos.length > 0) {
    // Só mostra o estado real se a transação entra no acompanhamento (ou se é
    // cancelada que já tem lançamento — o dinheiro existe).
    if (!t.data_assinatura || t.data_assinatura < DATA_INICIO_ACOMPANHAMENTO_HONORARIO) return SEM_ACOMPANHAMENTO;
    const situacao: SituacaoHonorario = pagos === 0 ? "pendente" : pagos < lancamentos.length ? "parcial" : "pago";
    return { situacao, lancamentos: lancamentos.length, pagos, valorLancado };
  }

  if (!t.data_assinatura || t.data_assinatura < DATA_INICIO_ACOMPANHAMENTO_HONORARIO) return SEM_ACOMPANHAMENTO;
  if (statusCancelado(t.status)) return SEM_ACOMPANHAMENTO;
  return { situacao: "nao_lancado", lancamentos: 0, pagos: 0, valorLancado: 0 };
}

// Uma consulta só pra N transações (lista/dashboard) — agrupa por transacao_id.
export async function buscarResumoHonorarios(
  transacoes: TransacaoParaHonorario[]
): Promise<Map<string, ResumoHonorario>> {
  const resultado = new Map<string, ResumoHonorario>();
  const elegiveis = transacoes.filter(
    (t) => t.data_assinatura && t.data_assinatura >= DATA_INICIO_ACOMPANHAMENTO_HONORARIO
  );
  const porTransacao = new Map<string, { status_pagamento: string; valor: number }[]>();

  if (elegiveis.length > 0) {
    const movimentacoes = await prisma.movimentacoes.findMany({
      where: {
        transacao_id: { in: elegiveis.map((t) => t.id) },
        tipo: "Recebimento",
        categorias_financeiras: {
          nome: { in: [CATEGORIA_HONORARIO_COMPRA_VENDA, CATEGORIA_HONORARIO_LOCACAO] }
        }
      },
      select: {
        transacao_id: true,
        status_pagamento: true,
        valor: true,
        categorias_financeiras: { select: { nome: true } }
      }
    });
    const tipoPorId = new Map(elegiveis.map((t) => [t.id, t.tipo]));
    for (const m of movimentacoes) {
      if (!m.transacao_id) continue;
      // Categoria tem que ser a do tipo daquela transação (CV não conta
      // "Locações" e vice-versa).
      if (m.categorias_financeiras.nome !== categoriaHonorarioDoTipo(tipoPorId.get(m.transacao_id) ?? "")) continue;
      const lista = porTransacao.get(m.transacao_id) ?? [];
      lista.push({ status_pagamento: m.status_pagamento, valor: Number(m.valor) });
      porTransacao.set(m.transacao_id, lista);
    }
  }

  for (const t of transacoes) resultado.set(t.id, resumoHonorario(t, porTransacao.get(t.id) ?? []));
  return resultado;
}

export const ROTULO_SITUACAO_HONORARIO: Record<SituacaoHonorario, string> = {
  nao_se_aplica: "—",
  nao_lancado: "Não lançado",
  pendente: "Pendente",
  parcial: "Parcial",
  pago: "Pago"
};

export const CLASSE_SITUACAO_HONORARIO: Record<SituacaoHonorario, string> = {
  nao_se_aplica: "text-gray-300",
  nao_lancado: "bg-red-50 text-red-700 border-red-200",
  pendente: "bg-amber-50 text-amber-700 border-amber-200",
  parcial: "bg-blue-50 text-blue-700 border-blue-200",
  pago: "bg-green-50 text-green-700 border-green-200"
};
