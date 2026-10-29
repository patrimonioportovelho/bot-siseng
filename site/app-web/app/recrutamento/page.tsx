import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { formatDataCalendario, formatTelefone, hojeInputDate } from "@/lib/format";
import { RecrutamentoKanban, type CardRecrutamento } from "@/components/recrutamento-kanban";
import { moverCardRecrutamentoAction, definirResponsavelEtapaAction } from "./actions";
import { FUNCOES_NO_QUADRO, TIPO_MOVIMENTACAO, colunaDoParceiro } from "@/lib/recrutamento/opcoes";
import { garantirLinhasRecrutamento } from "@/lib/recrutamento/garantir";
import { buscarMetricasCorretores, diasEntre } from "@/lib/recrutamento/metricas";
import { progressoTreinamentos, type EstadoTreinamentos } from "@/lib/recrutamento/treinamentos";

export const dynamic = "force-dynamic";

// Recrutamento (29/10/2026): quadro Kanban do funil de recrutados (Lead → Em
// contato → 1ª reunião → 2ª reunião → Em treinamento) até virarem Corretor
// Estagiário / Corretor, com Saída e Sem interesse. Corretores e estagiários
// ficam no quadro com os indicadores de evolução na etiqueta.
export default async function RecrutamentoPage() {
  await requireAdminSession();
  await garantirLinhasRecrutamento();

  const [parceiros, contatos, etapas, responsaveis] = await Promise.all([
    prisma.parceiros.findMany({
      where: { funcao: { in: FUNCOES_NO_QUADRO }, status_funcao: { not: "Excluído" } },
      select: {
        id: true,
        nome: true,
        telefone: true,
        funcao: true,
        status_funcao: true,
        data_entrada: true,
        data_saida: true,
        recrutamento: {
          select: {
            etapa: true,
            etapa_atualizada_em: true,
            proxima_acao_data: true,
            proxima_acao_texto: true,
            treinamentos: true,
            responsavel: { select: { id: true, nome: true } }
          }
        }
      },
      orderBy: { nome: "asc" }
    }),
    prisma.recrutamento_atividades.groupBy({
      by: ["parceiro_id"],
      where: { tipo: { not: TIPO_MOVIMENTACAO } },
      _count: { _all: true },
      _max: { data: true }
    }),
    prisma.recrutamento_etapas.findMany({ select: { etapa: true, responsavel_id: true } }),
    prisma.parceiros.findMany({
      where: { funcao: { in: ["Administrativo", "Corretor"] }, status_funcao: "Ativo" },
      orderBy: [{ funcao: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true }
    })
  ]);

  const agora = new Date();
  const contatoPorParceiro = new Map(contatos.map((c) => [c.parceiro_id, c]));

  const comColuna = parceiros
    .map((p) => ({ p, coluna: colunaDoParceiro(p, p.recrutamento?.etapa) }))
    .filter((x): x is { p: (typeof parceiros)[number]; coluna: NonNullable<ReturnType<typeof colunaDoParceiro>> } => x.coluna !== null);

  const idsEquipe = comColuna.filter((x) => x.coluna === "estagiario" || x.coluna === "corretor").map((x) => x.p);
  const metricas = await buscarMetricasCorretores(idsEquipe.map((p) => ({ id: p.id, data_entrada: p.data_entrada })));

  const cards: CardRecrutamento[] = comColuna.map(({ p, coluna }) => {
    const r = p.recrutamento;
    const contato = contatoPorParceiro.get(p.id);
    const m = metricas.get(p.id);
    const prog = progressoTreinamentos((r?.treinamentos as EstadoTreinamentos | null) ?? null);
    return {
      id: p.id,
      nome: p.nome,
      telefone: p.telefone ? formatTelefone(p.telefone) : null,
      coluna,
      responsavelId: r?.responsavel?.id ?? null,
      responsavelNome: r?.responsavel?.nome ?? null,
      proximaAcaoData: r?.proxima_acao_data ? r.proxima_acao_data.toISOString().slice(0, 10) : null,
      proximaAcaoTexto: r?.proxima_acao_texto ?? null,
      diasNaEtapa: r ? Math.max(0, diasEntre(r.etapa_atualizada_em, agora)) : 0,
      ultimoContatoDias: contato?._max.data ? Math.max(0, diasEntre(contato._max.data, agora)) : null,
      totalContatos: contato?._count._all ?? 0,
      diasNaCasa: p.data_entrada ? Math.max(0, diasEntre(p.data_entrada, agora)) : null,
      dataSaida: p.data_saida ? formatDataCalendario(p.data_saida) : null,
      funcaoAtual: p.funcao,
      metricas: m
        ? {
            captacoes: m.captacoes,
            captacoes90d: m.captacoes90d,
            diasAtePrimeiraCaptacao: m.diasAtePrimeiraCaptacao,
            clientes: m.clientes,
            propostas: m.propostas,
            locacoes: m.locacoes,
            vendas: m.vendas
          }
        : null,
      treinamentoFeitos: prog.feitos,
      treinamentoTotal: prog.total
    };
  });

  const responsavelPorEtapa: Record<string, string | null> = {};
  for (const e of etapas) responsavelPorEtapa[e.etapa] = e.responsavel_id;

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-sm font-bold text-gray-800">Recrutamento</div>
          <div className="text-[11px] text-gray-400">
            Arraste o card para mudar de etapa. Corretor e Corretor Estagiário mostram a evolução na etiqueta.
          </div>
        </div>
        <Link
          href="/parceiros/novo?funcao=Recrutados&origem=recrutamento"
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
        >
          + Novo lead
        </Link>
      </div>

      <RecrutamentoKanban
        cards={cards}
        hoje={hojeInputDate()}
        responsaveis={responsaveis}
        responsavelPorEtapa={responsavelPorEtapa}
        moverCard={moverCardRecrutamentoAction}
        definirResponsavelEtapa={definirResponsavelEtapaAction}
      />
    </div>
  );
}
