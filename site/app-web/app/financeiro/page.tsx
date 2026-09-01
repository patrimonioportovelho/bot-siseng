import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Pagination } from "@/components/pagination";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatDataCalendario, situacaoVencimento, hojePortoVelho } from "@/lib/format";
import { lojasSelecionadas, whereLojaFiltroMovimentacao } from "@/lib/lojas/filtro";
import { rotuloStatusPagamento } from "@/lib/financeiro/status-pagamento";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Janela de alerta (dias antes do vencimento) pro destaque amarelo — mesma
// lógica de cores da Locação (vencido = vermelho, perto de vencer = amarelo),
// só que aqui a janela é de 15 dias em vez de 90 (financeiro é bem mais
// imediato: uma conta "a vencer" só importa avisar bem mais perto da data).
const DIAS_ALERTA = 15;

// Colunas fixas em fr/px (mesmo padrão de components/transacoes-lista.tsx) —
// abaixo de md a linha empilha em coluna única, ver classes na renderização.
const COLUNAS = "md:grid-cols-[1fr_1fr_1fr_0.9fr_90px_100px_90px_90px_1.3fr]";

export default async function FinanceiroPage({
  searchParams
}: {
  searchParams: Promise<{
    tipo?: string;
    pago?: string;
    situacao?: string;
    q?: string;
    page?: string;
    categoria?: string;
    venc_de?: string;
    venc_ate?: string;
    pag_de?: string;
    pag_ate?: string;
    excluido?: string;
    erro?: string;
  }>;
}) {
  const {
    tipo: tipoParam,
    pago: pagoParam,
    situacao: situacaoParam,
    q,
    page: pageParam,
    categoria: categoriaParam,
    venc_de: vencDe,
    venc_ate: vencAte,
    pag_de: pagDe,
    pag_ate: pagAte,
    excluido,
    erro
  } = await searchParams;
  const tipo = tipoParam === "recebimento" ? "Recebimento" : "Despesa";
  const termo = (q ?? "").trim();
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const hoje = hojePortoVelho();
  const vencidas = situacaoParam === "vencidas";
  const lojasFiltro = await lojasSelecionadas();

  // Vencimento e Data de pagamento são duas dimensões de tempo diferentes —
  // filtrando separado dá pra responder tanto "o que vence em julho" quanto
  // "o que eu já paguei/recebi em julho", sem uma pisar na outra.
  const vencimentoFiltro: { gte?: Date; lte?: Date; lt?: Date } = {};
  if (vencDe) {
    const d = new Date(vencDe + "T00:00:00");
    if (!Number.isNaN(d.getTime())) vencimentoFiltro.gte = d;
  }
  if (vencAte) {
    const d = new Date(vencAte + "T00:00:00");
    if (!Number.isNaN(d.getTime())) vencimentoFiltro.lte = d;
  }
  // situacao=vencidas (cards "Despesas/Recebimentos vencidos" e o link do
  // Dashboard "Saúde da operação"): tudo que ainda não foi pago e já passou
  // do vencimento.
  if (vencidas) vencimentoFiltro.lt = hoje;

  const pagamentoFiltro: { gte?: Date; lte?: Date } = {};
  if (pagDe) {
    const d = new Date(pagDe + "T00:00:00");
    if (!Number.isNaN(d.getTime())) pagamentoFiltro.gte = d;
  }
  if (pagAte) {
    const d = new Date(pagAte + "T00:00:00");
    if (!Number.isNaN(d.getTime())) pagamentoFiltro.lte = d;
  }

  // Status de pagamento (3 etapas: Pendente -> Conferido -> Pago). "Em aberto"
  // = tudo que ainda não foi pago (Pendente + Conferido). "Conferido" é a
  // antiga pílula "Pendente - recebido", agora um status de verdade.
  const statusWhere: Record<string, unknown> = vencidas
    ? { status_pagamento: { not: "Pago" } }
    : pagoParam === "pago"
      ? { status_pagamento: "Pago" }
      : pagoParam === "conferido"
        ? { status_pagamento: "Conferido" }
        : pagoParam === "todas"
          ? {}
          : { status_pagamento: { not: "Pago" } };

  // Filtro de Loja (seletor no Topbar) — movimentacoes chega na loja pela
  // transação vinculada; sem transação sempre aparece (despesa/receita geral
  // da imobiliária). Envolvido em AND porque o `where` pode ter outro OR (busca).
  const andFiltros: Record<string, unknown>[] = [whereLojaFiltroMovimentacao(lojasFiltro)];
  if (termo) {
    andFiltros.push({
      OR: [
        { descricao: { contains: termo, mode: "insensitive" as const } },
        { contraparte_nome: { contains: termo, mode: "insensitive" as const } },
        { clientes_interessado: { nome: { contains: termo, mode: "insensitive" as const } } },
        { clientes_proprietario: { nome: { contains: termo, mode: "insensitive" as const } } },
        { parceiros: { nome: { contains: termo, mode: "insensitive" as const } } },
        { categorias_financeiras: { nome: { contains: termo, mode: "insensitive" as const } } }
      ]
    });
  }

  const where = {
    tipo,
    ...(categoriaParam ? { categoria_id: categoriaParam } : {}),
    ...(vencimentoFiltro.gte || vencimentoFiltro.lte || vencimentoFiltro.lt ? { vencimento: vencimentoFiltro } : {}),
    ...(pagamentoFiltro.gte || pagamentoFiltro.lte ? { data_pagamento: pagamentoFiltro } : {}),
    ...statusWhere,
    AND: andFiltros
  };

  const lojaFiltroWhere = whereLojaFiltroMovimentacao(lojasFiltro);

  const [
    movimentacoes,
    total,
    totalDespesaAberto,
    totalRecebimentoAberto,
    conferidoAguardando,
    vencidosDespesa,
    vencidosRecebimento,
    categorias
  ] = await Promise.all([
    prisma.movimentacoes.findMany({
      where,
      orderBy: pagoParam === "pago" ? [{ data_pagamento: "desc" }] : [{ vencimento: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        categorias_financeiras: true,
        clientes_interessado: true,
        clientes_proprietario: true,
        parceiros: true
      }
    }),
    prisma.movimentacoes.count({ where }),
    prisma.movimentacoes.aggregate({
      _sum: { valor: true },
      where: { tipo: "Despesa", status_pagamento: { not: "Pago" }, ...lojaFiltroWhere }
    }),
    prisma.movimentacoes.aggregate({
      _sum: { valor: true },
      where: { tipo: "Recebimento", status_pagamento: { not: "Pago" }, ...lojaFiltroWhere }
    }),
    prisma.movimentacoes.count({
      where: { tipo: "Despesa", status_pagamento: "Conferido", ...lojaFiltroWhere }
    }),
    prisma.movimentacoes.count({
      where: { tipo: "Despesa", status_pagamento: { not: "Pago" }, vencimento: { lt: hoje }, ...lojaFiltroWhere }
    }),
    prisma.movimentacoes.count({
      where: { tipo: "Recebimento", status_pagamento: { not: "Pago" }, vencimento: { lt: hoje }, ...lojaFiltroWhere }
    }),
    prisma.categorias_financeiras.findMany({ where: { tipo }, orderBy: { nome: "asc" } })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rotuloPago = tipo === "Despesa" ? "Pago" : "Recebido";

  // Filtros que precisam sobreviver tanto à troca de aba Despesa/Recebimento
  // quanto à paginação e à troca de pílula Em aberto/Pago/Todas — exceto
  // categoria, que é limpa ao trocar de tipo (categoria de Despesa não
  // existe na lista de Recebimento, e vice-versa).
  function hrefTipo(t: "despesa" | "recebimento") {
    const params = new URLSearchParams();
    params.set("tipo", t);
    if (pagoParam) params.set("pago", pagoParam);
    if (situacaoParam) params.set("situacao", situacaoParam);
    if (vencDe) params.set("venc_de", vencDe);
    if (vencAte) params.set("venc_ate", vencAte);
    if (pagDe) params.set("pag_de", pagDe);
    if (pagAte) params.set("pag_ate", pagAte);
    return `/financeiro?${params.toString()}`;
  }

  // Trocar de pílula sai da visão "vencidas" (situacao não é carregado).
  function hrefPago(p: string | null) {
    const params = new URLSearchParams();
    if (tipoParam) params.set("tipo", tipoParam);
    if (p) params.set("pago", p);
    if (categoriaParam) params.set("categoria", categoriaParam);
    if (vencDe) params.set("venc_de", vencDe);
    if (vencAte) params.set("venc_ate", vencAte);
    if (pagDe) params.set("pag_de", pagDe);
    if (pagAte) params.set("pag_ate", pagAte);
    return `/financeiro?${params.toString()}`;
  }

  const cardAtivo = (t: "despesa" | "recebimento", p?: string, s?: string) =>
    tipo === (t === "despesa" ? "Despesa" : "Recebimento") &&
    (p ?? undefined) === (pagoParam || undefined) &&
    (s ?? undefined) === (situacaoParam || undefined);

  return (
    <div>
      <Topbar />

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">
          {erro}
        </div>
      )}
      {excluido === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Movimentação excluída com sucesso.
        </div>
      )}

      {/* Cada card abre a lista já filtrada (pedido do usuário). */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Link
          href="/financeiro?tipo=despesa"
          className={`bg-white border rounded-xl p-3 hover:bg-gray-50 transition-colors ${
            cardAtivo("despesa") ? "border-primary" : "border-gray-200"
          }`}
        >
          <div className="text-xs text-gray-500">Despesas em aberto</div>
          <div className="text-lg font-bold mt-1 text-gray-900">{formatMoeda(totalDespesaAberto._sum.valor ?? 0)}</div>
        </Link>
        <Link
          href="/financeiro?tipo=recebimento"
          className={`bg-white border rounded-xl p-3 hover:bg-gray-50 transition-colors ${
            cardAtivo("recebimento") ? "border-primary" : "border-gray-200"
          }`}
        >
          <div className="text-xs text-gray-500">Recebimentos em aberto</div>
          <div className="text-lg font-bold mt-1 text-accent">{formatMoeda(totalRecebimentoAberto._sum.valor ?? 0)}</div>
        </Link>
        <Link
          href="/financeiro?tipo=despesa&pago=conferido"
          className={`bg-blue-50 border rounded-xl p-3 hover:bg-blue-100 transition-colors ${
            cardAtivo("despesa", "conferido") ? "border-blue-500" : "border-blue-200"
          }`}
        >
          <div className="text-xs text-blue-600">Conferido — aguardando pagamento</div>
          <div className="text-lg font-bold mt-1 text-blue-700">{conferidoAguardando}</div>
        </Link>
        <Link
          href="/financeiro?tipo=despesa&situacao=vencidas"
          className={`bg-white border rounded-xl p-3 hover:bg-gray-50 transition-colors ${
            cardAtivo("despesa", undefined, "vencidas") ? "border-red-400" : "border-gray-200"
          }`}
        >
          <div className="text-xs text-gray-500">Despesas vencidas</div>
          <div className="text-lg font-bold mt-1 text-red-600">{vencidosDespesa}</div>
        </Link>
        <Link
          href="/financeiro?tipo=recebimento&situacao=vencidas"
          className={`bg-white border rounded-xl p-3 hover:bg-gray-50 transition-colors ${
            cardAtivo("recebimento", undefined, "vencidas") ? "border-red-400" : "border-gray-200"
          }`}
        >
          <div className="text-xs text-gray-500">Recebimentos vencidos</div>
          <div className="text-lg font-bold mt-1 text-red-600">{vencidosRecebimento}</div>
        </Link>
      </div>

      <div className="flex gap-2 mb-3">
        <a
          href={hrefTipo("despesa")}
          className={
            "text-xs px-3 py-1.5 rounded-lg border font-semibold " +
            (tipo === "Despesa" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 bg-white")
          }
        >
          Despesas
        </a>
        <a
          href={hrefTipo("recebimento")}
          className={
            "text-xs px-3 py-1.5 rounded-lg border font-semibold " +
            (tipo === "Recebimento" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 bg-white")
          }
        >
          Recebimentos
        </a>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="text-sm font-bold text-gray-800">
            {tipo} ({total})
          </div>
          <Link
            href="/financeiro/novo"
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
          >
            + Adicionar movimentação
          </Link>
        </div>

        <form className="flex gap-2 flex-wrap mb-3 items-center">
          {tipoParam && <input type="hidden" name="tipo" value={tipoParam} />}
          {pagoParam && <input type="hidden" name="pago" value={pagoParam} />}
          <input
            type="text"
            name="q"
            defaultValue={termo}
            placeholder="Buscar por categoria, cliente, parceiro..."
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-56 outline-none focus:border-primary"
          />
          <select
            name="categoria"
            defaultValue={categoriaParam ?? ""}
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:border-primary bg-white"
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <span className="w-px h-5 bg-gray-200 mx-1 hidden md:inline-block" />
          <label className="text-xs text-gray-500 flex items-center gap-1">
            Vencimento de
            <input
              type="date"
              name="venc_de"
              defaultValue={vencDe ?? ""}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary"
            />
          </label>
          <label className="text-xs text-gray-500 flex items-center gap-1">
            até
            <input
              type="date"
              name="venc_ate"
              defaultValue={vencAte ?? ""}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary"
            />
          </label>
          <span className="w-px h-5 bg-gray-200 mx-1 hidden md:inline-block" />
          <label className="text-xs text-gray-500 flex items-center gap-1">
            Pagamento de
            <input
              type="date"
              name="pag_de"
              defaultValue={pagDe ?? ""}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary"
            />
          </label>
          <label className="text-xs text-gray-500 flex items-center gap-1">
            até
            <input
              type="date"
              name="pag_ate"
              defaultValue={pagAte ?? ""}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary"
            />
          </label>
          <button type="submit" className="text-xs bg-white border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5">
            Filtrar
          </button>
          {(termo || categoriaParam || vencDe || vencAte || pagDe || pagAte) && (
            <a href={hrefPago(pagoParam ?? null)} className="text-xs text-gray-400 underline">
              Limpar filtros
            </a>
          )}
        </form>

        <div className="flex gap-2 mb-3 flex-wrap">
          <a
            href={hrefPago(null)}
            className={
              "text-xs px-3 py-1 rounded-full border " +
              (!pagoParam && !vencidas ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600")
            }
          >
            Em aberto
          </a>
          <a
            href={hrefPago("conferido")}
            className={
              "text-xs px-3 py-1 rounded-full border " +
              (pagoParam === "conferido" ? "bg-blue-600 text-white border-blue-600" : "border-blue-200 text-blue-600")
            }
          >
            Conferido
          </a>
          <a
            href={hrefPago("pago")}
            className={
              "text-xs px-3 py-1 rounded-full border " +
              (pagoParam === "pago" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600")
            }
          >
            {rotuloPago}
          </a>
          <a
            href={hrefPago("todas")}
            className={
              "text-xs px-3 py-1 rounded-full border " +
              (pagoParam === "todas" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600")
            }
          >
            Todas
          </a>
          {vencidas && (
            <span className="text-xs px-3 py-1 rounded-full border bg-red-600 text-white border-red-600">Vencidas</span>
          )}
        </div>

        <div className={`hidden md:grid ${COLUNAS} gap-3 px-3 py-1.5 text-[11px] text-gray-400 border-b border-gray-100 text-center`}>
          <span>Categoria</span>
          <span>Cliente (interessado)</span>
          <span>Cliente (proprietário)</span>
          <span>Parceiro</span>
          <span>Pagamento</span>
          <span>Valor</span>
          <span>Vencimento</span>
          <span>Data pagamento</span>
          <span>Descrição</span>
        </div>

        <div className="flex flex-col">
          {movimentacoes.map((m) => {
            const jaPago = m.status_pagamento === "Pago";
            const conferido = m.status_pagamento === "Conferido";
            const situacao = situacaoVencimento(m.vencimento, jaPago, DIAS_ALERTA);
            const corLinha = conferido
              ? "bg-blue-50 border border-blue-200 hover:bg-blue-100"
              : situacao === "vencido"
                ? "bg-red-50 border border-red-200 hover:bg-red-100"
                : situacao === "alerta"
                ? "bg-amber-50 border border-amber-200 hover:bg-amber-100"
                : "hover:bg-gray-50";
            const corTexto = conferido ? "text-blue-700" : situacao === "vencido" ? "text-red-700" : "text-gray-600";
            const temParcelas = (m.parcelas ?? 0) > 1;

            return (
              <Link
                key={m.id}
                href={`/financeiro/${m.id}`}
                className={`grid grid-cols-1 gap-1 ${COLUNAS} md:gap-3 md:items-center md:text-center px-3 py-2.5 rounded-lg transition-colors ${corLinha}`}
              >
                <span className={`text-xs font-medium truncate ${situacao === "vencido" ? "text-red-800" : "text-gray-800"}`}>
                  {m.categorias_financeiras.nome}
                </span>
                <span className={`text-xs truncate ${corTexto}`}>
                  {m.clientes_interessado?.nome ?? (m.clientes_proprietario || m.parceiros ? "—" : m.contraparte_nome ?? "—")}
                </span>
                <span className={`text-xs truncate ${corTexto}`}>{m.clientes_proprietario?.nome ?? "—"}</span>
                <span className={`text-xs truncate ${corTexto}`}>{m.parceiros?.nome ?? "—"}</span>
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    jaPago
                      ? "text-green-700"
                      : conferido
                        ? "text-blue-700"
                        : situacao === "vencido"
                          ? "text-red-700"
                          : situacao === "alerta"
                            ? "text-amber-700"
                            : "text-gray-500"
                  }`}
                >
                  {rotuloStatusPagamento(m.status_pagamento, m.tipo)}
                </span>
                <span className={`text-xs whitespace-nowrap ${situacao === "vencido" ? "text-red-800 font-medium" : "text-gray-700"}`}>
                  {formatMoeda(m.valor)}
                  {temParcelas && <span className="text-gray-400 font-normal"> ({m.num_parcela}/{m.parcelas})</span>}
                </span>
                <span className={`text-xs whitespace-nowrap ${corTexto}`}>{formatDataCalendario(m.vencimento)}</span>
                <span className="text-xs text-gray-500 whitespace-nowrap">{m.data_pagamento ? formatDataCalendario(m.data_pagamento) : "—"}</span>
                <span className="text-xs text-gray-500 truncate">{m.descricao ?? "—"}</span>
              </Link>
            );
          })}
          {movimentacoes.length === 0 && (
            <div className="py-6 text-center text-gray-400 text-xs">Nenhuma movimentação encontrada.</div>
          )}
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/financeiro"
          q={termo}
          extraParams={{
            tipo: tipoParam,
            pago: pagoParam,
            situacao: situacaoParam,
            categoria: categoriaParam,
            venc_de: vencDe,
            venc_ate: vencAte,
            pag_de: pagDe,
            pag_ate: pagAte
          }}
        />
      </div>
    </div>
  );
}
