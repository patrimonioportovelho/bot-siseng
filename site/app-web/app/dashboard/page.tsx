import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { GraficoBarras } from "@/components/grafico-barras";
import { GraficoPizza } from "@/components/grafico-pizza";
import { prisma } from "@/lib/prisma";
import {
  formatMoeda,
  formatDataCalendario,
  statusTone,
  STATUS_TRANSACAO_EM_ABERTO,
  resolverPeriodo,
  hojePortoVelho
} from "@/lib/format";
import { FUNCOES_CORRETOR } from "@/lib/transacoes/opcoes";

export const dynamic = "force-dynamic";

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Status usado nas transações de Locação que não têm administração vinculada
// (o dono cuida direto, a imobiliária só intermediou o contrato). Ver
// STATUS_ABERTA em lib/format.ts.
const STATUS_LOCACAO_SEM_ADM = "Imóvel em locação sem administração";
const STATUS_CANCELADAS = ["Distrato", "Locação cancelada"];

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
    transacoesPeriodo,
    contratosAVencer,
    locacoesVencidas,
    administracoesAtivas,
    solicitacoesPendentes,
    novosImoveisPeriodo,
    transacoesDoPeriodo,
    administracoesPeriodo,
    recebimentosPendentesPeriodo,
    despesasPendentesPeriodo,
    recebimentosVencidos,
    despesasVencidas,
    movimentacoesPagasPeriodo,
    corretoresAtivos,
    despesasPagasPorCorretor,
    despesasPendentesPorCorretor
  ] = await Promise.all([
    prisma.imoveis.count({ where: { excluido: false } }),
    prisma.transacoes.count({ where: { excluido: false, status: STATUS_TRANSACAO_EM_ABERTO } }),
    // Base de tudo que é "negócio assinado no período": alimenta VGH/VGV/VGL,
    // a quantidade de Locação sem administração, os distratos e o gráfico de
    // novos negócios mês a mês — uma única busca em vez de várias parecidas.
    prisma.transacoes.findMany({
      where: { excluido: false, data_assinatura: { gte: inicio, lt: fimExclusivo } },
      select: {
        tipo: true,
        status: true,
        valor_transacao: true,
        porc_honorario: true,
        tem_parceria: true,
        porc_parceria: true,
        data_assinatura: true
      }
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
    // Administrações ativas é sempre "agora" (estado atual), não do período —
    // mesma lógica do "Vencido em aberto" do Financeiro, mais abaixo.
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
    // VGA (administração) e o "Administração" do gráfico de novos negócios —
    // por Data de assinatura da administração, igual às transações.
    prisma.adm_imoveis.findMany({
      where: { excluido: false, data_assinatura: { gte: inicio, lt: fimExclusivo } },
      select: { valor_administracao: true, data_assinatura: true }
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
    }),
    // Quadro "Corretores" mais abaixo: todo parceiro com função Corretor ou
    // Corretor Estagiário, ativo, pra listar mesmo quem ainda não tem nenhum
    // repasse lançado (aparece com R$ 0,00 nas duas colunas).
    prisma.parceiros.findMany({
      where: { funcao: { in: FUNCOES_CORRETOR }, status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, funcao: true }
    }),
    // Recebido: despesas de repasse já pagas ao corretor, pela Data de
    // pagamento dentro do período — mesmo critério do "Pago no período" logo
    // acima, só que agrupado por parceiro.
    prisma.movimentacoes.groupBy({
      by: ["parceiro_id"],
      where: {
        tipo: "Despesa",
        pago: true,
        parceiro_id: { not: null },
        data_pagamento: { gte: inicio, lt: fimExclusivo }
      },
      _sum: { valor: true }
    }),
    // A Receber: despesas de repasse ainda pendentes, pelo Vencimento dentro
    // do período — mesmo critério do "A pagar no período" logo acima.
    prisma.movimentacoes.groupBy({
      by: ["parceiro_id"],
      where: {
        tipo: "Despesa",
        pago: false,
        parceiro_id: { not: null },
        vencimento: { gte: inicio, lt: fimExclusivo }
      },
      _sum: { valor: true }
    })
  ]);

  // VGH (Valor Geral de Honorários): soma de valor_transacao x porc_honorario
  // de TODA transação assinada no período (Compra e Venda + Locação, é o que
  // o usuário pediu). "Bruto" é o honorário cheio; "Líquido" desconta a
  // parte que fica com o parceiro externo quando há parceria — mesma conta
  // usada em Financeiro/Comissionamento pra saber o que de fato fica com a
  // imobiliária.
  // VGV (vendas) e VGL (locação): valor_transacao e quantidade, por tipo.
  // Distratos: transações cujo status atual é Distrato/Locação cancelada,
  // agrupadas pela mesma Data de assinatura (não existe um campo de "data de
  // encerramento" preenchido no sistema hoje).
  let honorarioBruto = 0;
  let honorarioLiquido = 0;
  let vendasValor = 0;
  let vendasQtd = 0;
  let locacaoValor = 0;
  let locacaoQtd = 0;
  let locacaoSemAdmQtd = 0;
  let distratosQtd = 0;
  const porMesNegocios = new Map<
    string,
    { vendas: number; locacoes: number; administracoes: number; distratos: number; ordem: number }
  >();

  function linhaDoMes(data: unknown) {
    const d = new Date(data as string);
    const chave = `${d.getFullYear()}-${d.getMonth()}`;
    const atual = porMesNegocios.get(chave) ?? {
      vendas: 0,
      locacoes: 0,
      administracoes: 0,
      distratos: 0,
      ordem: d.getFullYear() * 12 + d.getMonth()
    };
    porMesNegocios.set(chave, atual);
    return atual;
  }

  for (const t of transacoesPeriodo) {
    const honorario = Number(t.valor_transacao) * Number(t.porc_honorario ?? 0);
    honorarioBruto += honorario;
    honorarioLiquido += t.tem_parceria ? honorario * (1 - Number(t.porc_parceria ?? 0)) : honorario;

    const linha = linhaDoMes(t.data_assinatura);

    if (t.tipo === "Compra e Venda") {
      vendasValor += Number(t.valor_transacao);
      vendasQtd += 1;
      linha.vendas += 1;
    } else if (t.tipo === "Locação") {
      locacaoValor += Number(t.valor_transacao);
      locacaoQtd += 1;
      linha.locacoes += 1;
      if (t.status === STATUS_LOCACAO_SEM_ADM) locacaoSemAdmQtd += 1;
    }

    if (t.status && STATUS_CANCELADAS.includes(t.status)) {
      distratosQtd += 1;
      linha.distratos += 1;
    }
  }

  for (const a of administracoesPeriodo) {
    if (!a.data_assinatura) continue;
    linhaDoMes(a.data_assinatura).administracoes += 1;
  }

  const administracaoValor = administracoesPeriodo.reduce((acc, a) => acc + Number(a.valor_administracao ?? 0), 0);
  const administracaoQtd = administracoesPeriodo.length;

  const dadosGraficoNegocios = [...porMesNegocios.entries()]
    .sort((a, b) => a[1].ordem - b[1].ordem)
    .map(([chave, v]) => {
      const [ano, mes] = chave.split("-").map(Number);
      return {
        label: `${MESES_ABREV[mes]}/${String(ano).slice(2)}`,
        vendas: v.vendas,
        locacoes: v.locacoes,
        administracoes: v.administracoes,
        distratos: v.distratos
      };
    });

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

  // Quadro Corretores: junta o cadastro (todo Corretor/Corretor Estagiário
  // ativo) com o que já foi de fato pago a ele (Recebido) e o que ainda está
  // pendente (A Receber), ambos dentro do período selecionado — mesma régua
  // de "Recebido/Pago" e "A receber/A pagar" já usada no bloco Financeiro
  // acima, só que agrupado por parceiro em vez de somado geral.
  const recebidoPorParceiro = new Map<string, number>();
  for (const g of despesasPagasPorCorretor) {
    if (!g.parceiro_id) continue;
    recebidoPorParceiro.set(g.parceiro_id, Number(g._sum.valor ?? 0));
  }
  const aReceberPorParceiro = new Map<string, number>();
  for (const g of despesasPendentesPorCorretor) {
    if (!g.parceiro_id) continue;
    aReceberPorParceiro.set(g.parceiro_id, Number(g._sum.valor ?? 0));
  }
  const corretoresComValores = corretoresAtivos
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      funcao: c.funcao,
      recebido: recebidoPorParceiro.get(c.id) ?? 0,
      aReceber: aReceberPorParceiro.get(c.id) ?? 0
    }))
    .sort((a, b) => b.recebido + b.aReceber - (a.recebido + a.aReceber));
  const totalRecebidoCorretores = corretoresComValores.reduce((acc, c) => acc + c.recebido, 0);
  const totalAReceberCorretores = corretoresComValores.reduce((acc, c) => acc + c.aReceber, 0);

  // Links dos atalhos de período — preserva "personalizado" só quando ele
  // próprio é o link ativo (senão os campos de data ficam sem sentido).
  function hrefPeriodo(p: "mes" | "ano") {
    return `/dashboard?periodo=${p}`;
  }

  // Mesma query string do período atual, usada tanto no link "Ver todas as
  // transações" quanto se precisar linkar o período pra outra tela.
  const queryPeriodoAtual = new URLSearchParams();
  queryPeriodoAtual.set("periodo", periodoResolvido.preset);
  if (periodoResolvido.preset === "personalizado") {
    queryPeriodoAtual.set("inicio", periodoResolvido.inicioTexto);
    queryPeriodoAtual.set("fim", periodoResolvido.fimTexto);
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Imóveis cadastrados" value={String(totalImoveis)} />
        <KpiCard label="Transações em andamento" value={String(transacoesAbertas)} />
        <KpiCard label="Contratos a vencer (90 dias)" value={String(contratosAVencer)} />
        <KpiCard label="Solicitações pendentes" value={String(solicitacoesPendentes)} />
      </div>

      {/* Filtro de período — governa as Transações abaixo (por Data de
          assinatura), o quadro Vendas & Locação e todo o bloco Financeiro. */}
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
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">
            Transações do período ({transacoesDoPeriodo.length}
            {transacoesDoPeriodo.length === 15 ? "+" : ""})
          </div>
          {transacoesDoPeriodo.length === 15 && (
            <Link
              href={`/transacoes/periodo?${queryPeriodoAtual.toString()}`}
              className="text-xs text-primary font-semibold hover:underline whitespace-nowrap"
            >
              Ver todas as transações →
            </Link>
          )}
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
                  <td className="py-2 border-b border-gray-50 whitespace-nowrap">{formatDataCalendario(t.data_assinatura)}</td>
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

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">Vendas & Locação</div>
          <div className="text-[11px] text-gray-400">{novosImoveisPeriodo} imóvel(is) captado(s) no período</div>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          Valores somados pela Data de assinatura, dentro do período selecionado acima.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div className="text-xs text-gray-500">VGH — Honorários (bruto)</div>
            <div className="text-lg font-bold mt-1 text-accent">{formatMoeda(honorarioBruto)}</div>
            <div className="text-[11px] text-gray-400">Líquido: {formatMoeda(honorarioLiquido)}</div>
            <div className="text-[11px] text-gray-400">
              {vendasQtd + locacaoQtd} transação(ões) com honorário
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div className="text-xs text-gray-500">VGV — Vendas</div>
            <div className="text-lg font-bold mt-1 text-gray-900">{formatMoeda(vendasValor)}</div>
            <div className="text-[11px] text-gray-400">{vendasQtd} venda(s)</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div className="text-xs text-gray-500">VGL — Locação</div>
            <div className="text-lg font-bold mt-1 text-gray-900">{formatMoeda(locacaoValor)}</div>
            <div className="text-[11px] text-gray-400">{locacaoQtd} contrato(s)</div>
            <div className="text-[11px] text-gray-400">{locacaoSemAdmQtd} sem administração</div>
            <div className="text-[11px] text-gray-400">{administracoesAtivas} administração(ões) ativa(s) (atual)</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div className="text-xs text-gray-500">VGA — Administração</div>
            <div className="text-lg font-bold mt-1 text-gray-900">{formatMoeda(administracaoValor)}</div>
            <div className="text-[11px] text-gray-400">{administracaoQtd} administração(ões) no período</div>
          </div>
        </div>

        {distratosQtd > 0 && (
          <div className="text-[11px] text-red-600 mb-2">
            {distratosQtd} distrato(s)/cancelamento(s) no período (pela Data de assinatura, sem uma data de
            encerramento cadastrada)
          </div>
        )}

        <div className="text-xs font-semibold text-gray-600 mb-2 mt-2">Novos negócios, mês a mês</div>
        <GraficoBarras
          dados={dadosGraficoNegocios}
          series={[
            { chave: "vendas", cor: "#04075c", nome: "Compra e Venda" },
            { chave: "locacoes", cor: "#3C7A57", nome: "Locação" },
            { chave: "administracoes", cor: "#c97a1a", nome: "Administração" },
            { chave: "distratos", cor: "#B14226", nome: "Distratos" }
          ]}
          formatarValor={(v) => String(v)}
          mensagemVazia="Sem negócios registrados nesse período."
        />
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

      <div className="bg-white border border-gray-200 rounded-xl p-4 mt-5">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">Corretores</div>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          Repasses de honorário/comissão por corretor, dentro do período selecionado acima — Recebido pela Data de
          pagamento, A Receber pelo Vencimento.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="font-normal py-1.5 border-b border-gray-100">Parceiro (corretor)</th>
                <th className="font-normal py-1.5 border-b border-gray-100 text-right">Recebido</th>
                <th className="font-normal py-1.5 border-b border-gray-100 text-right">A Receber</th>
              </tr>
            </thead>
            <tbody>
              {corretoresComValores.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 border-b border-gray-50">
                    <Link href={`/parceiros/${c.id}/dashboard`} className="text-primary font-medium hover:underline">
                      {c.nome}
                    </Link>
                    <span className="text-[11px] text-gray-400"> — {c.funcao}</span>
                  </td>
                  <td className="py-2 border-b border-gray-50 text-right whitespace-nowrap text-[#3C7A57] font-semibold">
                    {formatMoeda(c.recebido)}
                  </td>
                  <td className="py-2 border-b border-gray-50 text-right whitespace-nowrap text-gray-700 font-semibold">
                    {formatMoeda(c.aReceber)}
                  </td>
                </tr>
              ))}
              {corretoresComValores.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-gray-400">
                    Nenhum corretor ativo cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
            {corretoresComValores.length > 0 && (
              <tfoot>
                <tr>
                  <td className="py-2 font-bold text-gray-700">Total</td>
                  <td className="py-2 text-right font-bold text-[#3C7A57] whitespace-nowrap">
                    {formatMoeda(totalRecebidoCorretores)}
                  </td>
                  <td className="py-2 text-right font-bold text-gray-800 whitespace-nowrap">
                    {formatMoeda(totalAReceberCorretores)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
