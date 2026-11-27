import { prisma } from "@/lib/prisma";
import { formatTelefone } from "@/lib/format";
import { STATUS_AVALIACAO_ATIVOS } from "@/lib/financiamento/opcoes";
import { ANDAMENTO_COMPRA_VENDA_OPCOES, FUNCOES_CORRETOR } from "@/lib/transacoes/opcoes";
import {
  DIAS_PROPOSTA_RECENTE,
  STATUS_COMPRA_FINALIZADA,
  STATUS_LOCACAO_ATIVA,
  STATUS_LOCACAO_SEM_ADM,
  derivarEtapa,
  prefixoElaboracao,
  type Derivacao,
  type EtapaFunilId,
  type SinaisCliente
} from "@/lib/clientes/funil";

const DIA_MS = 86400000;
// transação cancelada não gera vínculo de proprietário só por existir
const STATUS_CANCELADOS = ["Cancelado", "Distrato", "Locação cancelada"];
// andamento do contrato de compra e venda ainda rodando (sem "Conclusão" nem "Cancelado")
const ANDAMENTOS_EM_CURSO = ANDAMENTO_COMPRA_VENDA_OPCOES.filter((a) => a !== "Conclusão" && a !== "Cancelado");

export type ClienteFunil = {
  id: string;
  idLegado: string | null;
  nome: string;
  telefone: string | null;
  telefoneDigitos: string | null;
  email: string | null;
  corretorNome: string | null;
  // o responsável é um Corretor ou Corretor Estagiário em atividade? (senão o cliente precisa de transferência)
  corretorAtivo: boolean;
  criadoEm: string;
  coluna: EtapaFunilId;
  motivo: string;
  papeis: string[];
  // coluna escolhida à mão
  movido: boolean;
  colunaAutomatica: EtapaFunilId;
  atendimentoDesde: string | null;
  // repassado ao corretor e ainda sem movimento dele (aparece como "novo para você" no portal)
  repasseDesde: string | null;
  ultimoContatoDias: number | null;
  // CRM: temperatura do roteiro de atendimento ("nao_quer" = opt-out)
  temperatura: string | null;
};

function sinaisVazios(): SinaisCliente {
  return {
    proprietario: false,
    proprietarioAtivo: false,
    concluido: null,
    eventoEm: null,
    manual: null,
    locacaoAtiva: false,
    compraFinalizada: false,
    compraEmCurso: false,
    financiamentoEmCurso: false,
    contratoEmElaboracao: null,
    propostaEm: null,
    avaliacaoAtiva: null,
    avaliacaoEm: null,
    contratoEm: null,
    atendimentoManual: false
  };
}

// Tudo que o sistema sabe de cada cliente, em poucas consultas (e só dos `ids`, quando
// informados — a lista de Clientes usa isso para mostrar a etapa das 50 linhas da página).
export async function carregarSinais(ids: string[] | null): Promise<Map<string, SinaisCliente>> {
  const filtro = ids ? { in: ids } : undefined;
  const desdeProposta = new Date(Date.now() - DIAS_PROPOSTA_RECENTE * DIA_MS);

  const [imoveis, adm, gestoes, transacoes, contrapartes, propostas, avaliacoes] = await Promise.all([
    prisma.imoveis_proprietarios.findMany({ where: { ...(filtro ? { cliente_id: filtro } : {}), imoveis: { excluido: false } }, select: { cliente_id: true } }),
    prisma.adm_imoveis.findMany({ where: { ...(filtro ? { cliente_id: filtro } : {}), excluido: false }, select: { cliente_id: true, status: true } }),
    prisma.gestoes.findMany({ where: { ...(filtro ? { cliente_id: filtro } : {}), excluido: false }, select: { cliente_id: true, imovel_id: true, created_at: true } }),
    prisma.transacoes.findMany({
      where: { excluido: false, ...(filtro ? { OR: [{ cliente_id: filtro }, { cliente_contraparte_id: filtro }] } : {}) },
      select: { tipo: true, status: true, andamento: true, cliente_id: true, cliente_contraparte_id: true, imovel_id: true, created_at: true, data_vencimento: true }
    }),
    prisma.transacoes_contrapartes.findMany({
      where: { ...(filtro ? { cliente_id: filtro } : {}), transacoes: { excluido: false } },
      select: { cliente_id: true, transacoes: { select: { tipo: true, status: true, andamento: true, created_at: true, data_vencimento: true } } }
    }),
    prisma.propostas.findMany({ where: { ...(filtro ? { cliente_id: filtro } : {}), created_at: { gte: desdeProposta } }, select: { cliente_id: true, created_at: true } }),
    prisma.avaliacoes.findMany({
      where: { cliente_id: filtro ?? { not: null }, excluido: false, status: { in: STATUS_AVALIACAO_ATIVOS } },
      select: {
        cliente_id: true,
        status: true,
        created_at: true,
        data_validade: true,
        andamentos: { where: { excluido: false }, orderBy: { created_at: "desc" }, take: 1, select: { status_andamento: true } }
      }
    })
  ]);

  const mapa = new Map<string, SinaisCliente>();
  const de = (id: string) => {
    let s = mapa.get(id);
    if (!s) {
      s = sinaisVazios();
      mapa.set(id, s);
    }
    return s;
  };
  const hoje = new Date();
  const novoEvento = (s: SinaisCliente, quando: Date) => {
    if (!s.eventoEm || quando > s.eventoEm) s.eventoEm = quando;
  };
  // o que já terminou: quando há vários, vale o mais relevante
  const ORDEM_CONCLUIDO = ["Compra concluída", "Venda concluída", "Locação encerrada", "Administração encerrada", "Negócio cancelado"];
  const concluir = (s: SinaisCliente, motivo: string) => {
    if (!s.concluido || ORDEM_CONCLUIDO.indexOf(motivo) < ORDEM_CONCLUIDO.indexOf(s.concluido)) s.concluido = motivo;
  };
  const locacaoRodando = (tipo: string, status: string | null, vencimento: Date | null) =>
    // "Transação Finalizada sem administração" com o contrato ainda no prazo também é locação ativa
    tipo === "Locação" && ((!!status && STATUS_LOCACAO_ATIVA.includes(status)) || (status === STATUS_LOCACAO_SEM_ADM && vencimento !== null && vencimento >= hoje));
  const compraAssinada = (tipo: string, status: string | null) => tipo === "Compra e Venda" && !!status && STATUS_COMPRA_FINALIZADA.includes(status);
  const emCurso = (andamento: string | null) => !!andamento && ANDAMENTOS_EM_CURSO.includes(andamento);

  // lado locatário/comprador
  const lado = (id: string, tipo: string, status: string | null, andamento: string | null, criadoEm: Date, vencimento: Date | null) => {
    const s = de(id);
    novoEvento(s, criadoEm);
    let contrato = false;
    if (locacaoRodando(tipo, status, vencimento)) {
      s.locacaoAtiva = true;
      contrato = true;
    }
    if (compraAssinada(tipo, status)) {
      s.compraFinalizada = true;
      if (emCurso(andamento)) s.compraEmCurso = true;
      else concluir(s, "Compra concluída");
      contrato = true;
    }
    if (status?.startsWith(prefixoElaboracao)) {
      s.contratoEmElaboracao = tipo;
      contrato = true;
    }
    if (!contrato && status) concluir(s, STATUS_CANCELADOS.includes(status) ? "Negócio cancelado" : tipo === "Locação" ? "Locação encerrada" : "Compra concluída");
    if (contrato && (!s.contratoEm || criadoEm > s.contratoEm)) s.contratoEm = criadoEm;
  };

  // lado proprietário/vendedor
  const imoveisVendidos = new Set<string>();
  for (const t of transacoes) {
    const dono = de(t.cliente_id);
    novoEvento(dono, t.created_at);
    const cancelada = !!t.status && STATUS_CANCELADOS.includes(t.status);
    if (!cancelada) dono.proprietario = true;
    const vendendo = !!t.status?.startsWith(prefixoElaboracao) || (compraAssinada(t.tipo, t.status) && emCurso(t.andamento));
    if (locacaoRodando(t.tipo, t.status, t.data_vencimento) || vendendo) dono.proprietarioAtivo = true;
    else if (t.status) concluir(dono, cancelada ? "Negócio cancelado" : t.tipo === "Locação" ? "Locação encerrada" : "Venda concluída");
    if (compraAssinada(t.tipo, t.status) && t.imovel_id) imoveisVendidos.add(t.imovel_id);
    lado(t.cliente_contraparte_id, t.tipo, t.status, t.andamento, t.created_at, t.data_vencimento);
  }
  for (const c of contrapartes) lado(c.cliente_id, c.transacoes.tipo, c.transacoes.status, c.transacoes.andamento, c.transacoes.created_at, c.transacoes.data_vencimento);

  for (const i of imoveis) de(i.cliente_id).proprietario = true;
  for (const a of adm) {
    const s = de(a.cliente_id);
    s.proprietario = true;
    if (a.status === "Encerrado") concluir(s, "Administração encerrada");
    else s.proprietarioAtivo = true;
  }
  for (const g of gestoes) {
    const s = de(g.cliente_id);
    s.proprietario = true;
    novoEvento(s, g.created_at);
    // gestão de imóvel já vendido não segura o cliente
    if (g.imovel_id && imoveisVendidos.has(g.imovel_id)) concluir(s, "Venda concluída");
    else s.proprietarioAtivo = true;
  }
  for (const p of propostas) {
    const s = de(p.cliente_id);
    if (!s.propostaEm || p.created_at > s.propostaEm) s.propostaEm = p.created_at;
    novoEvento(s, p.created_at);
  }
  for (const a of avaliacoes) {
    if (!a.cliente_id) continue;
    const s = de(a.cliente_id);
    novoEvento(s, a.created_at);
    // Financiamento aprovado e ainda em processo (com validade em dia e andamento não concluído): o processo da compra segue.
    if (a.status === "Aprovado" && (!a.data_validade || a.data_validade >= hoje) && a.andamentos[0]?.status_andamento !== "Concluído") s.financiamentoEmCurso = true;
    // Quem já tem contrato: avaliação anterior a ele já virou o contrato, e avaliação "Aprovado" depois dele é o
    // financiamento da própria compra (não é um novo atendimento). Só uma análise nova, depois do contrato, conta.
    if (s.contratoEm && (a.created_at <= s.contratoEm || a.status === "Aprovado")) continue;
    // vale a avaliação em andamento mais recente
    if (!s.avaliacaoEm || a.created_at > s.avaliacaoEm) {
      s.avaliacaoAtiva = a.status;
      s.avaliacaoEm = a.created_at;
    }
  }
  return mapa;
}

// O que está no próprio cadastro: marcação de atendimento e coluna escolhida à mão.
type MarcasDoCliente = { atendimento_desde: Date | null; funil_coluna: string | null; funil_coluna_em: Date | null };
const comMarcas = (s: SinaisCliente | undefined, c: MarcasDoCliente): SinaisCliente => ({
  ...(s ?? sinaisVazios()),
  atendimentoManual: !!c.atendimento_desde,
  manual: c.funil_coluna && c.funil_coluna_em ? { etapa: c.funil_coluna, em: c.funil_coluna_em } : null
});

// Etapa (já calculada) de um conjunto de clientes — usado pela lista.
export async function etapasDosClientes(clientes: ({ id: string } & MarcasDoCliente)[]): Promise<Map<string, Derivacao>> {
  const sinais = await carregarSinais(clientes.map((c) => c.id));
  const agora = new Date();
  return new Map(clientes.map((c) => [c.id, derivarEtapa(comMarcas(sinais.get(c.id), c), agora)]));
}

// Os cards do quadro. `where` é o filtro de clientes (arquivados, loja). Com `restrito` (portal do
// corretor, só os clientes dele) os vínculos e contatos são buscados só desses clientes.
export async function carregarFunil(where: object, opcoes: { restrito?: boolean } = {}): Promise<ClienteFunil[]> {
  const baseClientes = await prisma.clientes.findMany({
      where,
      orderBy: { created_at: "desc" },
      select: { id: true, id_legado: true, nome: true, telefone: true, email: true, created_at: true, atendimento_desde: true, funil_coluna: true, funil_coluna_em: true, repasse_desde: true, parceiros: { select: { nome: true, funcao: true, status_funcao: true } } }
  });
  const clientes = baseClientes;
  const ids = opcoes.restrito ? clientes.map((c) => c.id) : null;
  const [sinais, contatos, estadosCrm] = await Promise.all([
    carregarSinais(ids),
    prisma.clientes_contatos.groupBy({ by: ["cliente_id"], where: ids ? { cliente_id: { in: ids } } : {}, _max: { data: true } }),
    prisma.crm_clientes.findMany({ where: { OR: [{ temperatura: { not: null } }, { opt_out: true }], ...(ids ? { cliente_id: { in: ids } } : {}) }, select: { cliente_id: true, temperatura: true, opt_out: true } })
  ]);
  const temperaturas = new Map(estadosCrm.map((e) => [e.cliente_id, e.opt_out ? "nao_quer" : e.temperatura]));
  const ultimoContato = new Map(contatos.map((c) => [c.cliente_id, c._max.data]));
  const agora = new Date();
  return clientes.map((c) => {
    const d = derivarEtapa(comMarcas(sinais.get(c.id), c), agora);
    const digitos = (c.telefone ?? "").replace(/\D/g, "");
    const contato = ultimoContato.get(c.id) ?? null;
    return {
      id: c.id,
      idLegado: c.id_legado,
      nome: c.nome,
      telefone: c.telefone ? formatTelefone(c.telefone) : null,
      telefoneDigitos: digitos || null,
      email: c.email,
      corretorNome: c.parceiros?.nome ?? null,
      corretorAtivo: !!c.parceiros && FUNCOES_CORRETOR.includes(c.parceiros.funcao) && c.parceiros.status_funcao === "Ativo",
      criadoEm: c.created_at.toISOString(),
      coluna: d.etapa,
      motivo: d.motivo,
      papeis: d.papeis,
      movido: d.manual,
      colunaAutomatica: d.etapaAutomatica,
      atendimentoDesde: c.atendimento_desde ? c.atendimento_desde.toISOString() : null,
      repasseDesde: c.repasse_desde ? c.repasse_desde.toISOString() : null,
      ultimoContatoDias: contato ? Math.max(0, Math.floor((agora.getTime() - contato.getTime()) / DIA_MS)) : null,
      temperatura: temperaturas.get(c.id) ?? null
    };
  });
}

// Etapa de um cliente só (movimentos e etiqueta).
export async function etapaDoCliente(id: string): Promise<{ derivacao: Derivacao; atendimentoDesde: Date | null } | null> {
  const c = await prisma.clientes.findUnique({ where: { id }, select: { id: true, atendimento_desde: true, funil_coluna: true, funil_coluna_em: true } });
  if (!c) return null;
  const sinais = await carregarSinais([id]);
  return { derivacao: derivarEtapa(comMarcas(sinais.get(id), c)), atendimentoDesde: c.atendimento_desde };
}
