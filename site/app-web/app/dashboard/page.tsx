import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { GraficoBarras } from "@/components/grafico-barras";
import { GraficoPizza } from "@/components/grafico-pizza";
import { prisma } from "@/lib/prisma";
import {
  formatMoeda,
  formatData,
  statusTone,
  STATUS_TRANSACAO_EM_ABERTO,
  resolverPeriodo,
  hojePortoVelho
} from "@/lib/format";

export const dynamic = "force-dynamic";

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string }>;
}) {
  const { periodo, inicio: inicioParam, fim: fimParam } = await searchParams;
  const periodoResolvido = resolverPeriodo({ periodo, inicio: inicioParam, fim: fimParam });
  const { inicio, fimExclusivo } = periodoResolvido;

  const hoje = hojePortoVelho();
  const em90Dias = new Date(hoje);
  em90Dias.setDate(em90Dias.getDate() + 90);

  const [
    totalImoveis,
    transacoesAbertas,
    transacoesDoPeriodoResumo,
    contratosAVencer,
    locacoesVencidas,
    administracoesAtivas,
    solicitacoesPendentes,
    novosImoveisPeriodo,
    transacoesDoPeriodo,
    recebimentosPendentesPeriodo,
    despesasPendentesPeriodo,
    recebimentosVencidos,
    despesasVencidas,
    movimentacoesPagasPeriodo
  ] = await Promise.all([
    prisma.imoveis.count({ where: { excluido: false } }),
    prisma.transacoes.count({ where: { excluido: false, status: STATUS_TRANSACAO_EM_ABERTO } }),
    // Honorário previsto do período, calculado direto de transacoes
    // (valor_transacao x porc_honorario) — a tabela pagamentos não é gravada
    // por nenhuma Server Action do sistema atual, então usar ela aqui sempre
    // daria R$ 0,00 pra transação nova. valor_transacao/porc_honorario são
    // preenchidos no cadastro/edição, então isso reflete a realidade.
    prisma.transacoes.findMany({
      where: { excluido: false, data_assinatura: { gte: inicio, lt: fimExclusivo } },
      select: { valor_transacao: true, porc_honorario: true }
    }),
    prisma.transacoes.count({
      where: {
        excluido: false,
        tipo: "Locação",
        status: STATUS_TRANSACAO_EM_ABERTO,
        data_vencimento: { gte: hoje, lte: em90Dias }
      }
    }),
    prisma.transacoes.count({
      where: { excluido: false, tipo: "Locação", status: STATUS_TRANSACAO_EM_ABERTO, data_vencimento: { lt: hoje } }
    }),
    prisma.adm_imoveis.count({ where: { status: "Ativo", excluido: false } }),
    prisma.solicitacoes_acesso.count({ where: { status: "pendente" } }),
    prisma.imoveis.count({ where: { excluido: false, data_cadastro: { gte: inicio, lt: fimExclusivo } } }),
    // Transações "recentes" agora significa "assinadas dentro do período
    // selecionado", ordenadas pela própria Data de assinatura — não mais
    // pela data de criação do registro no sistema. Antes, um contrato
    // importado há pouco tempo (ex.: da planilha antiga) mas assinado em
    // 2023 aparecia como "recente" mesmo sendo um negócio antigo, o que
    // confundia. Se um contrato foi de fato renovado e a Data de assinatura
    // não foi atualizada na edição dele, ele agora simplesmente não aparece
    // ao filtrar "Este ano" — sinal de que a data cadastrada precisa ser
    // corrigida na ficha da transação.
    prisma.transacoes.findMany({
      where: { excluido: false, data_assinatura: { gte: inicio, lt: fimExclusivo } },
      take: 15,
      orderBy: { data_assinatura: "desc" },
      include: {
        imoveis: true,
        clientes_transacoes_cliente_idToclientes: true,
        clientes_transacoes_cliente_contraparte_idToclientes: true
      }
    }),
    prisma.movimentacoes.aggregate({
      _sum: { valor: true },
      _count: true,
      where: { tipo: "Recebimento", pago: false, vencimento: { gte: inicio, lt: fimExclusivo } }
    }),
    prisma.movimentacoes.aggregate({
      _sum: { valor: true },
      _count: true,
      where: { tipo: "Despesa", pago: false, vencimento: { gte: inicio, lt: fimExclusivo } }
    }),
    // Vencido "em aberto" é sempre em relação a hoje, independente do período
    // selecionado no filtro — é um alerta de atraso, não uma métrica histórica.
    prisma.movimentacoes.aggregate({
      _sum: { valor: true },
      _count: true,
      where: { tipo: "Recebimento", pago: false, vencimento: { lt: hoje } }
    }),
    prisma.movimentacoes.aggregate({
      _sum: { valor: true },
      _count: true,
      where: { tipo: "Despesa", pago: false, vencimento: { lt: hoje } }
    }),
    // Uma única busca cobre os dois gráficos financeiros (mês a mês e pizza
    // por categoria) — evita rodar duas queries parecidas à toa.
    prisma.movimentacoes.findMany({
      where: { pago: true, data_pagamento: { gte: inicio, lt: fimExclusivo } },
      select: { tipo: true, valor: true, data_pagamento: true, categorias_financeiras: { select: { nome: true } } }
    })
  ]);

  const honorarioPrevisto = transacoesDoPeriodoResumo.reduce(
    (acc, t) => acc + Number(t.valor_transacao) * Number(t.porc_honorario ?? 0),
    0
  );

  const recebidoPeriodo = movimentacoesPagasPeriodo
    .filter((m) => m.tipo === "Recebimento")
    .reduce((acc, m) => acc + Number(m.valor), 0);
  const pagoPeriodo = movimentacoesPagasPeriodo
    .filter((m) => m.tipo === "Despesa")
    .reduce((acc, m) => acc + Number(m.valor), 0);
  const saldoPeriodo = recebidoPeriodo - pagoPeriodo;

  // Gráfico mês a mês: agrupa o que já foi de fato pago/recebido (data de
  // pagamento) por mês-calendário, dentro do período selecionado.
  const porMes = new Map<string, { recebido: number; pago: number; ordem: number }>();
  for (const m of movimentacoesPagasPeriodo) {
    if (!m.data_pagamento) continue;
    const d = new Date(m.data_pagamento);
    const chave = `${d.getFullYear()}-${d.getMonth()}`;
    const atual = porMes.get(chave) ?? { recebido: 0, pago: 0, ordem: d.getFullYear() * 12 + d.getMonth() };
    if (m.tipo === "Recebimento") atual.recebido += Number(m.valor);
    else atual.pago += Number(m.valor);
    porMes.set(chave, atual);
  }
  const dadosGraficoMensal = [...porMes.entries()]
    .sort((a, b) => a[1].ordem - b[1].ordem)
    .map(([chave, v]) => {
      const [ano, mes] = chave.split("-").map(Number);
      return { label: `${MESES_ABREV[mes]}/${String(ano).slice(2)}`, recebido: v.recebido, pago: v.pago };
    });

  // Pizza: composição das despesas pagas por categoria no período — "pra
  // onde foi o dinheiro", a leitura mais comum desse tipo de gráfico.
  const porCategoria = new Map<string, number>();
  for (const m of movimentacoesPagasPeriodo) {
    if (m.tipo !== "Despesa") continue;
    const nome = m.categorias_financeiras.nome;
    porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + Number(m.valor));
  }
  const dadosPizzaCategorias = [...porCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, valor]) => ({ label, valor }));

  // Links dos atalhos de período — preserva "personalizado" só quando ele
  // próprio é o link ativo (senão os campos de data ficam sem sentido).
  function hrefPeriodo(p: "mes" | "ano") {
    return `/dashboard?periodo=${p}`;
  }

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
        <KpiCard label="Honorário previsto (período)" value={formatMoeda(honorarioPrevisto)} accent />
        <KpiCard label="Contratos a vencer (90 dias)" value={String(contratosAVencer)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Locações vencidas" value={String(locacoesVencidas)} />
        <KpiCard label="Administrações ativas" value={String(administracoesAtivas)} />
        <KpiCard label="Solicitações pendentes" value={String(solicitacoesPendentes)} />
        <KpiCard label="Imóveis cadastrados (período)" value={String(novosImoveisPeriodo)} />
      </div>

      {/* Filtro de período — governa as Transações abaixo (por Data de
          assinatura) e todo o bloco Financeiro. */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs text-gray-500 mr-1">Período:</span>
          <a
            href={hrefPeriodo("mes")}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold ${
              periodoResolvido.preset === "mes" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 bg-white"
            }`}
          >
            Este mês
          </a>
          <a
            href={hrefPeriodo("ano")}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold ${
              periodoResolvido.preset === "ano" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 bg-white"
            }`}
          >
            Este ano
          </a>
        </div>
        <form className="flex items-center gap-2 flex-wrap">
          <input type="hidden" name="periodo" value="personalizado" />
          <label className="text-xs text-gray-500 flex items-center gap-1">
            De
            <input
              type="date"
              name="inicio"
              defaultValue={periodoResolvido.inicioTexto}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary"
            />
          </label>
          <label className="text-xs text-gray-500 flex items-center gap-1">
            Até
            <input
              type="date"
              name="fim"
              defaultValue={periodoResolvido.fimTexto}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary"
            />
          </label>
          <button
            type="submit"
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold ${
              periodoResolvido.preset === "personalizado" ? "bg-primary text-white border-primary" : "border-gray-300 text-gray-600 bg-white"
            }`}
          >
            Aplicar
          </button>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="text-sm font-bold text-gray-800 mb-3">
          Transações do período ({transacoesDoPeriodo.length}
          {transacoesDoPeriodo.length === 15 ? "+" : ""})
        </div>
        {/* overflow-x-auto + min-w no table: no celular a tabela rola de lado
            em vez de espremer/cortar as colunas (era o que estava quebrando
            o layout no print do celular). */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
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
              {transacoesDoPeriodo.map((t) => (
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
              {transacoesDoPeriodo.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-400">
                    Nenhuma transação assinada nesse período. Se esperava ver alguma aqui (ex.: um contrato renovado),
                    confira a Data de assinatura cadastrada na ficha dela.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">Financeiro</div>
          <Link href="/financeiro" className="text-xs text-primary font-semibold hover:underline">
            Ver Financeiro completo →
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div className="text-xs text-gray-500">Recebido no período</div>
            <div className="text-lg font-bold mt-1 text-accent">{formatMoeda(recebidoPeriodo)}</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div className="text-xs text-gray-500">Pago no período</div>
            <div className="text-lg font-bold mt-1 text-gray-900">{formatMoeda(pagoPeriodo)}</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div className="text-xs text-gray-500">Saldo do período</div>
            <div className={`text-lg font-bold mt-1 ${saldoPeriodo >= 0 ? "text-[#3C7A57]" : "text-red-600"}`}>
              {formatMoeda(saldoPeriodo)}
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div className="text-xs text-gray-500">A receber no período</div>
            <div className="text-lg font-bold mt-1 text-gray-900">
              {formatMoeda(recebimentosPendentesPeriodo._sum.valor ?? 0)}
            </div>
            <div className="text-[11px] text-gray-400">{recebimentosPendentesPeriodo._count} pendente(s)</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div className="text-xs text-gray-500">A pagar no período</div>
            <div className="text-lg font-bold mt-1 text-gray-900">
              {formatMoeda(despesasPendentesPeriodo._sum.valor ?? 0)}
            </div>
            <div className="text-[11px] text-gray-400">{despesasPendentesPeriodo._count} pendente(s)</div>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-3">
            <div className="text-xs text-red-700">Vencido em aberto (hoje)</div>
            <div className="text-lg font-bold mt-1 text-red-700">
              {formatMoeda(Number(recebimentosVencidos._sum.valor ?? 0) + Number(despesasVencidas._sum.valor ?? 0))}
            </div>
            <div className="text-[11px] text-red-500">
              {recebimentosVencidos._count + despesasVencidas._count} movimentação(ões) atrasada(s)
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">Recebido x Pago, mês a mês</div>
            <GraficoBarras
              dados={dadosGraficoMensal}
              series={[
                { chave: "recebido", cor: "#3C7A57", nome: "Recebido" },
                { chave: "pago", cor: "#B14226", nome: "Pago" }
              ]}
              formatarValor={formatMoeda}
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">Despesas pagas por categoria</div>
            <GraficoPizza dados={dadosPizzaCategorias} formatarValor={formatMoeda} />
          </div>
        </div>
      </div>
    </div>
  );
}
