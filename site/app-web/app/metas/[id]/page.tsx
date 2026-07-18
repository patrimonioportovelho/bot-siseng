import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { MetaForm } from "@/components/meta-form";
import { FUNCOES_CORRETOR } from "@/lib/transacoes/opcoes";
import { calcularAlcancado, avaliarMeta } from "@/lib/metas/calculo";
import { tipoMetaOpcao } from "@/lib/metas/opcoes";
import { formatDataCalendario } from "@/lib/format";
import { atualizarMetaAction, apagarMetaAction } from "../actions";

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

export default async function MetaDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;
  const session = await getAdminSession();

  const [meta, corretores, lojas] = await Promise.all([
    prisma.metas.findUnique({ where: { id }, include: { parceiros: true, lojas: true } }),
    prisma.parceiros.findMany({
      where: { funcao: { in: FUNCOES_CORRETOR }, status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, funcao: true }
    }),
    prisma.lojas.findMany({ orderBy: { nome: "asc" } })
  ]);

  if (!meta) notFound();

  const alcancado = await calcularAlcancado(meta);
  const avaliacao = avaliarMeta(meta, alcancado);
  const opcao = tipoMetaOpcao(meta.tipo_meta);

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3">
        <Link href="/metas" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Metas
        </Link>
        {session?.isAdm && (
          <form action={apagarMetaAction}>
            <input type="hidden" name="metaId" value={meta.id} />
            <button
              type="submit"
              className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50"
            >
              Apagar meta
            </button>
          </form>
        )}
      </div>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Meta salva com sucesso.
        </div>
      )}

      <div className="text-sm font-bold text-gray-800 mb-1">{opcao?.label ?? meta.tipo_meta}</div>
      <div className="text-xs text-gray-500 mb-4">
        {meta.parceiros?.nome ?? "Meta Geral (todos os corretores)"}
        {meta.lojas?.nome && ` · ${meta.lojas.nome}`} · {formatDataCalendario(meta.periodo_inicio)} –{" "}
        {formatDataCalendario(meta.periodo_fim)}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold text-gray-800">Progresso</div>
          <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${SITUACAO_ESTILO[avaliacao.situacao]}`}>
            {SITUACAO_LABEL[avaliacao.situacao]}
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2 overflow-hidden">
          <div
            className={`h-2.5 rounded-full ${avaliacao.situacao === "concluida" ? "bg-green-500" : avaliacao.situacao === "atrasada" ? "bg-red-500" : avaliacao.situacao === "atencao" ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${Math.min(100, avaliacao.percentual)}%` }}
          />
        </div>
        <p className="text-xs text-gray-600 mb-1">{avaliacao.percentual}% da meta — {avaliacao.mensagem}</p>
        {meta.observacao && (
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mt-2">
            {meta.observacao}
          </p>
        )}
      </div>

      <MetaForm meta={meta} corretores={corretores} lojas={lojas} action={atualizarMetaAction} />
    </div>
  );
}
