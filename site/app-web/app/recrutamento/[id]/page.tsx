import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { formatData, formatMoeda, formatTelefone, hojeInputDate } from "@/lib/format";
import { RecrutamentoEtiqueta, type DadosEtiqueta } from "@/components/recrutamento-etiqueta";
import {
  alternarFollowupAction,
  alternarTreinamentoAction,
  moverCardRecrutamentoAction,
  registrarAtividadeRecrutamentoAction,
  salvarCampoRecrutamentoAction,
  salvarDiagnosticoAction
} from "../actions";
import { FUNCOES_NO_QUADRO, colunaDoParceiro } from "@/lib/recrutamento/opcoes";
import { buscarMetricasCorretores, diasEntre } from "@/lib/recrutamento/metricas";
import type { EstadoTreinamentos } from "@/lib/recrutamento/treinamentos";
import { calcularFollowups, dataReferenciaFollowup, type EstadoFollowups } from "@/lib/recrutamento/followup";

export const dynamic = "force-dynamic";

function dataIso(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : null;
}

// Etiqueta de Recrutamento: tudo da pessoa numa tela, com salvamento
// automático (sem botão Salvar e sem recarregar a página).
export default async function EtiquetaRecrutamentoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSession();
  const { id } = await params;

  const parceiro = await prisma.parceiros.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      telefone: true,
      email: true,
      funcao: true,
      status_funcao: true,
      link_drive: true,
      data_entrada: true,
      data_saida: true
    }
  });
  if (!parceiro || !FUNCOES_NO_QUADRO.includes(parceiro.funcao)) notFound();

  // Garante a linha de acompanhamento (idempotente).
  await prisma.recrutamento.upsert({ where: { parceiro_id: id }, create: { parceiro_id: id }, update: {} });

  const [r, atividades, responsaveis, turmas] = await Promise.all([
    prisma.recrutamento.findUniqueOrThrow({ where: { parceiro_id: id } }),
    prisma.recrutamento_atividades.findMany({
      where: { parceiro_id: id },
      orderBy: { data: "desc" },
      take: 200,
      include: { por: { select: { nome: true } } }
    }),
    prisma.parceiros.findMany({
      where: { funcao: { in: ["Administrativo", "Corretor"] }, status_funcao: "Ativo" },
      orderBy: [{ funcao: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true }
    }),
    prisma.recrutamento_turmas.findMany({ orderBy: { inicio: "asc" }, select: { id: true, nome: true, inicio: true, acolhida: true } })
  ]);

  const coluna = colunaDoParceiro(parceiro, r.etapa);
  if (!coluna) notFound();

  const mostrarMetricas = ["estagiario", "corretor", "saida"].includes(coluna);
  const metricasMap = mostrarMetricas
    ? await buscarMetricasCorretores([{ id, data_entrada: parceiro.data_entrada }])
    : null;
  const m = metricasMap?.get(id) ?? null;

  const passos = calcularFollowups(dataReferenciaFollowup(r), r.followups as EstadoFollowups | null, hojeInputDate());

  const dados: DadosEtiqueta = {
    id,
    nome: parceiro.nome,
    telefone: parceiro.telefone ? formatTelefone(parceiro.telefone) : null,
    telefoneDigitos: parceiro.telefone ? parceiro.telefone.replace(/\D/g, "") : null,
    email: parceiro.email,
    funcao: parceiro.funcao,
    statusFuncao: parceiro.status_funcao,
    coluna,
    linkDrive: parceiro.link_drive,
    canal: r.canal,
    responsavelId: r.responsavel_id,
    proximaAcaoData: dataIso(r.proxima_acao_data),
    proximaAcaoTexto: r.proxima_acao_texto,
    reuniao1: { data: dataIso(r.reuniao1_data), status: r.reuniao1_status, notas: r.reuniao1_notas },
    reuniao2: { data: dataIso(r.reuniao2_data), status: r.reuniao2_status, notas: r.reuniao2_notas },
    aprovacaoBrokerEm: dataIso(r.aprovacao_broker_em),
    interesse: r.interesse,
    motivoDesistencia: r.motivo_desistencia,
    motivoObs: r.motivo_obs,
    diagnostico: ((r.diagnostico as Record<string, string> | null) ?? {}) as Record<string, string>,
    followups: passos.map((p) => ({ chave: p.chave, titulo: p.titulo, vence: p.vence, feito: p.feito, atrasoDias: p.atrasoDias })),
    turmaId: r.turma_id,
    ttiStatus: r.tti_status,
    creciStatus: r.creci_status,
    inicioTreinamento: dataIso(r.inicio_treinamento),
    treinamentos: ((r.treinamentos as EstadoTreinamentos | null) ?? {}) as EstadoTreinamentos,
    acolhidaEm: dataIso(r.acolhida_em),
    notas: r.notas,
    dataEntrada: dataIso(parceiro.data_entrada),
    diasNaCasa: parceiro.data_entrada ? Math.max(0, diasEntre(parceiro.data_entrada, new Date())) : null,
    atividades: atividades.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      resultado: a.resultado,
      nota: a.nota,
      data: a.data.toISOString(),
      por: a.por?.nome ?? null
    })),
    mostrarMetricas,
    metricas: m
      ? {
          captacoes: m.captacoes,
          captacoes90d: m.captacoes90d,
          diasAtePrimeiraCaptacao: m.diasAtePrimeiraCaptacao,
          clientes: m.clientes,
          propostas: m.propostas,
          locacoes: m.locacoes,
          vendas: m.vendas,
          administracoes: m.administracoes,
          avaliacoes: m.avaliacoes,
          gestoes: m.gestoes,
          honorarioRecebido: formatMoeda(m.honorarioRecebido),
          ultimoAcessoPortal: m.ultimoAcessoPortal ? formatData(m.ultimoAcessoPortal) : null
        }
      : null
  };

  return (
    <div>
      <Topbar />
      <Link href="/recrutamento" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Recrutamento
      </Link>
      <RecrutamentoEtiqueta
        d={dados}
        responsaveis={responsaveis}
        turmas={turmas.map((t) => ({ id: t.id, nome: t.nome, inicio: dataIso(t.inicio)!, acolhida: dataIso(t.acolhida) }))}
        acoes={{
          moverCard: moverCardRecrutamentoAction,
          salvarCampo: salvarCampoRecrutamentoAction,
          alternarTreinamento: alternarTreinamentoAction,
          alternarFollowup: alternarFollowupAction,
          salvarDiagnostico: salvarDiagnosticoAction,
          registrarAtividade: registrarAtividadeRecrutamentoAction
        }}
      />
    </div>
  );
}
