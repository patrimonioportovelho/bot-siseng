import Link from "next/link";
import { booleanoParaResposta } from "@/lib/financiamento/avaliacao-credito";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { formatMoeda, formatTelefone, hojeInputDate } from "@/lib/format";
import { FinanciamentoEtiqueta, type DadosFin } from "@/components/financiamento-etiqueta";
import { SimulacaoHabitacional, type ItemHistoricoSimulacao } from "@/components/simulacao-habitacional";
import { gerarSimulacaoAction } from "../../simulacao-actions";
import type { EntradaSimulacao, ResultadoSimulacao } from "@/lib/financiamento/simulacao";
import {
  alternarChecklistFinanciamentoAction,
  definirStatusAndamentoAction,
  garantirEpisodiosFinanciamento,
  moverCardFinanciamentoAction,
  registrarConformidadeAction,
  registrarContatoFinanciamentoAction,
  resolverInconformidadeAction,
  salvarCampoFinanciamentoAction,
  salvarRespostaCreditoAction
} from "../../quadro-actions";
import {
  DIAS_ALERTA_VALIDADE,
  TIPO_ETAPA,
  colunaDoCard,
  diasNaColuna,
  normalizarStatusAndamento
} from "@/lib/financiamento/quadro";
import { verificacoesAutomaticas, type EstadoChecklist } from "@/lib/financiamento/conformidade";

export const dynamic = "force-dynamic";

function dinheiro(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? formatMoeda(n) : null;
}

// Etiqueta do Financiamento: tudo do negócio numa tela, com mensagem de
// WhatsApp (cliente, parceiro ou vendedor), conformidade, checklist, linha do
// tempo e salvamento automático.
export default async function EtiquetaFinanciamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requireAdminSession();
  const { id } = await params;
  await garantirEpisodiosFinanciamento();

  const [a, atividades, responsaveis, etapasResp, simulacoes] = await Promise.all([
    prisma.avaliacoes.findUnique({
      where: { id },
      include: {
        clientes: { select: { nome: true, telefone: true, renda_bruta: true, data_nascimento: true } },
        bancos: { select: { nome: true } },
        parceiros: { select: { id: true, nome: true, telefone: true } },
        avaliacoes_clientes: { include: { clientes: { select: { renda_bruta: true, data_nascimento: true } } } },
        andamentos: {
          where: { excluido: false },
          orderBy: { created_at: "desc" },
          take: 1,
          include: { imoveis: { select: { endereco: true } }, clientes: { select: { nome: true, telefone: true } } }
        },
        financiamento_acompanhamento: true
      }
    }),
    prisma.financiamento_atividades.findMany({
      where: { avaliacao_id: id },
      orderBy: { inicio: "desc" },
      take: 300,
      include: { por: { select: { nome: true } } }
    }),
    prisma.parceiros.findMany({
      where: { funcao: { in: ["Administrativo", "Corretor"] }, status_funcao: "Ativo" },
      orderBy: [{ funcao: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true }
    }),
    prisma.financiamento_etapas.findMany({ select: { coluna: true, responsavel_id: true } }),
    prisma.simulacoes_habitacionais.findMany({ where: { avaliacao_id: id }, orderBy: { created_at: "desc" }, take: 20 })
  ]);
  if (!a || a.excluido) notFound();

  const and = a.andamentos[0] ?? null;
  const coluna = colunaDoCard(a.status, and?.status_andamento ?? null);
  const acomp = a.financiamento_acompanhamento;
  const etapaAberta = atividades.find((x) => x.tipo === TIPO_ETAPA && !x.fim) ?? null;

  const rendas = [a.clientes?.renda_bruta, ...a.avaliacoes_clientes.map((v) => v.clientes.renda_bruta)];
  const rendaTotal = rendas.reduce<number>((s, r) => s + (r ? Number(r) : 0), 0);
  const validadeIso = a.data_validade ? a.data_validade.toISOString().slice(0, 10) : null;

  // Simulação habitacional (aba que aparece em "Montagem de processo"): dados do cliente já preenchidos e histórico.
  const nascimentos = [a.clientes?.data_nascimento, ...a.avaliacoes_clientes.map((v) => v.clientes.data_nascimento)].filter((x): x is Date => !!x);
  const maisVelho = nascimentos.length > 0 ? new Date(Math.min(...nascimentos.map((x) => x.getTime()))) : null;
  const nomesPor = new Map(
    (await prisma.parceiros.findMany({ where: { id: { in: simulacoes.map((x) => x.criado_por).filter((x): x is string => !!x) } }, select: { id: true, nome: true } })).map((x) => [x.id, x.nome])
  );
  const historicoSimulacoes: ItemHistoricoSimulacao[] = simulacoes.map((x) => ({
    id: x.id,
    criadoEm: x.created_at.toISOString(),
    por: x.criado_por ? (nomesPor.get(x.criado_por) ?? null) : null,
    entrada: x.entrada as unknown as EntradaSimulacao,
    resultado: x.resultado as unknown as ResultadoSimulacao
  }));

  const responsavelPorColuna: Record<string, string | null> = {};
  for (const e of etapasResp) responsavelPorColuna[e.coluna] = e.responsavel_id;

  const telCliente = a.clientes?.telefone ?? a.telefone ?? null;
  const vendedor = and?.clientes ?? null;

  const dados: DadosFin = {
    id,
    idLegado: a.id_legado,
    cliente: {
      nome: a.clientes?.nome ?? "Cliente não informado",
      telefone: telCliente,
      telefoneFormatado: telCliente ? formatTelefone(telCliente) : null
    },
    parceiro: a.parceiros ? { id: a.parceiros.id, nome: a.parceiros.nome, telefone: a.parceiros.telefone } : null,
    vendedor: vendedor ? { nome: vendedor.nome, telefone: vendedor.telefone } : null,
    banco: a.bancos?.nome ?? null,
    tipoAvaliacao: a.tipo_avaliacao,
    statusAvaliacao: a.status,
    statusAndamento: and ? normalizarStatusAndamento(and.status_andamento, a.status) : null,
    coluna,
    imovel: and?.imoveis?.endereco ?? null,
    tipoContrato: and?.tipo_contrato ?? null,
    valorAprovado: dinheiro(a.valor_aprovado),
    valorFinanciamento: dinheiro(and?.valor_financiado ?? a.valor_financiamento),
    prestacao: dinheiro(a.prestacao),
    validade: validadeIso,
    usaFgts: a.usa_fgts,
    respostasCredito: {
      credito_fgts_3_anos: booleanoParaResposta(a.credito_fgts_3_anos),
      credito_mais_compradores: booleanoParaResposta(a.credito_mais_compradores),
      credito_primeiro_imovel: booleanoParaResposta(a.credito_primeiro_imovel)
    },
    responsavelId: acomp?.responsavel_id ?? null,
    proximaAcaoData: acomp?.proxima_acao_data ? acomp.proxima_acao_data.toISOString().slice(0, 10) : null,
    proximaAcaoTexto: acomp?.proxima_acao_texto ?? null,
    notas: acomp?.notas ?? null,
    checklist: ((acomp?.checklist as EstadoChecklist | null) ?? {}) as EstadoChecklist,
    diasNaEtapa: etapaAberta ? Math.max(0, Math.floor(diasNaColuna(coluna, etapaAberta.inicio, Date.now()))) : 0,
    estimado: etapaAberta?.estimado ?? false,
    verificacoes: verificacoesAutomaticas({
      rendaTotal: rendaTotal > 0 ? rendaTotal : null,
      prestacao: a.prestacao ? Number(a.prestacao) : null,
      valorFinanciamento: and?.valor_financiado ? Number(and.valor_financiado) : a.valor_financiamento ? Number(a.valor_financiamento) : null,
      valorAvaliado: and?.valor_avaliado ? Number(and.valor_avaliado) : null,
      dataValidade: validadeIso,
      hoje: hojeInputDate(),
      diasAlertaValidade: DIAS_ALERTA_VALIDADE
    }),
    atividades: atividades.map((x) => ({
      id: x.id,
      tipo: x.tipo,
      coluna: x.coluna,
      etapa: x.etapa,
      resultado: x.resultado,
      motivo: x.motivo,
      nota: x.nota,
      inicio: x.inicio.toISOString(),
      fim: x.fim ? x.fim.toISOString() : null,
      estimado: x.estimado,
      por: x.por?.nome ?? null
    }))
  };

  return (
    <div>
      <Topbar />
      <Link href="/financiamento" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Financiamento
      </Link>
      <FinanciamentoEtiqueta
        d={dados}
        responsaveis={responsaveis}
        remetenteLogado={{ id: sessao.parceiroId, primeiroNome: (sessao.nome ?? "").trim().split(/\s+/)[0] ?? "" }}
        responsavelPorColuna={responsavelPorColuna}
        simulacao={
          <SimulacaoHabitacional
            avaliacaoId={id}
            prefill={{
              valorCompra: and?.valor_venda ? Number(and.valor_venda) : and?.valor_avaliado ? Number(and.valor_avaliado) : null,
              renda: rendaTotal > 0 ? rendaTotal : null,
              nascimento: maisVelho ? maisVelho.toISOString().slice(0, 10) : null,
              municipio: "Porto Velho",
              uf: "RO"
            }}
            respostasCredito={dados.respostasCredito}
            historico={historicoSimulacoes}
            gerar={gerarSimulacaoAction}
          />
        }
        acoes={{
          moverCard: moverCardFinanciamentoAction,
          definirStatusAndamento: definirStatusAndamentoAction,
          salvarCampo: salvarCampoFinanciamentoAction,
          salvarRespostaCredito: salvarRespostaCreditoAction,
          alternarChecklist: alternarChecklistFinanciamentoAction,
          registrarConformidade: registrarConformidadeAction,
          resolverInconformidade: resolverInconformidadeAction,
          registrarContato: registrarContatoFinanciamentoAction
        }}
      />
    </div>
  );
}
