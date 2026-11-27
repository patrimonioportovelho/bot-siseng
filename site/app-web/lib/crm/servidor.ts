import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAlteracao, logAlteracaoPortal } from "@/lib/auth";
import { hojeInputDate } from "@/lib/format";
import {
  CONTATO_DA_ATIVIDADE,
  CRM_VAZIO,
  MOTIVOS_SEM_PROXIMA_ATIVIDADE,
  TIPOS_ATIVIDADE_CRM,
  type AtividadeCliente,
  type CrmCliente
} from "@/lib/crm/atividades";

// Regras do CRM do cliente, usadas pelo administrativo (app/clientes/crm-actions.ts) e pelo portal do corretor
// (app/portal/clientes/crm-actions.ts). Cada ação confere quem está agindo: o administrativo mexe em qualquer
// cliente; o corretor só nos clientes que estão no nome dele.

export type Ator = { parceiroId: string; nome: string; portal: boolean };
export type ContatoRegistrado = { id: string; tipo: string; resultado: string | null; nota: string | null; data: string; por: string | null };
type Resp<T> = ({ ok: true } & T) | { ok: false; erro: string };

const FUNCOES_RESPONSAVEL = ["Administrativo", "Corretor", "Corretor Estagiário"];

export async function clienteDoAtor(ator: Ator, clienteId: string) {
  const c = await prisma.clientes.findUnique({ where: { id: clienteId }, select: { id: true, nome: true, parceiro_id: true } });
  if (!c) return null;
  if (ator.portal && c.parceiro_id !== ator.parceiroId) return null;
  return c;
}

// O corretor fez o primeiro movimento: o cliente deixa de ser "novo para você".
export async function limparRepasse(ator: Ator, clienteId: string) {
  if (!ator.portal) return;
  await prisma.clientes.updateMany({ where: { id: clienteId, parceiro_id: ator.parceiroId, repasse_desde: { not: null } }, data: { repasse_desde: null, repasse_por: null } });
}

export async function registrarLog(ator: Ator, clienteId: string, acao: string, depois: unknown) {
  const dados = { entidadeTipo: "clientes", entidadeId: clienteId, acao, dadosDepois: depois };
  if (ator.portal) await logAlteracaoPortal({ parceiroId: ator.parceiroId, ...dados }).catch(() => undefined);
  else await logAlteracao(dados).catch(() => undefined);
}

function revalidar(ator: Ator, clienteId: string) {
  revalidatePath(ator.portal ? `/portal/clientes/${clienteId}` : `/clientes/${clienteId}/etiqueta`);
}

export function paraAtividade(a: { id: string; tipo: string; titulo: string; data: Date; hora: string | null; responsavel_id: string | null; feito: boolean; feito_em: Date | null; origem: string }, nomes: Map<string, string>): AtividadeCliente {
  return {
    id: a.id,
    tipo: a.tipo,
    titulo: a.titulo,
    data: a.data.toISOString().slice(0, 10),
    hora: a.hora,
    responsavelId: a.responsavel_id,
    responsavelNome: a.responsavel_id ? (nomes.get(a.responsavel_id) ?? null) : null,
    feito: a.feito,
    feitoEm: a.feito_em ? a.feito_em.toISOString() : null,
    origem: a.origem
  };
}

// Estado do CRM e atividades de um cliente, prontos para a etiqueta.
export async function carregarCrmDoCliente(clienteId: string): Promise<{ crm: CrmCliente; atividades: AtividadeCliente[] }> {
  const [crm, atividades] = await Promise.all([
    prisma.crm_clientes.findUnique({ where: { cliente_id: clienteId } }),
    prisma.clientes_atividades.findMany({ where: { cliente_id: clienteId }, orderBy: [{ feito: "asc" }, { data: "asc" }], take: 200 })
  ]);
  const ids = [...new Set(atividades.map((a) => a.responsavel_id).filter((x): x is string => !!x))];
  const nomes = new Map((await prisma.parceiros.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((p) => [p.id, p.nome]));
  return {
    crm: crm
      ? {
          temperatura: crm.temperatura,
          optOut: crm.opt_out,
          optOutEm: crm.opt_out_em ? crm.opt_out_em.toISOString() : null,
          optOutMotivo: crm.opt_out_motivo,
          telefoneInvalido: crm.telefone_invalido,
          instagram: crm.instagram,
          facebook: crm.facebook,
          fonteDado: crm.fonte_dado
        }
      : CRM_VAZIO,
    atividades: atividades.map((a) => paraAtividade(a, nomes))
  };
}

// ---------------------------------------------------------------------------------------------------------
// Próxima atividade
// ---------------------------------------------------------------------------------------------------------
export async function agendarAtividade(
  ator: Ator,
  clienteId: string,
  d: { tipo: string; titulo: string; data: string; hora?: string | null; responsavelId?: string | null; contatoId?: string | null; origem?: string }
): Promise<Resp<{ atividade: AtividadeCliente }>> {
  const cliente = await clienteDoAtor(ator, clienteId);
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };
  if (!TIPOS_ATIVIDADE_CRM.includes(d.tipo)) return { ok: false, erro: "Escolha o tipo da atividade." };
  const titulo = d.titulo.trim().slice(0, 200);
  if (!titulo) return { ok: false, erro: "Descreva a atividade." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data) || Number.isNaN(new Date(`${d.data}T00:00:00.000Z`).getTime())) return { ok: false, erro: "Escolha a data da atividade." };
  if (d.data < hojeInputDate()) return { ok: false, erro: "A data precisa ser hoje ou uma data futura." };
  const hora = d.hora && /^\d{2}:\d{2}$/.test(d.hora) ? d.hora : null;

  // O corretor só agenda para si; o administrativo escolhe (padrão: o corretor do cliente, para aparecer na agenda dele).
  let responsavelId = ator.portal ? ator.parceiroId : (d.responsavelId ?? cliente.parceiro_id ?? ator.parceiroId);
  if (!ator.portal) {
    const ok = await prisma.parceiros.findFirst({ where: { id: responsavelId, funcao: { in: FUNCOES_RESPONSAVEL }, status_funcao: "Ativo" }, select: { id: true } });
    if (!ok) responsavelId = ator.parceiroId;
  }

  const criada = await prisma.clientes_atividades.create({
    data: {
      cliente_id: clienteId,
      contato_id: d.contatoId ?? null,
      tipo: d.tipo,
      titulo,
      data: new Date(`${d.data}T00:00:00.000Z`),
      hora,
      responsavel_id: responsavelId,
      origem: d.origem ?? "manual",
      criado_por: ator.parceiroId
    }
  });
  await limparRepasse(ator, clienteId);
  await registrarLog(ator, clienteId, "agendar_atividade_cliente", { tipo: d.tipo, data: d.data, titulo });
  revalidar(ator, clienteId);
  const nome = (await prisma.parceiros.findUnique({ where: { id: responsavelId }, select: { nome: true } }))?.nome ?? null;
  return { ok: true, atividade: paraAtividade(criada, new Map(nome ? [[responsavelId, nome]] : [])) };
}

// Conclui a atividade e registra o contato correspondente em "Contatos e notas" (contato -> atividade -> próxima).
export async function concluirAtividade(
  ator: Ator,
  atividadeId: string,
  d: { resultado?: string | null; nota?: string | null }
): Promise<Resp<{ atividade: AtividadeCliente; contato: ContatoRegistrado }>> {
  const a = await prisma.clientes_atividades.findUnique({ where: { id: atividadeId } });
  if (!a) return { ok: false, erro: "Atividade não encontrada." };
  const cliente = await clienteDoAtor(ator, a.cliente_id);
  if (!cliente) return { ok: false, erro: "Atividade não encontrada." };
  if (a.feito) return { ok: false, erro: "Esta atividade já foi concluída." };

  const tipoContato = CONTATO_DA_ATIVIDADE[a.tipo] ?? "Nota";
  const nota = d.nota?.trim().slice(0, 4000) || (tipoContato === "Nota" ? a.titulo : null);
  const contato = await prisma.clientes_contatos.create({
    data: { cliente_id: a.cliente_id, tipo: tipoContato, resultado: d.resultado?.trim().slice(0, 200) || "Atividade concluída", nota, por_parceiro_id: ator.parceiroId }
  });
  const feita = await prisma.clientes_atividades.update({ where: { id: atividadeId }, data: { feito: true, feito_em: new Date(), feito_por: ator.parceiroId, contato_id: contato.id } });
  await limparRepasse(ator, a.cliente_id);
  await registrarLog(ator, a.cliente_id, "concluir_atividade_cliente", { tipo: a.tipo, titulo: a.titulo });
  revalidar(ator, a.cliente_id);
  const nomeResp = a.responsavel_id ? (await prisma.parceiros.findUnique({ where: { id: a.responsavel_id }, select: { nome: true } }))?.nome : null;
  return {
    ok: true,
    atividade: paraAtividade(feita, new Map(a.responsavel_id && nomeResp ? [[a.responsavel_id, nomeResp]] : [])),
    contato: { id: contato.id, tipo: contato.tipo, resultado: contato.resultado, nota: contato.nota, data: contato.data.toISOString(), por: ator.nome }
  };
}

export async function removerAtividade(ator: Ator, atividadeId: string): Promise<Resp<object>> {
  const a = await prisma.clientes_atividades.findUnique({ where: { id: atividadeId }, select: { id: true, cliente_id: true, feito: true, tipo: true, titulo: true } });
  if (!a) return { ok: false, erro: "Atividade não encontrada." };
  if (!(await clienteDoAtor(ator, a.cliente_id))) return { ok: false, erro: "Atividade não encontrada." };
  if (a.feito) return { ok: false, erro: "Atividade concluída fica no histórico." };
  await prisma.clientes_atividades.delete({ where: { id: atividadeId } });
  await registrarLog(ator, a.cliente_id, "remover_atividade_cliente", { tipo: a.tipo, titulo: a.titulo });
  revalidar(ator, a.cliente_id);
  return { ok: true };
}

// Quando não há próxima atividade, fica registrado o porquê (auditável) em "Contatos e notas".
export async function registrarSemProximaAtividade(ator: Ator, clienteId: string, motivo: string, observacao?: string | null): Promise<Resp<{ contato: ContatoRegistrado }>> {
  const cliente = await clienteDoAtor(ator, clienteId);
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };
  if (!MOTIVOS_SEM_PROXIMA_ATIVIDADE.includes(motivo)) return { ok: false, erro: "Escolha o motivo." };
  const contato = await prisma.clientes_contatos.create({
    data: { cliente_id: clienteId, tipo: "Nota", resultado: "Sem próxima atividade", nota: [motivo, observacao?.trim()].filter(Boolean).join(" — ").slice(0, 1000), por_parceiro_id: ator.parceiroId }
  });
  await registrarLog(ator, clienteId, "sem_proxima_atividade_cliente", { motivo });
  revalidar(ator, clienteId);
  return { ok: true, contato: { id: contato.id, tipo: contato.tipo, resultado: contato.resultado, nota: contato.nota, data: contato.data.toISOString(), por: ator.nome } };
}

// ---------------------------------------------------------------------------------------------------------
// Canais para achar o cliente e estado do relacionamento
// ---------------------------------------------------------------------------------------------------------
const limpar = (v: string | null | undefined, max: number) => (v ?? "").trim().slice(0, max) || null;

export async function salvarCanais(
  ator: Ator,
  clienteId: string,
  d: { instagram: string | null; facebook: string | null; fonteDado: string | null; telefoneInvalido: boolean }
): Promise<Resp<{ crm: CrmCliente }>> {
  const cliente = await clienteDoAtor(ator, clienteId);
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };
  const dados = { instagram: limpar(d.instagram, 200), facebook: limpar(d.facebook, 300), fonte_dado: limpar(d.fonteDado, 300), telefone_invalido: d.telefoneInvalido, updated_at: new Date(), updated_by: ator.parceiroId };
  await prisma.crm_clientes.upsert({ where: { cliente_id: clienteId }, create: { cliente_id: clienteId, ...dados }, update: dados });
  await limparRepasse(ator, clienteId);
  await registrarLog(ator, clienteId, "salvar_canais_cliente", { instagram: !!dados.instagram, facebook: !!dados.facebook, fonte: dados.fonte_dado, telefone_invalido: d.telefoneInvalido });
  revalidar(ator, clienteId);
  return { ok: true, crm: (await carregarCrmDoCliente(clienteId)).crm };
}

// Opt-out: lembretes automáticos de relacionamento (novidades e ganchos) que estavam em aberto são encerrados, sem
// apagar, para ninguém procurar o cliente por causa deles. Devolve quantos foram encerrados.
export async function encerrarLembretesDeMarketing(clienteId: string, atorId: string): Promise<number> {
  const abertos = await prisma.clientes_atividades.findMany({
    where: { cliente_id: clienteId, feito: false, origem: "roteiro", OR: [{ titulo: { startsWith: "Manutenção:" } }, { titulo: { startsWith: "Lembrar:" } }] },
    select: { id: true, titulo: true }
  });
  for (const a of abertos) {
    await prisma.clientes_atividades.update({ where: { id: a.id }, data: { feito: true, feito_em: new Date(), feito_por: atorId, titulo: `Cancelada (opt-out) — ${a.titulo}`.slice(0, 200) } });
  }
  return abertos.length;
}

// LGPD: o cliente pediu para não receber novidades. Bloqueia contatos de marketing (WhatsApp do gerador e e-mail em
// lote) e fica visível na etiqueta. Também pode ser desfeito (o cliente voltou a aceitar).
export async function definirOptOut(ator: Ator, clienteId: string, optOut: boolean, motivo: string | null): Promise<Resp<{ crm: CrmCliente; contato: ContatoRegistrado }>> {
  const cliente = await clienteDoAtor(ator, clienteId);
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };
  const m = limpar(motivo, 300);
  if (optOut && !m) return { ok: false, erro: "Informe o motivo (o que o cliente disse)." };
  const dados = optOut
    ? { opt_out: true, opt_out_em: new Date(), opt_out_motivo: m, temperatura: "nao_quer", updated_at: new Date(), updated_by: ator.parceiroId }
    : { opt_out: false, opt_out_em: null, opt_out_motivo: null, updated_at: new Date(), updated_by: ator.parceiroId };
  await prisma.crm_clientes.upsert({ where: { cliente_id: clienteId }, create: { cliente_id: clienteId, ...dados }, update: dados });
  const contato = await prisma.clientes_contatos.create({
    data: { cliente_id: clienteId, tipo: "Nota", resultado: optOut ? "Opt-out (não quer novidades)" : "Voltou a aceitar contatos", nota: m, por_parceiro_id: ator.parceiroId }
  });
  if (optOut) await encerrarLembretesDeMarketing(clienteId, ator.parceiroId);
  await limparRepasse(ator, clienteId);
  await registrarLog(ator, clienteId, optOut ? "opt_out_cliente" : "opt_in_cliente", { motivo: m });
  revalidar(ator, clienteId);
  return {
    ok: true,
    crm: (await carregarCrmDoCliente(clienteId)).crm,
    contato: { id: contato.id, tipo: contato.tipo, resultado: contato.resultado, nota: contato.nota, data: contato.data.toISOString(), por: ator.nome }
  };
}
