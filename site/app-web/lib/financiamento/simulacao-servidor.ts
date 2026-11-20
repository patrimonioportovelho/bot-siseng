import { prisma } from "@/lib/prisma";
import type { ParametrosSimulacao } from "@/lib/financiamento/simulacao-parametros";

// Lê os parâmetros da simulação no banco (tabela simulacao_parametros). Chave sem valor (NULL) ou ausente = "não
// configurado": o motor de cálculo avisa em vez de assumir um número.
export async function carregarParametrosSimulacao(): Promise<ParametrosSimulacao> {
  const linhas = await prisma.simulacao_parametros.findMany({ select: { chave: true, valor: true } });
  const out: Record<string, unknown> = {};
  for (const l of linhas) out[l.chave] = l.valor;
  return out as ParametrosSimulacao;
}
