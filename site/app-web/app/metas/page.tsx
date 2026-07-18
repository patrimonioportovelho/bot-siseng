import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { calcularAlcancado, avaliarMeta } from "@/lib/metas/calculo";
import { tipoMetaOpcao } from "@/lib/metas/opcoes";
import { formatDataCalendario } from "@/lib/format";

export const dynamic = "force-dynamic";

const SITUACAO_ESTILO: Record<string, string> = {
  concluida: "bg-green-50 text-green-700 border-green-200",
  no_prazo: "bg-blue-50 text-blue-700 border-blue-200",
  atencao: "bg-amber-50 text-amber-700 border-amber-200",
  atrasada: "bg-red-50 text-red-700 border-red-200",
  vencida: "bg-gray-100 text-gray-600 border-gray-200"
};

const SITUACAO_LABEL: Record<string, string> = {
  concluida: "Concluída",
  no_prazo: "No prazo",
  atencao: "Atenção",
  atrasada: "Atrasada",
  vencida: "Vencida"
};

export default async function MetasPage({
  searchParams
}: {
  searchParams: Promise<{ salvo?: string; excluido?: string }>;
}) {
  const { salvo, excluido } = await searchParams;

  const metas = await prisma.metas.findMany({
    orderBy: { periodo_inicio: "desc" },
    take: 200,
    include: { parceiros: true, lojas: true }
  });

  const metasComProgresso = await Promise.all(
    metas.map(async (m) => {
      const alcancado = await calcularAlcancado(m);
      return { meta: m, avaliacao: avaliarMeta(m, alcancado) };
    })
  );

  return (
    <div>
      <Topbar />

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Meta salva com sucesso.
        </div>
      )}
      {excluido === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Meta apagada com sucesso.
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-bold text-gray-800">Metas ({metas.length})</div>
          <p className="text-xs text-gray-500 mt-0.5">
            Mensais, semestrais ou anuais — gerais (todos os corretores juntos) ou individuais. O progresso é
            calculado sozinho a partir dos cadastros reais do sistema.
          </p>
        </div>
        <Link
          href="/metas/novo"
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold hover:opacity-90 whitespace-nowrap"
        >
          + Nova meta
        </Link>
      </div>

      {metas.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
          Nenhuma meta cadastrada ainda.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {metasComProgresso.map(({ meta, avaliacao }) => {
          const opcao = tipoMetaOpcao(meta.tipo_meta);
          return (
            <Link
              key={meta.id}
              href={`/metas/${meta.id}`}
              className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
                <div className="text-sm font-bold text-gray-800">{opcao?.label ?? meta.tipo_meta}</div>
                <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${SITUACAO_ESTILO[avaliacao.situacao]}`}>
                  {SITUACAO_LABEL[avaliacao.situacao]}
                </span>
              </div>
              <div className="text-xs text-gray-500 mb-2">
                {meta.parceiros?.nome ?? "Geral (todos)"}
                {meta.lojas?.nome && ` · ${meta.lojas.nome}`} · {formatDataCalendario(meta.periodo_inicio)} –{" "}
                {formatDataCalendario(meta.periodo_fim)}
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-1.5 overflow-hidden">
                <div
                  className={`h-2 rounded-full ${avaliacao.situacao === "concluida" ? "bg-green-500" : avaliacao.situacao === "atrasada" ? "bg-red-500" : avaliacao.situacao === "atencao" ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, avaliacao.percentual)}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500">{avaliacao.percentual}% — {avaliacao.mensagem}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
