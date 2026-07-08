import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { formatMoeda } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const [porTipo, honorariosPorParceiro] = await Promise.all([
    prisma.transacoes.groupBy({
      by: ["tipo"],
      _count: { _all: true },
      _sum: { valor_transacao: true }
    }),
    prisma.pagamentos.groupBy({
      by: ["parceiro_id"],
      _sum: { valor_parceiro: true },
      orderBy: { _sum: { valor_parceiro: "desc" } },
      take: 15
    })
  ]);

  const parceiroIds = honorariosPorParceiro.map((h) => h.parceiro_id);
  const parceiros = await prisma.parceiros.findMany({
    where: { id: { in: parceiroIds } },
    select: { id: true, nome: true }
  });
  const nomePorId = new Map(parceiros.map((p) => [p.id, p.nome]));

  return (
    <div>
      <Topbar />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Transações por tipo</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="font-normal py-1.5 border-b border-gray-100">Tipo</th>
                  <th className="font-normal py-1.5 border-b border-gray-100 text-right">Quantidade</th>
                  <th className="font-normal py-1.5 border-b border-gray-100 text-right">Valor total</th>
                </tr>
              </thead>
              <tbody>
                {porTipo.map((t) => (
                  <tr key={t.tipo}>
                    <td className="py-2 border-b border-gray-50">{t.tipo}</td>
                    <td className="py-2 border-b border-gray-50 text-right">{t._count._all}</td>
                    <td className="py-2 border-b border-gray-50 text-right">{formatMoeda(t._sum.valor_transacao ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Honorários por parceiro (top 15)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="font-normal py-1.5 border-b border-gray-100">Parceiro</th>
                  <th className="font-normal py-1.5 border-b border-gray-100 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {honorariosPorParceiro.map((h) => (
                  <tr key={h.parceiro_id}>
                    <td className="py-2 border-b border-gray-50">{nomePorId.get(h.parceiro_id) ?? "—"}</td>
                    <td className="py-2 border-b border-gray-50 text-right">{formatMoeda(h._sum.valor_parceiro ?? 0)}</td>
                  </tr>
                ))}
                {honorariosPorParceiro.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-6 text-center text-gray-400">
                      Nenhum pagamento encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
