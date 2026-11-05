import { prisma } from "@/lib/prisma";

export type VinculoCliente = {
  id: string;
  tipo: "Imóvel" | "Contrato" | "Administração" | "Proposta" | "Avaliação" | "Gestão";
  titulo: string;
  detalhe: string;
  href: string | null;
  data: string | null; // ISO
};

const montarEndereco = (p: { rua: string | null; numero: string | null; bairro: string | null }) =>
  [p.rua, p.numero, p.bairro].filter(Boolean).join(", ") || null;

// Tudo que liga o cliente ao resto do sistema, para a etiqueta: imóveis, contratos (nos dois lados),
// administrações, gestões, propostas e avaliações. Também devolve o imóvel de referência usado nas
// mensagens de WhatsApp.
export async function carregarVinculosCliente(id: string): Promise<{ vinculos: VinculoCliente[]; imovelReferencia: string | null }> {
  const [imoveis, transacoes, extras, adm, gestoes, propostas, avaliacoes] = await Promise.all([
    prisma.imoveis_proprietarios.findMany({ where: { cliente_id: id, imoveis: { excluido: false } }, select: { created_at: true, imoveis: { select: { id: true, id_legado: true, endereco: true } } } }),
    prisma.transacoes.findMany({
      where: { excluido: false, OR: [{ cliente_id: id }, { cliente_contraparte_id: id }] },
      orderBy: { created_at: "desc" },
      select: { id: true, id_legado: true, tipo: true, status: true, cliente_id: true, created_at: true, imoveis: { select: { endereco: true } } }
    }),
    prisma.transacoes_contrapartes.findMany({
      where: { cliente_id: id, transacoes: { excluido: false } },
      select: { transacoes: { select: { id: true, id_legado: true, tipo: true, status: true, created_at: true, imoveis: { select: { endereco: true } } } } }
    }),
    prisma.adm_imoveis.findMany({ where: { cliente_id: id, excluido: false }, orderBy: { created_at: "desc" }, select: { id: true, status: true, created_at: true, imoveis: { select: { endereco: true } } } }),
    prisma.gestoes.findMany({ where: { cliente_id: id, excluido: false }, orderBy: { created_at: "desc" }, take: 10, select: { id: true, created_at: true } }),
    prisma.propostas.findMany({ where: { cliente_id: id }, orderBy: { created_at: "desc" }, take: 10, select: { id: true, descricao: true, rua: true, numero: true, bairro: true, valor_proposta: true, created_at: true } }),
    prisma.avaliacoes.findMany({ where: { cliente_id: id, excluido: false }, orderBy: { created_at: "desc" }, take: 10, select: { id: true, id_legado: true, status: true, tipo_avaliacao: true, created_at: true } })
  ]);

  const vinculos: VinculoCliente[] = [];
  let imovelReferencia: string | null = null;

  for (const p of propostas) {
    const end = montarEndereco(p) ?? p.descricao;
    imovelReferencia ??= end;
    vinculos.push({
      id: `proposta-${p.id}`,
      tipo: "Proposta",
      titulo: end ?? "Proposta",
      detalhe: Number(p.valor_proposta).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
      href: null,
      data: p.created_at.toISOString()
    });
  }
  const jaVistos = new Set<string>();
  const addContrato = (t: { id: string; id_legado: string | null; tipo: string; status: string | null; created_at: Date; imoveis: { endereco: string | null } | null }, lado: string) => {
    if (jaVistos.has(t.id)) return;
    jaVistos.add(t.id);
    if (lado === "locatário/comprador") imovelReferencia ??= t.imoveis?.endereco ?? null;
    vinculos.push({
      id: `transacao-${t.id}`,
      tipo: "Contrato",
      titulo: `${t.tipo} · ${t.id_legado ?? "sem id"}`,
      detalhe: `${t.status ?? "sem status"} · ${lado}${t.imoveis?.endereco ? ` · ${t.imoveis.endereco}` : ""}`,
      href: `/transacoes/${t.id}`,
      data: t.created_at.toISOString()
    });
  };
  for (const t of transacoes) addContrato(t, t.cliente_id === id ? "proprietário/vendedor" : "locatário/comprador");
  for (const e of extras) addContrato(e.transacoes, "locatário/comprador");
  for (const a of avaliacoes) {
    vinculos.push({
      id: `avaliacao-${a.id}`,
      tipo: "Avaliação",
      titulo: `${a.tipo_avaliacao ?? "Avaliação"} · ${a.id_legado ?? "sem id"}`,
      detalhe: a.status,
      href: `/financiamento/${a.id}/etiqueta`,
      data: a.created_at.toISOString()
    });
  }
  for (const i of imoveis) {
    imovelReferencia ??= i.imoveis.endereco;
    vinculos.push({
      id: `imovel-${i.imoveis.id}`,
      tipo: "Imóvel",
      titulo: i.imoveis.endereco ?? i.imoveis.id_legado ?? "Imóvel",
      detalhe: "Proprietário",
      href: `/imoveis/${i.imoveis.id}`,
      data: i.created_at.toISOString()
    });
  }
  for (const a of adm) {
    vinculos.push({ id: `adm-${a.id}`, tipo: "Administração", titulo: a.imoveis?.endereco ?? "Administração", detalhe: a.status, href: `/administracoes/${a.id}`, data: a.created_at.toISOString() });
  }
  for (const g of gestoes) {
    vinculos.push({ id: `gestao-${g.id}`, tipo: "Gestão", titulo: "Contrato de gestão", detalhe: "Proprietário", href: `/gestoes/${g.id}`, data: g.created_at.toISOString() });
  }
  return { vinculos, imovelReferencia };
}
