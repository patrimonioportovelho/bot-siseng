import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Pagination } from "@/components/pagination";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatData, situacaoVencimento } from "@/lib/format";

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
    q?: string;
    page?: string;
    categoria?: string;
    de?: string;
    ate?: string;
  }>;
}) {
  const { tipo: tipoParam, pago: pagoParam, q, page: pageParam, categoria: categoriaParam, de, ate } = await searchParams;
  const tipo = tipoParam === "recebimento" ? "Recebimento" : "Despesa";
  const termo = (q ?? "").trim();
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const vencimentoFiltro: { gte?: Date; lte?: Date } = {};
  if (de) {
    const d = new Date(de + "T00:00:00");
    if (!Number.isNaN(d.getTime())) vencimentoFiltro.gte = d;
  }
  if (ate) {
    const d = new Date(ate + "T00:00:00");
    if (!Number.isNaN(d.getTime())) vencimentoFiltro.lte = d;
  }

  const where = {
    tipo,
    ...(categoriaParam ? { categoria_id: categoriaParam } : {}),
    ...(vencimentoFiltro.gte || vencimentoFiltro.lte ? { vencimento: vencimentoFiltro } : {}),
    ...(pagoParam === "sim" ? { pago: true } : pagoParam === "todas" ? {} : { pago: false }),
    ...(termo
      ? {
          OR: [
            { descricao: { contains: termo, mode: "insensitive" as const } },
            { contraparte_nome: { contains: termo, mode: "insensitive" as const } },
            { clientes_interessado: { nome: { contains: termo, mode: "insensitive" as const } } },
            { clientes_proprietario: { nome: { contains: termo, mode: "insensitive" as const } } },
            { parceiros: { nome: { contains: termo, mode: "insensitive" as const } } },
            { categorias_financeiras: { nome: { contains: termo, mode: "insensitive" as const } } }
          ]
        }
      : {})
  };

  const [movimentacoes, total, totalDespesaAberto, totalRecebimentoAberto, vencidosDespesa, vencidosRecebimento, categorias] =
    await Promise.all([
      prisma.movimentacoes.findMany({
        where,
        orderBy: pagoParam === "sim" ? [{ data_pagamento: "desc" }] : [{ vencimento: "asc" }],
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
      prisma.movimentacoes.aggregate({ _sum: { valor: true }, where: { tipo: "Despesa", pago: false } }),
      prisma.movimentacoes.aggregate({ _sum: { valor: true }, where: { tipo: "Recebimento", pago: false } }),
      prisma.movimentacoes.count({ where: { tipo: "Despesa", pago: false, vencimento: { lt: hoje } } }),
      prisma.movimentacoes.count({ where: { tipo: "Recebimento", pago: false, vencimento: { lt: hoje } } }),
      prisma.categorias_financeiras.findMany({ where: { tipo }, orderBy: { nome: "asc" } })
    ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rotuloPago = tipo === "Despesa" ? "Pago" : "Recebido";
  const rotuloPendente = tipo === "Despesa" ? "Pendente" : "Não recebido";

  // Filtros que precisam sobreviver tanto à troca de aba Despesa/Recebimento
  // quanto à paginação e à troca de pílula Em aberto/Pago/Todas — exceto
  // categoria, que é limpa ao trocar de tipo (categoria de Despesa não
  // existe na lista de Recebimento, e vice-versa).
  function hrefTipo(t: "despesa" | "recebimento") {
    const params = new URLSearchParams();
    params.set("tipo", t);
    if (pagoParam) params.set("pago", pagoParam);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    return `/financeiro?${params.toString()}`;
  }

  function hrefPago(p: string | null) {
    const params = new URLSearchParams();
    if (tipoParam) params.set("tipo", tipoParam);
    if (p) params.set("pago", p);
    if (categoriaParam) params.set("categoria", categoriaParam);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    return `/financeiro?${params.toString()}`;
  }

  return (
    <div>
      <Topbar />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Despesas em aberto</div>
          <div className="text-lg font-bold mt-1 text-gray-900">{formatMoeda(totalDespesaAberto._sum.valor ?? 0)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Recebimentos em aberto</div>
          <div className="text-lg font-bold mt-1 text-accent">{formatMoeda(totalRecebimentoAberto._sum.valor ?? 0)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Despesas vencidas</div>
          <div className="text-lg font-bold mt-1 text-red-600">{vencidosDespesa}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Recebimentos vencidos</div>
          <div className="text-lg font-bold mt-1 text-red-600">{vencidosRecebimento}</div>
        </div>
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
          <label className="text-xs text-gray-500 flex items-center gap-1">
            De
            <input
              type="date"
              name="de"
              defaultValue={de ?? ""}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary"
            />
          </label>
          <label className="text-xs text-gray-500 flex items-center gap-1">
            Até
            <input
              type="date"
              name="ate"
              defaultValue={ate ?? ""}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary"
            />
          </label>
          <button type="submit" className="text-xs bg-white border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5">
            Filtrar
          </button>
          {(termo || categoriaParam || de || ate) && (
            <a href={hrefPago(pagoParam ?? null)} className="text-xs text-gray-400 underline">
              Limpar filtros
            </a>
          )}
        </form>

        <div className="flex gap-2 mb-3">
          <a
            href={hrefPago(null)}
            className={
              "text-xs px-3 py-1 rounded-full border " +
              (!pagoParam ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600")
            }
          >
            Em aberto
          </a>
          <a
            href={hrefPago("sim")}
            className={
              "text-xs px-3 py-1 rounded-full border " +
              (pagoParam === "sim" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600")
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
            const situacao = situacaoVencimento(m.vencimento, m.pago, DIAS_ALERTA);
            const corLinha =
              situacao === "vencido"
                ? "bg-red-50 border border-red-200 hover:bg-red-100"
                : situacao === "alerta"
                ? "bg-amber-50 border border-amber-200 hover:bg-amber-100"
                : "hover:bg-gray-50";
            const corTexto = situacao === "vencido" ? "text-red-700" : "text-gray-600";
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
                  {m.clientes_interessado?.nome ?? (m.clientes_proprietario ? "—" : m.contraparte_nome ?? "—")}
                </span>
                <span className={`text-xs truncate ${corTexto}`}>{m.clientes_proprietario?.nome ?? "—"}</span>
                <span className={`text-xs truncate ${corTexto}`}>{m.parceiros?.nome ?? "—"}</span>
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    m.pago ? "text-green-700" : situacao === "vencido" ? "text-red-700" : situacao === "alerta" ? "text-amber-700" : "text-gray-500"
                  }`}
                >
                  {m.pago ? rotuloPago : rotuloPendente}
                </span>
                <span className={`text-xs whitespace-nowrap ${situacao === "vencido" ? "text-red-800 font-medium" : "text-gray-700"}`}>
                  {formatMoeda(m.valor)}
                  {temParcelas && <span className="text-gray-400 font-normal"> ({m.num_parcela}/{m.parcelas})</span>}
                </span>
                <span className={`text-xs whitespace-nowrap ${corTexto}`}>{formatData(m.vencimento)}</span>
                <span className="text-xs text-gray-500 whitespace-nowrap">{m.data_pagamento ? formatData(m.data_pagamento) : "—"}</span>
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
          extraParams={{ tipo: tipoParam, pago: pagoParam, categoria: categoriaParam, de, ate }}
        />
      </div>
    </div>
  );
}
