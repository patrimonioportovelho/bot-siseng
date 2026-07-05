import { Topbar } from "@/components/topbar";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatData, statusTone } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function TransacoesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string; tipo?: string }>;
}) {
  const { q, page: pageParam, tipo } = await searchParams;
  const termo = (q ?? "").trim();
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const where = {
    ...(tipo ? { tipo } : {}),
    ...(termo
      ? {
          OR: [
            { imoveis: { endereco: { contains: termo, mode: "insensitive" as const } } },
            { clientes_transacoes_cliente_idToclientes: { nome: { contains: termo, mode: "insensitive" as const } } }
          ]
        }
      : {})
  };

  const [transacoes, total] = await Promise.all([
    prisma.transacoes.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        imoveis: true,
        clientes_transacoes_cliente_idToclientes: true
      }
    }),
    prisma.transacoes.count({ where })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <Topbar />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-800">Transações ({total})</div>
          <form className="flex gap-2">
            {tipo && <input type="hidden" name="tipo" value={tipo} />}
            <input
              type="text"
              name="q"
              defaultValue={termo}
              placeholder="Buscar por imóvel ou cliente..."
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-64 outline-none focus:border-primary"
            />
            <button type="submit" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5">
              Buscar
            </button>
          </form>
        </div>

        <div className="flex gap-2 mb-3">
          <a
            href="/transacoes"
            className={"text-xs px-3 py-1 rounded-full border " + (!tipo ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600")}
          >
            Todas
          </a>
          <a
            href="/transacoes?tipo=Loca%C3%A7%C3%A3o"
            className={"text-xs px-3 py-1 rounded-full border " + (tipo === "Locação" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600")}
          >
            Locação
          </a>
          <a
            href="/transacoes?tipo=Compra+e+Venda"
            className={"text-xs px-3 py-1 rounded-full border " + (tipo === "Compra e Venda" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600")}
          >
            Compra e Venda
          </a>
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-normal py-1.5 border-b border-gray-100">Imóvel</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Cliente</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Tipo</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Status</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Assinatura</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {transacoes.map((t) => (
              <tr key={t.id}>
                <td className="py-2 border-b border-gray-50">{t.imoveis?.endereco ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">
                  {t.clientes_transacoes_cliente_idToclientes?.nome ?? "—"}
                </td>
                <td className="py-2 border-b border-gray-50">{t.tipo}</td>
                <td className="py-2 border-b border-gray-50">
                  <StatusBadge status={t.status ?? "—"} tone={statusTone(t.status)} />
                </td>
                <td className="py-2 border-b border-gray-50">{formatData(t.data_assinatura)}</td>
                <td className="py-2 border-b border-gray-50 text-right">{formatMoeda(t.valor_transacao)}</td>
              </tr>
            ))}
            {transacoes.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-400">
                  Nenhuma transação encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <Pagination page={page} totalPages={totalPages} basePath="/transacoes" q={termo} />
      </div>
    </div>
  );
}
