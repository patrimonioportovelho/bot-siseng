import { Topbar } from "@/components/topbar";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";

// Dados de exemplo — trocar por consulta ao banco (Prisma) quando o
// schema estiver puxado via `npx prisma db pull`.
const TRANSACOES_RECENTES = [
  { imovel: "R. das Flores, 481", cliente: "Ana Souza", tipo: "Locação", status: "Ativa", tone: "ativa", valor: "R$ 1.700" },
  { imovel: "Av. Rio Madeira, 5064", cliente: "Willian Guedes", tipo: "Compra e venda", status: "Pendente", tone: "pendente", valor: "R$ 285.000" },
  { imovel: "R. Chirleane, 7202", cliente: "Elizelia Pinto", tipo: "Locação", status: "Concluída", tone: "concluida", valor: "R$ 1.000" },
  { imovel: "R. Carlos Gomes, 1695", cliente: "Thyago Medeiros", tipo: "Compra e venda", status: "Cancelada", tone: "cancelada", valor: "R$ 190.000" }
] as const;

export default function DashboardPage() {
  return (
    <div>
      <Topbar />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Imóveis ativos" value="187" />
        <KpiCard label="Transações em andamento" value="23" />
        <KpiCard label="Comissão do mês" value="R$ 42.300" accent />
        <KpiCard label="Contratos a vencer" value="5" />
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
            {TRANSACOES_RECENTES.map((t) => (
              <tr key={t.imovel}>
                <td className="py-2 border-b border-gray-50">{t.imovel}</td>
                <td className="py-2 border-b border-gray-50">{t.cliente}</td>
                <td className="py-2 border-b border-gray-50">{t.tipo}</td>
                <td className="py-2 border-b border-gray-50">
                  <StatusBadge status={t.status} tone={t.tone} />
                </td>
                <td className="py-2 border-b border-gray-50 text-right">{t.valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
