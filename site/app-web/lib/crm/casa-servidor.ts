import { prisma } from "@/lib/prisma";
import { STATUS_COMPRA_FINALIZADA, STATUS_LOCACAO_ATIVA, STATUS_LOCACAO_SEM_ADM } from "@/lib/clientes/funil";

// A "casa" do cliente: a compra finalizada ou a locação em andamento em que ele é o comprador/inquilino, com a data de
// assinatura. `ids` = só desses clientes; null = todos.
export type CasaDoCliente = { clienteId: string; data: string; tipo: "Compra" | "Locação" };

export async function casasDosClientes(ids: string[] | null): Promise<CasaDoCliente[]> {
  const hoje = new Date();
  const contratoValido = {
    excluido: false,
    data_assinatura: { not: null },
    OR: [
      { tipo: "Compra e Venda", status: { in: STATUS_COMPRA_FINALIZADA } },
      { tipo: "Locação", status: { in: STATUS_LOCACAO_ATIVA } },
      { tipo: "Locação", status: STATUS_LOCACAO_SEM_ADM, data_vencimento: { gte: hoje } }
    ]
  };
  const [principais, outros] = await Promise.all([
    prisma.transacoes.findMany({ where: { ...contratoValido, ...(ids ? { cliente_contraparte_id: { in: ids } } : {}) }, select: { tipo: true, data_assinatura: true, cliente_contraparte_id: true } }),
    prisma.transacoes_contrapartes.findMany({ where: { ...(ids ? { cliente_id: { in: ids } } : {}), transacoes: contratoValido }, select: { cliente_id: true, transacoes: { select: { tipo: true, data_assinatura: true } } } })
  ]);
  const linhas = [
    ...principais.map((t) => ({ clienteId: t.cliente_contraparte_id, tipo: t.tipo, data: t.data_assinatura })),
    ...outros.map((o) => ({ clienteId: o.cliente_id, tipo: o.transacoes.tipo, data: o.transacoes.data_assinatura }))
  ];
  // vale o contrato mais recente de cada cliente
  const mapa = new Map<string, CasaDoCliente>();
  for (const l of linhas) {
    if (!l.data) continue;
    const data = l.data.toISOString().slice(0, 10);
    const atual = mapa.get(l.clienteId);
    if (!atual || data > atual.data) mapa.set(l.clienteId, { clienteId: l.clienteId, data, tipo: l.tipo === "Locação" ? "Locação" : "Compra" });
  }
  return [...mapa.values()];
}
