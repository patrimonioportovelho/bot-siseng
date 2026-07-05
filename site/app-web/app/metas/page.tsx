import { Topbar } from "@/components/topbar";
import { KpiCard } from "@/components/kpi-card";
import { ProgressBar } from "@/components/progress-bar";

// Dados de exemplo — na versão final, esta página consulta a view
// vw_metas_progresso (metas individuais/loja) e vw_ranking_mes_atual
// (leaderboard), definidas em site/database/schema.sql.
const METAS = [
  {
    corretor: "Willian Guedes",
    loja: "Porto Velho",
    tipo: "Vendas fechadas",
    periodo: "Jul/2026",
    meta: "R$ 300.000",
    realizado: "R$ 285.000",
    percent: 95
  },
  {
    corretor: "Ana Souza",
    loja: "Porto Velho",
    tipo: "Locações fechadas",
    periodo: "Jul/2026",
    meta: "10 contratos",
    realizado: "11 contratos",
    percent: 110
  },
  {
    corretor: "Thyago Medeiros",
    loja: "Jaru",
    tipo: "Honorários recebidos",
    periodo: "Jul/2026",
    meta: "R$ 15.000",
    realizado: "R$ 8.400",
    percent: 56
  },
  {
    corretor: "Elizelia Pinto",
    loja: "Porto Velho",
    tipo: "Captações de imóvel",
    periodo: "Jul/2026",
    meta: "6 imóveis",
    realizado: "5 imóveis",
    percent: 83
  }
] as const;

const RANKING = [
  { pos: 1, corretor: "Ana Souza", loja: "Porto Velho", vendas: 2, locacoes: 11, honorarios: "R$ 14.200" },
  { pos: 2, corretor: "Willian Guedes", loja: "Porto Velho", vendas: 3, locacoes: 2, honorarios: "R$ 12.850" },
  { pos: 3, corretor: "Thyago Medeiros", loja: "Jaru", vendas: 1, locacoes: 4, honorarios: "R$ 8.400" },
  { pos: 4, corretor: "Elizelia Pinto", loja: "Porto Velho", vendas: 0, locacoes: 6, honorarios: "R$ 6.100" }
] as const;

export default function MetasPage() {
  return (
    <div>
      <Topbar />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Metas batidas (mês)" value="2 de 4" />
        <KpiCard label="1º lugar do mês" value="Ana Souza" accent />
        <KpiCard label="Loja em destaque" value="Porto Velho" />
        <KpiCard label="Progresso médio" value="86%" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Metas individuais e por loja</div>
        <p className="text-xs text-gray-500 mb-3">
          Progresso calculado ao vivo (vendas, locações, honorários, captações, avaliações e novos
          clientes), sem depender de atualização manual.
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-normal py-1.5 border-b border-gray-100">Corretor</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Loja</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Meta</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Período</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Alvo</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Realizado</th>
              <th className="font-normal py-1.5 border-b border-gray-100 w-32">Progresso</th>
            </tr>
          </thead>
          <tbody>
            {METAS.map((m) => (
              <tr key={m.corretor + m.tipo}>
                <td className="py-2 border-b border-gray-50">{m.corretor}</td>
                <td className="py-2 border-b border-gray-50">{m.loja}</td>
                <td className="py-2 border-b border-gray-50">{m.tipo}</td>
                <td className="py-2 border-b border-gray-50">{m.periodo}</td>
                <td className="py-2 border-b border-gray-50">{m.meta}</td>
                <td className="py-2 border-b border-gray-50">{m.realizado}</td>
                <td className="py-2 border-b border-gray-50">
                  <ProgressBar percent={m.percent} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Ranking do mês — corretores</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-normal py-1.5 border-b border-gray-100">#</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Corretor</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Loja</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Vendas</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Locações</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Honorários</th>
            </tr>
          </thead>
          <tbody>
            {RANKING.map((r) => (
              <tr key={r.pos}>
                <td className="py-2 border-b border-gray-50 font-bold text-accent">{r.pos}º</td>
                <td className="py-2 border-b border-gray-50">{r.corretor}</td>
                <td className="py-2 border-b border-gray-50">{r.loja}</td>
                <td className="py-2 border-b border-gray-50 text-right">{r.vendas}</td>
                <td className="py-2 border-b border-gray-50 text-right">{r.locacoes}</td>
                <td className="py-2 border-b border-gray-50 text-right">{r.honorarios}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
