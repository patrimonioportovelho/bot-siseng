import { prisma } from "@/lib/prisma";
import { formatTelefone } from "@/lib/format";
import { STATUS_AVALIACAO_ATIVOS } from "@/lib/financiamento/opcoes";
import { FUNCOES_CORRETOR } from "@/lib/transacoes/opcoes";
import {
  DIAS_PROPOSTA_RECENTE,
  STATUS_COMPRA_FINALIZADA,
  STATUS_LOCACAO_ATIVA,
  derivarEtapa,
  prefixoElaboracao,
  type Derivacao,
  type EtapaFunilId,
  type SinaisCliente
} from "@/lib/clientes/funil";

const DIA_MS = 86400000;
// transação cancelada não gera vínculo de proprietário só por existir
const STATUS_CANCELADOS = ["Cancelado", "Distrato", "Locação cancelada"];

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
  voltaParaLeads: boolean;
  atendimentoDesde: string | null;
  // repassado ao corretor e ainda sem movimento dele (aparece como "novo para você" no portal)
  repasseDesde: string | null;
  ultimoContatoDias: number | null;
};

function sinaisVazios(): SinaisCliente {
  return { proprietario: false, locacaoAtiva: false, compraFinalizada: false, contratoEmElaboracao: null, propostaEm: null, avaliacaoAtiva: null, atendimentoManual: false };
}

// Tudo que o sistema sabe de cada cliente, em poucas consultas (e só dos `ids`, quando
// informados — a lista de Clientes usa isso para mostrar a etapa das 50 linhas da página).
export async function carregarSinais(ids: string[] | null): Promise<Map<string, SinaisCliente>> {
  const filtro = ids ? { in: ids } : undefined;
  const desdeProposta = new Date(Date.now() - DIAS_PROPOSTA_RECENTE * DIA_MS);

  const [imoveis, adm, gestoes, transacoes, contrapartes, propostas, avaliacoes] = await Promise.all([
    prisma.imoveis_proprietarios.findMany({ where: { ...(filtro ? { cliente_id: filtro } : {}), imoveis: { excluido: false } }, select: { cliente_id: true } }),
    prisma.adm_imoveis.findMany({ where: { ...(filtro ? { cliente_id: filtro } : {}), excluido: false, status: "Ativo" }, select: { cliente_id: true } }),
    prisma.gestoes.findMany({ where: { ...(filtro ? { cliente_id: filtro } : {}), excluido: false }, select: { cliente_id: true } }),
    prisma.transacoes.findMany({
      where: { excluido: false, ...(filtro ? { OR: [{ cliente_id: filtro }, { cliente_contraparte_id: filtro }] } : {}) },
      select: { tipo: true, status: true, cliente_id: true, cliente_contraparte_id: true }
    }),
    prisma.transacoes_contrapartes.findMany({
      where: { ...(filtro ? { cliente_id: filtro } : {}), transacoes: { excluido: false } },
      select: { cliente_id: true, transacoes: { select: { tipo: true, status: true } } }
    }),
    prisma.propostas.findMany({ where: { ...(filtro ? { cliente_id: filtro } : {}), created_at: { gte: desdeProposta } }, select: { cliente_id: true, created_at: true } }),
    prisma.avaliacoes.findMany({
      where: { cliente_id: filtro ?? { not: null }, excluido: false, status: { in: STATUS_AVALIACAO_ATIVOS } },
      select: { cliente_id: true, status: true }
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
  const lado = (id: string, tipo: string, status: string | null) => {
    const s = de(id);
    if (tipo === "Locação" && status && STATUS_LOCACAO_ATIVA.includes(status)) s.locacaoAtiva = true;
    if (tipo === "Compra e Venda" && status && STATUS_COMPRA_FINALIZADA.includes(status)) s.compraFinalizada = true;
    if (status?.startsWith(prefixoElaboracao)) s.contratoEmElaboracao = tipo;
  };

  for (const i of imoveis) de(i.cliente_id).proprietario = true;
  for (const a of adm) de(a.cliente_id).proprietario = true;
  for (const g of gestoes) de(g.cliente_id).proprietario = true;
  for (const t of transacoes) {
    // lado proprietário/vendedor
    if (!t.status || !STATUS_CANCELADOS.includes(t.status)) de(t.cliente_id).proprietario = true;
    // lado locatário/comprador
    lado(t.cliente_contraparte_id, t.tipo, t.status);
  }
  for (const c of contrapartes) lado(c.cliente_id, c.transacoes.tipo, c.transacoes.status);
  for (const p of propostas) {
    const s = de(p.cliente_id);
    if (!s.propostaEm || p.created_at > s.propostaEm) s.propostaEm = p.created_at;
  }
  for (const a of avaliacoes) if (a.cliente_id) de(a.cliente_id).avaliacaoAtiva = a.status;
  return mapa;
}

// Etapa (já calculada) de um conjunto de clientes — usado pela lista.
export async function etapasDosClientes(clientes: { id: string; atendimento_desde: Date | null }[]): Promise<Map<string, Derivacao>> {
  const sinais = await carregarSinais(clientes.map((c) => c.id));
  const agora = new Date();
  return new Map(
    clientes.map((c) => [c.id, derivarEtapa({ ...(sinais.get(c.id) ?? sinaisVazios()), atendimentoManual: !!c.atendimento_desde }, agora)])
  );
}

// Os cards do quadro. `where` é o filtro de clientes (arquivados, loja). Com `restrito` (portal do
// corretor, só os clientes dele) os vínculos e contatos são buscados só desses clientes.
export async function carregarFunil(where: object, opcoes: { restrito?: boolean } = {}): Promise<ClienteFunil[]> {
  const baseClientes = await prisma.clientes.findMany({
      where,
      orderBy: { created_at: "desc" },
      select: { id: true, id_legado: true, nome: true, telefone: true, email: true, created_at: true, atendimento_desde: true, repasse_desde: true, parceiros: { select: { nome: true, funcao: true, status_funcao: true } } }
  });
  const clientes = baseClientes;
  const ids = opcoes.restrito ? clientes.map((c) => c.id) : null;
  const [sinais, contatos] = await Promise.all([
    carregarSinais(ids),
    prisma.clientes_contatos.groupBy({ by: ["cliente_id"], where: ids ? { cliente_id: { in: ids } } : {}, _max: { data: true } })
  ]);
  const ultimoContato = new Map(contatos.map((c) => [c.cliente_id, c._max.data]));
  const agora = new Date();
  return clientes.map((c) => {
    const d = derivarEtapa({ ...(sinais.get(c.id) ?? sinaisVazios()), atendimentoManual: !!c.atendimento_desde }, agora);
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
      voltaParaLeads: d.voltaParaLeads,
      atendimentoDesde: c.atendimento_desde ? c.atendimento_desde.toISOString() : null,
      repasseDesde: c.repasse_desde ? c.repasse_desde.toISOString() : null,
      ultimoContatoDias: contato ? Math.max(0, Math.floor((agora.getTime() - contato.getTime()) / DIA_MS)) : null
    };
  });
}

// Etapa de um cliente só (movimentos e etiqueta).
export async function etapaDoCliente(id: string): Promise<{ derivacao: Derivacao; atendimentoDesde: Date | null } | null> {
  const c = await prisma.clientes.findUnique({ where: { id }, select: { id: true, atendimento_desde: true } });
  if (!c) return null;
  const sinais = await carregarSinais([id]);
  return {
    derivacao: derivarEtapa({ ...(sinais.get(id) ?? sinaisVazios()), atendimentoManual: !!c.atendimento_desde }),
    atendimentoDesde: c.atendimento_desde
  };
}
