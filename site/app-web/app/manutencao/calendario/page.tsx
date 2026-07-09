import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ManutencaoCalendario } from "@/components/manutencao-calendario";
import { AtividadesTabs } from "@/components/atividades-tabs";
import { hojePortoVelho } from "@/lib/format";
import { TIPO_ATIVIDADE_LABEL as TIPO_ATIVIDADE_LABEL_MANUTENCAO } from "@/lib/manutencao/opcoes";
import { TIPO_ATIVIDADE_LABEL as TIPO_ATIVIDADE_LABEL_GESTAO } from "@/lib/gestoes/opcoes";

export const dynamic = "force-dynamic";

// Formato do parâmetro "mes" na URL: YYYY-MM (ex.: 2026-07).
function parseMes(mes: string | undefined): { ano: number; mesIndice: number } {
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [ano, m] = mes.split("-").map(Number);
    return { ano, mesIndice: m - 1 };
  }
  const hoje = hojePortoVelho();
  return { ano: hoje.getFullYear(), mesIndice: hoje.getMonth() };
}

// Calendário compartilhado entre Manutenção e Gestões — os dois módulos têm
// quadro (Kanban) separado, mas aqui as atividades agendadas de ambos
// aparecem juntas no mesmo mês, cada uma linkando pra sua ficha de origem.
export default async function ManutencaoCalendarioPage({
  searchParams
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const { ano, mesIndice } = parseMes(mes);

  const inicioMes = new Date(ano, mesIndice, 1);
  const fimMes = new Date(ano, mesIndice + 1, 1);

  const [atividadesManutencao, atividadesGestao] = await Promise.all([
    prisma.manutencao_atividades.findMany({
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
    }),
    prisma.gestao_atividades.findMany({
      where: {
        data: { gte: inicioMes, lt: fimMes },
        gestoes: { excluido: false }
      },
      orderBy: { data: "asc" },
      include: {
        gestoes: {
          select: { id: true, imoveis: { select: { endereco: true, id_legado: true } } }
        }
      }
    })
  ]);

  const atividades = [
    ...atividadesManutencao.map((a) => ({
      id: `manutencao-${a.id}`,
      tipoLabel: TIPO_ATIVIDADE_LABEL_MANUTENCAO[a.tipo] ?? a.tipo,
      titulo: a.titulo,
      data: a.data,
      feito: a.feito,
      href: `/manutencao/${a.manutencoes.id}`,
      contexto: a.manutencoes.titulo
    })),
    ...atividadesGestao.map((a) => ({
      id: `gestao-${a.id}`,
      tipoLabel: TIPO_ATIVIDADE_LABEL_GESTAO[a.tipo] ?? a.tipo,
      titulo: a.titulo,
      data: a.data,
      feito: a.feito,
      href: `/gestoes/${a.gestoes.id}`,
      contexto: a.gestoes.imoveis.endereco ?? a.gestoes.imoveis.id_legado ?? "Gestão"
    }))
  ].sort((a, b) => a.data.getTime() - b.data.getTime());

  const mesAnterior = new Date(ano, mesIndice - 1, 1);
  const mesSeguinte = new Date(ano, mesIndice + 1, 1);
  const mesAnteriorTexto = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, "0")}`;
  const mesSeguinteTexto = `${mesSeguinte.getFullYear()}-${String(mesSeguinte.getMonth() + 1).padStart(2, "0")}`;
  const hoje = hojePortoVelho();
  const mesHojeTexto = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Atividades · Manutenção &amp; Gestões</div>
        <AtividadesTabs ativo="/manutencao/calendario" />
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
