import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ManutencaoCalendario } from "@/components/manutencao-calendario";

export const dynamic = "force-dynamic";

// Formato do parâmetro "mes" na URL: YYYY-MM (ex.: 2026-07).
function parseMes(mes: string | undefined): { ano: number; mesIndice: number } {
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [ano, m] = mes.split("-").map(Number);
    return { ano, mesIndice: m - 1 };
  }
  const hoje = new Date();
  return { ano: hoje.getFullYear(), mesIndice: hoje.getMonth() };
}

export default async function ManutencaoCalendarioPage({
  searchParams
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const { ano, mesIndice } = parseMes(mes);

  const inicioMes = new Date(ano, mesIndice, 1);
  const fimMes = new Date(ano, mesIndice + 1, 1);

  const atividades = await prisma.manutencao_atividades.findMany({
    where: {
      data: { gte: inicioMes, lt: fimMes },
      manutencoes: { excluido: false }
    },
    orderBy: { data: "asc" },
    include: {
      manutencoes: {
        select: { id: true, titulo: true, imoveis: { select: { endereco: true, id_legado: true } } }
      }
    }
  });

  const mesAnterior = new Date(ano, mesIndice - 1, 1);
  const mesSeguinte = new Date(ano, mesIndice + 1, 1);
  const mesAtualTexto = `${ano}-${String(mesIndice + 1).padStart(2, "0")}`;
  const mesAnteriorTexto = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, "0")}`;
  const mesSeguinteTexto = `${mesSeguinte.getFullYear()}-${String(mesSeguinte.getMonth() + 1).padStart(2, "0")}`;
  const hoje = new Date();
  const mesHojeTexto = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Manutenção · Administração</div>
        <div className="flex gap-2">
          <Link href="/manutencao" className="text-xs border border-gray-300 text-gray-600 bg-white rounded-lg px-3 py-1.5 font-semibold">
            Quadro
          </Link>
          <Link href="/manutencao/calendario" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold">
            Calendário
          </Link>
          <Link href="/manutencao/painel" className="text-xs border border-gray-300 text-gray-600 bg-white rounded-lg px-3 py-1.5 font-semibold">
            Painel
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-2">
          <Link href={`/manutencao/calendario?mes=${mesAnteriorTexto}`} className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5">
            ← Anterior
          </Link>
          <Link href={`/manutencao/calendario?mes=${mesHojeTexto}`} className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5">
            Hoje
          </Link>
          <Link href={`/manutencao/calendario?mes=${mesSeguinteTexto}`} className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5">
            Próximo →
          </Link>
        </div>
        <div className="text-sm font-bold text-gray-800 capitalize">
          {inicioMes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </div>
      </div>

      <ManutencaoCalendario ano={ano} mesIndice={mesIndice} atividades={atividades} />
    </div>
  );
}
