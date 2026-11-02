import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatTelefone } from "@/lib/format";
import type { CardFinanciamento } from "@/components/financiamento-kanban";
import { TIPO_CONTATO_FIN, TIPO_ETAPA, TIPO_INCONFORMIDADE, colunaDoCard, normalizarStatusAndamento } from "@/lib/financiamento/quadro";

const DIA_MS = 86400000;

// Cards do quadro de Financiamento. Usado pelo quadro do administrativo (todos
// os processos, filtrados pela loja) e pelo painel do corretor (só os dele): o
// `filtro` é o único ponto que muda.
export async function carregarCardsFinanciamento(filtro: Prisma.avaliacoesWhereInput): Promise<CardFinanciamento[]> {
  const where: Prisma.avaliacoesWhereInput = { excluido: false, AND: [filtro] };

  const [avaliacoes, contatos] = await Promise.all([
    prisma.avaliacoes.findMany({
      where,
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
      where: { tipo: TIPO_CONTATO_FIN, avaliacoes: where },
      _max: { inicio: true }
    })
  ]);

  const agora = Date.now();
  const ultimoContato = new Map(contatos.map((c) => [c.avaliacao_id, c._max.inicio]));

  return avaliacoes.map((a) => {
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
}
