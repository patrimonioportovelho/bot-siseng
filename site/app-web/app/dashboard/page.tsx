import { Topbar } from "@/components/topbar";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { formatMoeda, statusTone, STATUS_TRANSACAO_EM_ABERTO } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const inicioProxMes = new Date(inicioMes);
  inicioProxMes.setMonth(inicioProxMes.getMonth() + 1);

  const hoje = new Date();
  const em30Dias = new Date();
  em30Dias.setDate(em30Dias.getDate() + 30);

  const [totalImoveis, transacoesAbertas, comissaoMes, contratosAVencer, transacoesRecentes] =
    await Promise.all([
      prisma.imoveis.count(),
      prisma.transacoes.count({ where: { status: STATUS_TRANSACAO_EM_ABERTO } }),
      prisma.pagamentos.aggregate({
        _sum: { valor_honorario: true },
        where: { data_pagamento: { gte: inicioMes, lt: inicioProxMes } }
      }),
      prisma.transacoes.count({
        where: {
          tipo: "Locação",
          status: STATUS_TRANSACAO_EM_ABERTO,
          data_vencimento: { gte: hoje, lte: em30Dias }
        }
      }),
      prisma.transacoes.findMany({
        take: 4,
        orderBy: { created_at: "desc" },
        include: {
          imoveis: true,
          clientes_transacoes_cliente_idToclientes: true
        }
      })
    ]);

  return (
    <div>
      <Topbar />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Imóveis cadastrados" value={String(totalImoveis)} />
        <KpiCard label="Transações em andamento" value={String(transacoesAbertas)} />
        <KpiCard
          label="Comissão do mês"
          value={formatMoeda(comissaoMes._sum.valor_honorario ?? 0)}
          accent
        />
        <KpiCard label="Contratos a vencer (30 dias)" value={String(contratosAVencer)} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Transações recentes</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-normal py-1.5 border-b border-gray-100">Imóvel</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Cliente</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Tipo</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Status</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {transacoesRecentes.map((t) => (
              <tr key={t.id}>
                <td className="py-2 border-b border-gray-50">{t.imoveis?.endereco ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">
                  {t.clientes_transacoes_cliente_idToclientes?.nome ?? "—"}
                </td>
                <td className="py-2 border-b border-gray-50">{t.tipo}</td>
                <td className="py-2 border-b border-gray-50">
                  <StatusBadge status={t.status ?? "—"} tone={statusTone(t.status)} />
                </td>
                <td className="py-2 border-b border-gray-50 text-right">
                  {formatMoeda(t.valor_transacao)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
