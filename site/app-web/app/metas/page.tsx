import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatData } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MetasPage() {
  const metas = await prisma.metas.findMany({
    orderBy: { periodo_inicio: "desc" },
    take: 200,
    include: { parceiros: true, lojas: true }
  });

  return (
    <div>
      <Topbar />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Metas ({metas.length})</div>
        <p className="text-xs text-gray-500 mb-3">
          Nenhuma meta foi cadastrada ainda. Assim que forem criadas (por parceiro ou por loja), elas
          aparecem aqui com o período e o valor alvo.
        </p>

        {metas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="font-normal py-1.5 border-b border-gray-100">Parceiro</th>
                  <th className="font-normal py-1.5 border-b border-gray-100">Loja</th>
                  <th className="font-normal py-1.5 border-b border-gray-100">Tipo</th>
                  <th className="font-normal py-1.5 border-b border-gray-100">Período</th>
                  <th className="font-normal py-1.5 border-b border-gray-100 text-right">Alvo</th>
                </tr>
              </thead>
              <tbody>
                {metas.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 border-b border-gray-50">{m.parceiros?.nome ?? "—"}</td>
                    <td className="py-2 border-b border-gray-50">{m.lojas?.nome ?? "—"}</td>
                    <td className="py-2 border-b border-gray-50">{m.tipo_meta}</td>
                    <td className="py-2 border-b border-gray-50">
                      {formatData(m.periodo_inicio)} – {formatData(m.periodo_fim)}
                    </td>
                    <td className="py-2 border-b border-gray-50 text-right">
                      {m.unidade === "valor" ? formatMoeda(m.valor_meta) : `${m.valor_meta} ${m.unidade}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
