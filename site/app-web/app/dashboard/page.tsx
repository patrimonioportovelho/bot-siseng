import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatData, statusTone, STATUS_TRANSACAO_EM_ABERTO } from "@/lib/format";

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

  const [
    totalImoveis,
    transacoesAbertas,
    transacoesDoMes,
    contratosAVencer,
    locacoesVencidas,
    administracoesAtivas,
    solicitacoesPendentes,
    novosImoveis,
    transacoesRecentes
  ] = await Promise.all([
    prisma.imoveis.count({ where: { excluido: false } }),
    prisma.transacoes.count({ where: { excluido: false, status: STATUS_TRANSACAO_EM_ABERTO } }),
    // Honorário previsto do mês calculado direto de transacoes (valor_transacao
    // x porc_honorario) — a tabela pagamentos não é gravada por nenhuma
    // Server Action do sistema atual, então usar ela aqui sempre daria R$ 0,00
    // pra transação nova. valor_transacao/porc_honorario são preenchidos no
    // cadastro/edição, então isso reflete a realidade.
    prisma.transacoes.findMany({
      where: { excluido: false, data_assinatura: { gte: inicioMes, lt: inicioProxMes } },
      select: { valor_transacao: true, porc_honorario: true }
    }),
    prisma.transacoes.count({
      where: {
        excluido: false,
        tipo: "Locação",
        status: STATUS_TRANSACAO_EM_ABERTO,
        data_vencimento: { gte: hoje, lte: em30Dias }
      }
    }),
    prisma.transacoes.count({
      where: { excluido: false, tipo: "Locação", status: STATUS_TRANSACAO_EM_ABERTO, data_vencimento: { lt: hoje } }
    }),
    prisma.adm_imoveis.count({ where: { status: "Ativo", excluido: false } }),
    prisma.solicitacoes_acesso.count({ where: { status: "pendente" } }),
    prisma.imoveis.count({ where: { excluido: false, data_cadastro: { gte: inicioMes, lt: inicioProxMes } } }),
    prisma.transacoes.findMany({
      where: { excluido: false },
      take: 6,
      orderBy: { created_at: "desc" },
      include: {
        imoveis: true,
        clientes_transacoes_cliente_idToclientes: true,
        clientes_transacoes_cliente_contraparte_idToclientes: true
      }
    })
  ]);

  const honorarioPrevisto = transacoesDoMes.reduce(
    (acc, t) => acc + Number(t.valor_transacao) * Number(t.porc_honorario ?? 0),
    0
  );

  return (
    <div>
      <Topbar />

      {(locacoesVencidas > 0 || solicitacoesPendentes > 0) && (
        <div className="flex flex-col gap-2 mb-4">
          {locacoesVencidas > 0 && (
            <Link
              href="/transacoes/locacao"
              className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 font-medium hover:bg-red-100 transition-colors"
            >
              {locacoesVencidas} contrato{locacoesVencidas > 1 ? "s" : ""} de locação vencido
              {locacoesVencidas > 1 ? "s" : ""} — precisa renovar ou encerrar. Ver na lista de Locação →
            </Link>
          )}
          {solicitacoesPendentes > 0 && (
            <Link
              href="/configuracoes"
              className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2 font-medium hover:bg-blue-100 transition-colors"
            >
              {solicitacoesPendentes} solicitação{solicitacoesPendentes > 1 ? "ões" : ""} de acesso
              aguardando aprovação. Ver em Configurações →
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KpiCard label="Imóveis cadastrados" value={String(totalImoveis)} />
        <KpiCard label="Transações em andamento" value={String(transacoesAbertas)} />
        <KpiCard label="Honorário previsto (mês)" value={formatMoeda(honorarioPrevisto)} accent />
        <KpiCard label="Contratos a vencer (30 dias)" value={String(contratosAVencer)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Locações vencidas" value={String(locacoesVencidas)} />
        <KpiCard label="Administrações ativas" value={String(administracoesAtivas)} />
        <KpiCard label="Solicitações pendentes" value={String(solicitacoesPendentes)} />
        <KpiCard label="Imóveis cadastrados (mês)" value={String(novosImoveis)} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Transações recentes</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-normal py-1.5 border-b border-gray-100">Imóvel</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Proprietário</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Interessado</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Tipo</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Status</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Assinatura</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {transacoesRecentes.map((t) => (
              <tr key={t.id}>
                <td className="py-2 border-b border-gray-50 max-w-[200px] truncate">{t.imoveis?.endereco ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">
                  {t.clientes_transacoes_cliente_idToclientes?.nome ?? "—"}
                </td>
                <td className="py-2 border-b border-gray-50">
                  {t.clientes_transacoes_cliente_contraparte_idToclientes?.nome ?? "—"}
                </td>
                <td className="py-2 border-b border-gray-50">{t.tipo}</td>
                <td className="py-2 border-b border-gray-50">
                  <StatusBadge status={t.status ?? "—"} tone={statusTone(t.status)} />
                </td>
                <td className="py-2 border-b border-gray-50 whitespace-nowrap">{formatData(t.data_assinatura)}</td>
                <td className="py-2 border-b border-gray-50 text-right whitespace-nowrap">
                  {formatMoeda(t.valor_transacao)}
                </td>
              </tr>
            ))}
            {transacoesRecentes.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-gray-400">
                  Nenhuma transação cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
