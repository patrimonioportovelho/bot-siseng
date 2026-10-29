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
import { presencaTurma, type EstadoTreinamentos } from "@/lib/recrutamento/treinamentos";
import { calcularFollowups, dataReferenciaFollowup, followupVencido, type EstadoFollowups } from "@/lib/recrutamento/followup";

export const dynamic = "force-dynamic";

// Recrutamento: quadro Kanban do funil de recrutados (Lead → Em contato → 1ª
// reunião → 2ª reunião → Decisão e documentação → Em treinamento) até virarem
// Corretor Estagiário / Corretor (acolhida), com Saída e Sem interesse.
// Corretores e estagiários ficam no quadro com os indicadores de evolução.
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
        created_at: true,
        recrutamento: {
          select: {
            etapa: true,
            etapa_atualizada_em: true,
            proxima_acao_data: true,
            proxima_acao_texto: true,
            treinamentos: true,
            canal: true,
            motivo_desistencia: true,
            aprovacao_broker_em: true,
            reuniao1_data: true,
            reuniao1_status: true,
            reuniao2_data: true,
            reuniao2_status: true,
            followups: true,
            turma: { select: { nome: true } },
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
  const hoje = hojeInputDate();
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
    const pres = presencaTurma((r?.treinamentos as EstadoTreinamentos | null) ?? null);

    // Cadência de follow-up só vale em 1ª reunião / 2ª reunião / Decisão.
    let followup: string | null = null;
    if (r && (coluna === "1ª reunião" || coluna === "2ª reunião" || coluna === "Decisão e documentação")) {
      const passos = calcularFollowups(dataReferenciaFollowup(r), r.followups as EstadoFollowups | null, hoje);
      const vencido = followupVencido(passos);
      if (vencido) followup = `${vencido.titulo.split(" — ")[0]} (${vencido.atrasoDias} dia(s))`;
    }
    const faltou = r?.reuniao1_status === "Não compareceu" || r?.reuniao2_status === "Não compareceu";

    return {
      id: p.id,
      nome: p.nome,
      telefone: p.telefone ? formatTelefone(p.telefone) : null,
      coluna,
      canal: r?.canal ?? null,
      responsavelId: r?.responsavel?.id ?? null,
      responsavelNome: r?.responsavel?.nome ?? null,
      proximaAcaoData: r?.proxima_acao_data ? r.proxima_acao_data.toISOString().slice(0, 10) : null,
      proximaAcaoTexto: r?.proxima_acao_texto ?? null,
      diasNaEtapa: r ? Math.max(0, diasEntre(r.etapa_atualizada_em, agora)) : 0,
      idadeHoras: Math.max(0, (agora.getTime() - p.created_at.getTime()) / 3600000),
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
      presencasFeitas: pres.feitas,
      presencasTotal: pres.total,
      turmaNome: r?.turma?.nome ?? null,
      followupVencido: followup,
      faltaSemMotivo: !!faltou && !r?.motivo_desistencia,
      motivoDesistencia: r?.motivo_desistencia ?? null,
      aprovadoBroker: !!r?.aprovacao_broker_em
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
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/recrutamento/indicadores"
            className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold text-gray-600 whitespace-nowrap"
          >
            Indicadores
          </Link>
          <Link
            href="/recrutamento/turmas"
            className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold text-gray-600 whitespace-nowrap"
          >
            Turmas
          </Link>
          <Link
            href="/parceiros/novo?funcao=Recrutados&origem=recrutamento"
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
          >
            + Novo lead
          </Link>
        </div>
      </div>

      <RecrutamentoKanban
        cards={cards}
        hoje={hoje}
        responsaveis={responsaveis}
        responsavelPorEtapa={responsavelPorEtapa}
        moverCard={moverCardRecrutamentoAction}
        definirResponsavelEtapa={definirResponsavelEtapaAction}
      />
    </div>
  );
}
