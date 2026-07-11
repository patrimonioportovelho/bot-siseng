import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { KpiCard } from "@/components/kpi-card";
import { GraficoBarras } from "@/components/grafico-barras";
import { prisma } from "@/lib/prisma";
import { formatMoeda, resolverPeriodo } from "@/lib/format";

export const dynamic = "force-dynamic";

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function DashboardCorretorPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string }>;
}) {
  const { id } = await params;
  const { periodo, inicio: inicioParam, fim: fimParam } = await searchParams;
  const periodoResolvido = resolverPeriodo({ periodo, inicio: inicioParam, fim: fimParam });
  const { inicio, fimExclusivo } = periodoResolvido;

  const parceiro = await prisma.parceiros.findUnique({
    where: { id },
    select: { id: true, nome: true, funcao: true, status_funcao: true }
  });
  if (!parceiro) notFound();

  const [captacoes, locacoes, compraEVenda, pagamentosDoCorretor] = await Promise.all([
    // Captações: imóveis onde este parceiro é o corretor captador, pela Data
    // de cadastro dentro do período — mesmo campo (imoveis.parceiro_id) usado
    // no formulário de imóvel pra "Corretor captador".
    prisma.imoveis.aggregate({
      _count: true,
      _sum: { valor_venda: true },
      where: { parceiro_id: id, excluido: false, data_cadastro: { gte: inicio, lt: fimExclusivo } }
    }),
    // Locações e Compra e Venda: transações assinadas no período em que este
    // parceiro é o corretor do proprietário OU da contraparte — mesma régua
    // de Data de assinatura do Dashboard geral.
    prisma.transacoes.aggregate({
      _count: true,
      _sum: { valor_transacao: true },
      where: {
        excluido: false,
        tipo: "Locação",
        data_assinatura: { gte: inicio, lt: fimExclusivo },
        OR: [{ corretor_proprietario_id: id }, { corretor_contraparte_id: id }]
      }
    }),
    prisma.transacoes.aggregate({
      _count: true,
      _sum: { valor_transacao: true },
      where: {
        excluido: false,
        tipo: "Compra e Venda",
        data_assinatura: { gte: inicio, lt: fimExclusivo },
        OR: [{ corretor_proprietario_id: id }, { corretor_contraparte_id: id }]
      }
    }),
    // Recebido/A Receber + produção mês a mês: a fonte de verdade é a tabela
    // `pagamentos` (rateio de honorário), filtrada pela Data de assinatura da
    // transação — não pela Data de pagamento/vencimento da Despesa. Muita
    // transação antiga já tem o rateio gravado em `pagamentos` (inclusive
    // vindo direto da "tabela de honorários" da planilha) mas nunca ganhou a
    // Despesa correspondente em `movimentacoes`; filtrar pela despesa fazia
    // esses anos aparecerem zerados. Quando existe Despesa vinculada, ela
    // manda no status "pago" (é o que o Financeiro mexe no dia a dia);
    // senão usa o status histórico gravado direto em pagamentos.status.
    prisma.pagamentos.findMany({
      where: { parceiro_id: id, transacoes: { data_assinatura: { gte: inicio, lt: fimExclusivo }, excluido: false } },
      select: {
        valor_parceiro: true,
        status: true,
        data_pagamento: true,
        movimentacoes: { select: { pago: true, data_pagamento: true } }
      }
    })
  ]);

  let despesasPagasTotalSoma = 0;
  let despesasPagasTotalQtd = 0;
  let despesasPendentesTotalSoma = 0;
  let despesasPendentesTotalQtd = 0;
  const porMes = new Map<string, { valor: number; ordem: number }>();

  for (const p of pagamentosDoCorretor) {
    const despesaLigada = p.movimentacoes[0];
    const pago = despesaLigada ? despesaLigada.pago : p.status === "Pago";
    const valor = Number(p.valor_parceiro ?? 0);

    if (pago) {
      despesasPagasTotalSoma += valor;
      despesasPagasTotalQtd += 1;
      // Produção mês a mês: usa a Data de pagamento da Despesa quando existe;
      // senão a data_pagamento já gravada em pagamentos (histórico da planilha).
      const dataPagamentoEfetiva = despesaLigada?.data_pagamento ?? p.data_pagamento;
      if (dataPagamentoEfetiva) {
        const d = new Date(dataPagamentoEfetiva);
        const chave = `${d.getFullYear()}-${d.getMonth()}`;
        const atual = porMes.get(chave) ?? { valor: 0, ordem: d.getFullYear() * 12 + d.getMonth() };
        atual.valor += valor;
        porMes.set(chave, atual);
      }
    } else {
      despesasPendentesTotalSoma += valor;
      despesasPendentesTotalQtd += 1;
    }
  }

  // Produção mês a mês, com queda destacada: agrupa por mês-calendário e
  // depois compara cada mês com o anterior — quando cai, o valor entra na
  // série vermelha em vez da verde, pra aparecer destacado no gráfico
  // (é o pedido de "perca" = "quando cai as produções").
  const mesesOrdenados = [...porMes.entries()].sort((a, b) => a[1].ordem - b[1].ordem);
  let valorMesAnterior: number | null = null;
  const quedas: { label: string; percentual: number }[] = [];
  const dadosProducao = mesesOrdenados.map(([chave, v]) => {
    const [ano, mes] = chave.split("-").map(Number);
    const label = `${MESES_ABREV[mes]}/${String(ano).slice(2)}`;
    const caiu = valorMesAnterior !== null && v.valor < valorMesAnterior;
    if (caiu && valorMesAnterior) {
      quedas.push({ label, percentual: ((v.valor - valorMesAnterior) / valorMesAnterior) * 100 });
    }
    valorMesAnterior = v.valor;
    return {
      label,
      cresceu: caiu ? 0 : v.valor,
      caiu: caiu ? v.valor : 0
    };
  });

  return (
    <div>
      <Topbar />

      <Link href="/dashboard" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para o Dashboard
      </Link>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-sm font-bold text-gray-800">{parceiro.nome}</div>
          <div className="text-[11px] text-gray-400">
            {parceiro.funcao}
            {parceiro.status_funcao !== "Ativo" ? ` · ${parceiro.status_funcao}` : ""}
          </div>
        </div>
        <Link href={`/parceiros/${parceiro.id}`} className="text-xs text-primary font-semibold hover:underline">
          Ver ficha completa →
        </Link>
      </div>

      {/* Mesmo filtro de período do Dashboard geral. */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs text-gray-500 mr-1">Período:</span>
          <a
            href={`?periodo=mes`}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold ${
              periodoResolvido.preset === "mes" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 bg-white"
            }`}
          >
            Este mês
          </a>
          <a
            href={`?periodo=ano`}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Captações no período" value={String(captacoes._count)} />
        <KpiCard
          label="Locações no período"
          value={`${locacoes._count} — ${formatMoeda(locacoes._sum.valor_transacao ?? 0)}`}
        />
        <KpiCard
          label="Compra e venda no período"
          value={`${compraEVenda._count} — ${formatMoeda(compraEVenda._sum.valor_transacao ?? 0)}`}
        />
        <KpiCard label="Valor de captação (venda)" value={formatMoeda(captacoes._sum.valor_venda ?? 0)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-2 gap-3 mb-5">
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
          <div className="text-xs text-gray-500">Recebido no período</div>
          <div className="text-lg font-bold mt-1 text-accent">{formatMoeda(despesasPagasTotalSoma)}</div>
          <div className="text-[11px] text-gray-400">{despesasPagasTotalQtd} repasse(s) pago(s)</div>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
          <div className="text-xs text-gray-500">A receber no período</div>
          <div className="text-lg font-bold mt-1 text-gray-900">{formatMoeda(despesasPendentesTotalSoma)}</div>
          <div className="text-[11px] text-gray-400">{despesasPendentesTotalQtd} pendente(s)</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Produção mês a mês (repasse pago)</div>
        <p className="text-[11px] text-gray-400 mb-3">
          Verde: mês igual ou maior que o anterior. Vermelho: mês em queda em relação ao anterior.
        </p>
        <GraficoBarras
          dados={dadosProducao}
          series={[
            { chave: "cresceu", cor: "#3C7A57", nome: "Estável/Crescendo" },
            { chave: "caiu", cor: "#B14226", nome: "Em queda" }
          ]}
          formatarValor={formatMoeda}
          mensagemVazia="Sem repasses pagos nesse período."
        />
        {quedas.length > 0 && (
          <div className="mt-3 text-[11px] text-red-600">
            Meses em queda: {quedas.map((q) => `${q.label} (${q.percentual.toFixed(0)}%)`).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
