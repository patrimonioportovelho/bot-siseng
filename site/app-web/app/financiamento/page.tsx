import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { formatTelefone, hojeInputDate } from "@/lib/format";
import { lojasSelecionadas, whereLojaFiltroParceiro } from "@/lib/lojas/filtro";
import { FinanciamentoKanban, type CardFinanciamento } from "@/components/financiamento-kanban";
import { definirResponsavelColunaFinAction, garantirEpisodiosFinanciamento, moverCardFinanciamentoAction } from "./quadro-actions";
import {
  DIAS_ALERTA_VALIDADE,
  TIPO_CONTATO_FIN,
  TIPO_ETAPA,
  TIPO_INCONFORMIDADE,
  colunaDoCard,
  normalizarStatusAndamento
} from "@/lib/financiamento/quadro";

export const dynamic = "force-dynamic";

const DIA_MS = 86400000;

// Financiamento em Kanban (30/10/2026): do crédito (Consulta de CPF → Montagem
// → Aprovado) ao processo (Documentação → Engenharia → Conformidade → Comitê →
// Contrato → Registro) até Concluído. Cada mudança de etapa vira uma atividade
// com tempo (ver /financiamento/relatorio). A lista antiga continua em
// /financiamento/lista.
export default async function FinanciamentoQuadroPage() {
  await requireAdminSession();
  await garantirEpisodiosFinanciamento();
  const lojasFiltro = await lojasSelecionadas();

  const [avaliacoes, contatos, etapas, responsaveis] = await Promise.all([
    prisma.avaliacoes.findMany({
      where: { excluido: false, AND: [whereLojaFiltroParceiro(lojasFiltro)] },
      select: {
        id: true,
        id_legado: true,
        status: true,
        tipo_avaliacao: true,
        telefone: true,
        data_validade: true,
        valor_aprovado: true,
        valor_financiamento: true,
        created_at: true,
        clientes: { select: { nome: true, telefone: true } },
        bancos: { select: { nome: true } },
        parceiros: { select: { id: true, nome: true } },
        andamentos: {
          where: { excluido: false },
          orderBy: { created_at: "desc" },
          take: 1,
          select: { status_andamento: true, valor_financiado: true, imoveis: { select: { endereco: true } } }
        },
        financiamento_acompanhamento: {
          select: { proxima_acao_data: true, proxima_acao_texto: true, responsavel: { select: { id: true, nome: true } } }
        },
        financiamento_atividades: {
          where: { OR: [{ tipo: TIPO_ETAPA, fim: null }, { tipo: TIPO_INCONFORMIDADE, fim: null }] },
          orderBy: { inicio: "desc" },
          select: { tipo: true, inicio: true, estimado: true, motivo: true }
        }
      }
    }),
    prisma.financiamento_atividades.groupBy({
      by: ["avaliacao_id"],
      where: { tipo: TIPO_CONTATO_FIN },
      _max: { inicio: true }
    }),
    prisma.financiamento_etapas.findMany({ select: { coluna: true, responsavel_id: true } }),
    prisma.parceiros.findMany({
      where: { funcao: { in: ["Administrativo", "Corretor"] }, status_funcao: "Ativo" },
      orderBy: [{ funcao: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true }
    })
  ]);

  const agora = Date.now();
  const ultimoContato = new Map(contatos.map((c) => [c.avaliacao_id, c._max.inicio]));

  const cards: CardFinanciamento[] = avaliacoes.map((a) => {
    const and = a.andamentos[0] ?? null;
    const coluna = colunaDoCard(a.status, and?.status_andamento ?? null);
    const etapaAberta = a.financiamento_atividades.find((x) => x.tipo === TIPO_ETAPA) ?? null;
    const inconf = a.financiamento_atividades.find((x) => x.tipo === TIPO_INCONFORMIDADE) ?? null;
    const acomp = a.financiamento_acompanhamento;
    const contato = ultimoContato.get(a.id) ?? null;
    const valor = and?.valor_financiado ?? a.valor_financiamento ?? a.valor_aprovado;
    const tel = a.clientes?.telefone ?? a.telefone ?? null;
    return {
      id: a.id,
      idLegado: a.id_legado,
      cliente: a.clientes?.nome ?? "Cliente não informado",
      telefone: tel ? formatTelefone(tel) : null,
      banco: a.bancos?.nome ?? null,
      parceiroId: a.parceiros?.id ?? null,
      parceiroNome: a.parceiros?.nome ?? null,
      tipoAvaliacao: a.tipo_avaliacao,
      statusAvaliacao: a.status,
      statusAndamento: and ? normalizarStatusAndamento(and.status_andamento, a.status) : null,
      coluna,
      imovel: and?.imoveis?.endereco ?? null,
      valor: valor !== null && valor !== undefined ? Number(valor) : null,
      validade: a.data_validade ? a.data_validade.toISOString().slice(0, 10) : null,
      responsavelId: acomp?.responsavel?.id ?? null,
      responsavelNome: acomp?.responsavel?.nome ?? null,
      proximaAcaoData: acomp?.proxima_acao_data ? acomp.proxima_acao_data.toISOString().slice(0, 10) : null,
      proximaAcaoTexto: acomp?.proxima_acao_texto ?? null,
      diasNaEtapa: etapaAberta ? Math.max(0, Math.floor((agora - etapaAberta.inicio.getTime()) / DIA_MS)) : 0,
      estimado: etapaAberta?.estimado ?? false,
      inconformidadeAberta: inconf?.motivo ?? null,
      ultimoContatoDias: contato ? Math.max(0, Math.floor((agora - contato.getTime()) / DIA_MS)) : null,
      temAndamento: !!and
    };
  });

  const responsavelPorColuna: Record<string, string | null> = {};
  for (const e of etapas) responsavelPorColuna[e.coluna] = e.responsavel_id;

  const bancos = [...new Set(cards.map((c) => c.banco).filter((b): b is string => !!b))].sort((x, y) => x.localeCompare(y, "pt-BR"));
  const parceirosMap = new Map<string, string>();
  for (const c of cards) if (c.parceiroId && c.parceiroNome) parceirosMap.set(c.parceiroId, c.parceiroNome);
  const parceiros = [...parceirosMap.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-sm font-bold text-gray-800">Financiamento</div>
          <div className="text-[11px] text-gray-400">
            Arraste o card para mudar de etapa. Cada mudança é registrada com o tempo gasto em cada etapa.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/financiamento/relatorio"
            className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold text-gray-600 whitespace-nowrap"
          >
            Relatório
          </Link>
          <Link
            href="/financiamento/lista"
            className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold text-gray-600 whitespace-nowrap"
          >
            Ver em lista
          </Link>
          <Link href="/financiamento/novo" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap">
            + Nova avaliação
          </Link>
        </div>
      </div>

      <FinanciamentoKanban
        cards={cards}
        hoje={hojeInputDate()}
        diasAlertaValidade={DIAS_ALERTA_VALIDADE}
        responsaveis={responsaveis}
        bancos={bancos}
        parceiros={parceiros}
        responsavelPorColuna={responsavelPorColuna}
        moverCard={moverCardFinanciamentoAction}
        definirResponsavelColuna={definirResponsavelColunaFinAction}
      />
    </div>
  );
}
