"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { logMovimentoQuadro } from "@/lib/quadro-log";
import {
  FORMAS_PAGAMENTO,
  QUEM_ARCA,
  QUEM_PAGA,
  gerarParcelas,
  type GrupoOrcamento,
  type ItemCatalogo,
  type ItemOrcamento,
  type LinhaPagamento
} from "@/lib/manutencao/orcamento";
import { CHAVE_POSSE, SOLICITADO_POR, TIPOS_ATIVIDADE, TIPOS_SERVICO, URGENCIAS } from "@/lib/manutencao/opcoes";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function valorMonetario(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return valorEditavelParaDecimal(t);
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

// Quando a ficha está aberta no painel lateral da etiqueta (?embed=1) ou veio
// dela no celular (?voltar=etiqueta), o redirect depois de salvar mantém isso
// (lido do endereço da tela que enviou o formulário).
async function sufixoDaFicha(): Promise<string> {
  const ref = (await headers()).get("referer") ?? "";
  let extra = "";
  if (/[?&]embed=1/.test(ref)) extra += "&embed=1";
  if (/[?&]voltar=etiqueta/.test(ref)) extra += "&voltar=etiqueta";
  return extra;
}

// Cadastro de um novo ticket de manutenção. imovel_id sempre vem de um
// imóvel de verdade (picker com Id + endereço) — nunca texto livre — e o
// cliente_proprietario_id normalmente já chega pré-preenchido a partir do
// imóvel escolhido (ver components/manutencao-form.tsx), mas continua
// editável/substituível pelo usuário.
export async function criarManutencaoAction(formData: FormData) {
  await requireAdminSession();

  const imovelId = texto(formData, "imovel_id");
  const titulo = texto(formData, "titulo");
  const tipoServico = texto(formData, "tipo_servico");

  if (!imovelId || !titulo || !tipoServico) {
    throw new Error("Imóvel, título e tipo de serviço são obrigatórios.");
  }

  const criada = await prisma.manutencoes
    .create({
      data: {
        imovel_id: imovelId,
        cliente_proprietario_id: texto(formData, "cliente_proprietario_id"),
        prestador_id: texto(formData, "prestador_id"),
        titulo,
        tipo_servico: tipoServico,
        urgencia: texto(formData, "urgencia") ?? "media",
        solicitado_por: texto(formData, "solicitado_por"),
        chave_posse: texto(formData, "chave_posse") ?? "imobiliaria",
        chave_com: texto(formData, "chave_com"),
        chave_atualizado_em: new Date(),
        coluna: "solicitado",
        coluna_atualizada_em: new Date(),
        autorizado_por: "pendente"
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencoes", acao: "criar", erro }));

  await logAlteracao({ entidadeTipo: "manutencoes", entidadeId: criada.id, acao: "criar", dadosDepois: criada });

  revalidatePath("/manutencao");
  redirect(`/manutencao/${criada.id}?salvo=1`);
}

// Edição completa da ficha do ticket (campos do modelo de dados).
export async function atualizarManutencaoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "manutencaoId");
  if (!id) throw new Error("Manutenção inválida.");

  const antes = await prisma.manutencoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Manutenção não encontrada.");

  const novaChavePosse = texto(formData, "chave_posse") ?? "imobiliaria";
  const novaChaveCom = texto(formData, "chave_com");
  // Só atualiza o timestamp da chave quando de fato muda de mão — evita
  // "atualizado agora" toda vez que a ficha é só editada por outro motivo.
  const chaveMudou = novaChavePosse !== antes.chave_posse || novaChaveCom !== antes.chave_com;

  const depois = await prisma.manutencoes
    .update({
      where: { id },
      data: {
        titulo: texto(formData, "titulo") ?? undefined,
        tipo_servico: texto(formData, "tipo_servico") ?? undefined,
        urgencia: texto(formData, "urgencia") ?? undefined,
        solicitado_por: texto(formData, "solicitado_por"),
        cliente_proprietario_id: texto(formData, "cliente_proprietario_id"),
        prestador_id: texto(formData, "prestador_id"),
        chave_posse: novaChavePosse,
        chave_com: novaChaveCom,
        chave_atualizado_em: chaveMudou ? new Date() : undefined,
        updated_at: new Date()
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencoes", entidadeId: id, acao: "editar", erro }));

  await logAlteracao({ entidadeTipo: "manutencoes", entidadeId: id, acao: "editar", dadosAntes: antes, dadosDepois: depois });

  revalidatePath(`/manutencao/${id}`);
  revalidatePath("/manutencao");
  revalidatePath("/manutencao/painel");
  redirect(`/manutencao/${id}?salvo=1${await sufixoDaFicha()}`);
}

// Chamada direto do arrastar-e-soltar do Kanban — atualiza só a coluna (e o
// relógio "parado há N dias"), sem passar pelo formulário inteiro. O quadro já
// mostra o card na coluna nova (movimento otimista), então aqui não recarrega a
// página: só grava e devolve rápido. O log vai para depois da resposta.
export async function moverColunaAction(id: string, novaColuna: string) {
  const sessao = await requireAdminSession();

  const antes = await prisma.manutencoes.findUnique({ where: { id }, select: { coluna: true } });
  if (!antes) throw new Error("Manutenção não encontrada.");
  if (antes.coluna === novaColuna) return;

  const agora = new Date();
  await prisma.manutencoes
    .update({ where: { id }, data: { coluna: novaColuna, coluna_atualizada_em: agora, updated_at: agora } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencoes", entidadeId: id, acao: "mover_coluna", erro }));

  logMovimentoQuadro({
    parceiroId: sessao.parceiroId,
    entidadeTipo: "manutencoes",
    entidadeId: id,
    antes: { coluna: antes.coluna },
    depois: { coluna: novaColuna }
  });
}

// Soft-delete — mesmo padrão usado em imóveis/clientes/transações: marca
// excluido=true em vez de apagar de verdade, porque o ticket pode ter
// checklist/atividades/notas com histórico real.
export async function apagarManutencaoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "manutencaoId");
  if (!id) throw new Error("Manutenção inválida.");

  await prisma.manutencoes
    .update({ where: { id }, data: { excluido: true, updated_at: new Date() } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencoes", entidadeId: id, acao: "apagar", erro }));

  await logAlteracao({ entidadeTipo: "manutencoes", entidadeId: id, acao: "apagar" });

  revalidatePath("/manutencao");
  redirect("/manutencao");
}

// --- Checklist ---

export async function adicionarChecklistItemAction(formData: FormData) {
  await requireAdminSession();

  const manutencaoId = texto(formData, "manutencaoId");
  const label = texto(formData, "label");
  if (!manutencaoId || !label) throw new Error("Informe o item do checklist.");

  const ultimo = await prisma.manutencao_checklist_itens.findFirst({
    where: { manutencao_id: manutencaoId },
    orderBy: { ordem: "desc" }
  });

  await prisma.manutencao_checklist_itens
    .create({
      data: { manutencao_id: manutencaoId, label, ordem: (ultimo?.ordem ?? -1) + 1 }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencao_checklist_itens", entidadeId: manutencaoId, acao: "criar", erro }));

  revalidatePath(`/manutencao/${manutencaoId}`);
}

export async function marcarChecklistItemAction(id: string, manutencaoId: string) {
  await requireAdminSession();

  const item = await prisma.manutencao_checklist_itens.findUnique({ where: { id } });
  if (!item) throw new Error("Item não encontrado.");

  await prisma.manutencao_checklist_itens
    .update({ where: { id }, data: { done: !item.done } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencao_checklist_itens", entidadeId: id, acao: "marcar", erro }));

  revalidatePath(`/manutencao/${manutencaoId}`);
}

export async function removerChecklistItemAction(id: string, manutencaoId: string) {
  await requireAdminSession();

  await prisma.manutencao_checklist_itens
    .delete({ where: { id } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencao_checklist_itens", entidadeId: id, acao: "remover", erro }));

  revalidatePath(`/manutencao/${manutencaoId}`);
}

// --- Atividades (agendadas dentro do ticket, aparecem no Calendário) ---

export async function criarAtividadeAction(formData: FormData) {
  await requireAdminSession();

  const manutencaoId = texto(formData, "manutencaoId");
  const tipo = texto(formData, "tipo");
  const titulo = texto(formData, "titulo");
  const dataAtividade = data(formData, "data");

  if (!manutencaoId || !tipo || !titulo || !dataAtividade) {
    throw new Error("Tipo, título e data são obrigatórios pra agendar a atividade.");
  }

  await prisma.manutencao_atividades
    .create({
      data: {
        manutencao_id: manutencaoId,
        tipo,
        titulo,
        data: dataAtividade,
        notas: texto(formData, "notas")
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencao_atividades", entidadeId: manutencaoId, acao: "criar", erro }));

  revalidatePath(`/manutencao/${manutencaoId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

export async function marcarAtividadeFeitaAction(id: string, manutencaoId: string) {
  await requireAdminSession();

  const atividade = await prisma.manutencao_atividades.findUnique({ where: { id } });
  if (!atividade) throw new Error("Atividade não encontrada.");

  await prisma.manutencao_atividades
    .update({ where: { id }, data: { feito: !atividade.feito } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencao_atividades", entidadeId: id, acao: "marcar_feita", erro }));

  revalidatePath(`/manutencao/${manutencaoId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

export async function removerAtividadeAction(id: string, manutencaoId: string) {
  await requireAdminSession();

  await prisma.manutencao_atividades
    .delete({ where: { id } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencao_atividades", entidadeId: id, acao: "remover", erro }));

  revalidatePath(`/manutencao/${manutencaoId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

// --- Notas (histórico, timestamp automático, ordem cronológica reversa) ---

export async function adicionarNotaAction(formData: FormData) {
  await requireAdminSession();

  const manutencaoId = texto(formData, "manutencaoId");
  const textoNota = texto(formData, "texto");
  if (!manutencaoId || !textoNota) throw new Error("Escreva o texto da nota.");

  await prisma.manutencao_notas
    .create({ data: { manutencao_id: manutencaoId, texto: textoNota } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "manutencao_notas", entidadeId: manutencaoId, acao: "criar", erro }));

  revalidatePath(`/manutencao/${manutencaoId}`);
}

// --- Etiqueta (salvamento automático, mensagens e notas rápidas) ---

type ResultadoMan = { ok: true } | { ok: false; erro: string };

export type NotaManutencao = { id: string; texto: string; criadoEm: string };

// Campos que a etiqueta edita direto (salvamento automático).
export async function salvarCampoManutencaoAction(id: string, campo: string, valor: string | null): Promise<ResultadoMan> {
  const sessao = await requireAdminSession();
  try {
    const v = (valor ?? "").trim() || null;
    let dados: Record<string, unknown>;
    if (campo === "urgencia") {
      if (!v || !(URGENCIAS as readonly string[]).includes(v)) return { ok: false, erro: "Urgência inválida." };
      dados = { urgencia: v };
    } else if (campo === "titulo") {
      if (!v) return { ok: false, erro: "O título não pode ficar vazio." };
      dados = { titulo: v };
    } else if (campo === "tipo_servico") {
      if (!v || !TIPOS_SERVICO.some((t) => t.value === v)) return { ok: false, erro: "Tipo de serviço inválido." };
      dados = { tipo_servico: v };
    } else if (campo === "solicitado_por") {
      if (v && !SOLICITADO_POR.includes(v)) return { ok: false, erro: "Valor inválido." };
      dados = { solicitado_por: v };
    } else if (campo === "chave_posse") {
      if (!v || !CHAVE_POSSE.includes(v)) return { ok: false, erro: "Posse da chave inválida." };
      dados = { chave_posse: v, chave_atualizado_em: new Date() };
    } else if (campo === "chave_com") {
      dados = { chave_com: v, chave_atualizado_em: new Date() };
    } else if (campo === "prestador_id") {
      if (v) {
        const existe = await prisma.parceiros.findUnique({ where: { id: v }, select: { id: true } });
        if (!existe) return { ok: false, erro: "Prestador não encontrado." };
      }
      dados = { prestador_id: v };
    } else {
      return { ok: false, erro: "Campo não permitido." };
    }
    const antes = await prisma.manutencoes.findUnique({ where: { id }, select: { [campo]: true } });
    if (!antes) return { ok: false, erro: "Manutenção não encontrada." };
    await prisma.manutencoes.update({ where: { id }, data: { ...(dados as object), updated_at: new Date() } });
    logMovimentoQuadro({
      parceiroId: sessao.parceiroId,
      entidadeTipo: "manutencoes",
      entidadeId: id,
      antes,
      depois: { ...dados, origem: "etiqueta-manutencao" }
    });
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar." };
  }
}

async function criarNota(id: string, textoNota: string): Promise<NotaManutencao> {
  const nota = await prisma.manutencao_notas.create({ data: { manutencao_id: id, texto: textoNota } });
  return { id: nota.id, texto: nota.texto, criadoEm: nota.criado_em.toISOString() };
}

// Nota rápida da etiqueta (sem sair da tela).
export async function adicionarNotaRapidaAction(
  id: string,
  textoNota: string
): Promise<{ ok: true; nota: NotaManutencao } | { ok: false; erro: string }> {
  await requireAdminSession();
  const t = textoNota.trim();
  if (!t) return { ok: false, erro: "Escreva o texto da nota." };
  try {
    return { ok: true, nota: await criarNota(id, t) };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar a nota." };
  }
}

// Mensagem de WhatsApp enviada pela etiqueta: fica registrada nas notas do
// ticket (quem recebeu, qual modelo e o texto), que é a linha do tempo da ficha.
export async function registrarContatoManutencaoAction(
  id: string,
  dados: { para: string; modelo: string; texto: string }
): Promise<{ ok: true; nota: NotaManutencao } | { ok: false; erro: string }> {
  await requireAdminSession();
  try {
    const texto = `📱 WhatsApp enviado — Para: ${dados.para}\nModelo: ${dados.modelo}\n${dados.texto}`;
    return { ok: true, nota: await criarNota(id, texto) };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível registrar o contato." };
  }
}

// --- Checklist e atividades dentro da etiqueta (devolvem o item; a tela não recarrega) ---

export type ItemChecklistMan = { id: string; label: string; done: boolean };
export type AtividadeMan = { id: string; tipo: string; titulo: string; data: string; feito: boolean; notas: string | null };

function falha(erro: unknown, padrao: string): { ok: false; erro: string } {
  return { ok: false, erro: erro instanceof Error ? erro.message : padrao };
}

export async function adicionarChecklistRapidoAction(
  id: string,
  label: string
): Promise<{ ok: true; item: ItemChecklistMan } | { ok: false; erro: string }> {
  await requireAdminSession();
  const l = label.trim();
  if (!l) return { ok: false, erro: "Informe o item do checklist." };
  try {
    const ultimo = await prisma.manutencao_checklist_itens.findFirst({ where: { manutencao_id: id }, orderBy: { ordem: "desc" }, select: { ordem: true } });
    const item = await prisma.manutencao_checklist_itens.create({ data: { manutencao_id: id, label: l, ordem: (ultimo?.ordem ?? -1) + 1 } });
    return { ok: true, item: { id: item.id, label: item.label, done: item.done } };
  } catch (erro) {
    return falha(erro, "Não foi possível adicionar o item.");
  }
}

export async function marcarChecklistRapidoAction(itemId: string, done: boolean): Promise<ResultadoMan> {
  await requireAdminSession();
  try {
    await prisma.manutencao_checklist_itens.update({ where: { id: itemId }, data: { done } });
    return { ok: true };
  } catch (erro) {
    return falha(erro, "Não foi possível atualizar o item.");
  }
}

export async function removerChecklistRapidoAction(itemId: string): Promise<ResultadoMan> {
  await requireAdminSession();
  try {
    await prisma.manutencao_checklist_itens.delete({ where: { id: itemId } });
    return { ok: true };
  } catch (erro) {
    return falha(erro, "Não foi possível remover o item.");
  }
}

export async function criarAtividadeRapidaAction(
  id: string,
  dados: { tipo: string; titulo: string; data: string; notas: string | null }
): Promise<{ ok: true; atividade: AtividadeMan } | { ok: false; erro: string }> {
  await requireAdminSession();
  const titulo = dados.titulo.trim();
  if (!TIPOS_ATIVIDADE.includes(dados.tipo) || !titulo || !/^\d{4}-\d{2}-\d{2}$/.test(dados.data)) {
    return { ok: false, erro: "Tipo, descrição e data são obrigatórios para agendar." };
  }
  try {
    const a = await prisma.manutencao_atividades.create({
      data: { manutencao_id: id, tipo: dados.tipo, titulo, data: new Date(`${dados.data}T00:00:00.000Z`), notas: (dados.notas ?? "").trim() || null }
    });
    return { ok: true, atividade: { id: a.id, tipo: a.tipo, titulo: a.titulo, data: a.data.toISOString().slice(0, 10), feito: a.feito, notas: a.notas } };
  } catch (erro) {
    return falha(erro, "Não foi possível agendar a atividade.");
  }
}

export async function marcarAtividadeRapidaAction(atividadeId: string, feito: boolean): Promise<ResultadoMan> {
  await requireAdminSession();
  try {
    await prisma.manutencao_atividades.update({ where: { id: atividadeId }, data: { feito } });
    return { ok: true };
  } catch (erro) {
    return falha(erro, "Não foi possível atualizar a atividade.");
  }
}

export async function removerAtividadeRapidaAction(atividadeId: string): Promise<ResultadoMan> {
  await requireAdminSession();
  try {
    await prisma.manutencao_atividades.delete({ where: { id: atividadeId } });
    return { ok: true };
  } catch (erro) {
    return falha(erro, "Não foi possível remover a atividade.");
  }
}

// --- Orçamento (materiais e reforma/mão de obra) ---

const GRUPOS: GrupoOrcamento[] = ["material", "servico"];
const num = (v: unknown) => (v == null ? 0 : Number(v));

function itemOrcamento(i: {
  id: string;
  grupo: string;
  categoria: string | null;
  descricao: string;
  unidade: string;
  quantidade: unknown;
  valor_unitario: unknown;
  fornecedor: string | null;
  preco_ref: unknown;
}): ItemOrcamento {
  return {
    id: i.id,
    grupo: i.grupo as GrupoOrcamento,
    categoria: i.categoria,
    descricao: i.descricao,
    unidade: i.unidade,
    quantidade: num(i.quantidade),
    valorUnitario: num(i.valor_unitario),
    fornecedor: i.fornecedor,
    precoRef: i.preco_ref == null ? null : Number(i.preco_ref)
  };
}

// Itens do catálogo (SINAPI ou manuais) de uma categoria, filtrados pelo que
// foi digitado — alimenta a lista de sugestões do orçamento.
export async function buscarCatalogoObraAction(
  grupo: GrupoOrcamento,
  categoria: string | null,
  termo: string
): Promise<{ itens: ItemCatalogo[]; total: number }> {
  await requireAdminSession();
  if (!GRUPOS.includes(grupo)) return { itens: [], total: 0 };
  const palavras = termo.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const where = {
    grupo,
    ...(categoria ? { categoria } : {}),
    AND: palavras.map((p) => ({ descricao: { contains: p, mode: "insensitive" as const } }))
  };
  const [itens, total] = await Promise.all([
    prisma.catalogo_obra.findMany({ where, orderBy: { descricao: "asc" }, take: 300 }),
    prisma.catalogo_obra.count({ where })
  ]);
  return {
    total,
    itens: itens.map((c) => ({
      id: c.id,
      descricao: c.descricao,
      unidade: c.unidade,
      categoria: c.categoria,
      precoRef: c.preco_ref == null ? null : Number(c.preco_ref),
      referencia: c.referencia
    }))
  };
}

export async function adicionarItemOrcamentoAction(
  id: string,
  dados: {
    grupo: GrupoOrcamento;
    categoria: string | null;
    descricao: string;
    unidade: string;
    quantidade: number;
    valorUnitario: number;
    fornecedor: string | null;
    catalogoId: string | null;
  }
): Promise<{ ok: true; item: ItemOrcamento } | { ok: false; erro: string }> {
  await requireAdminSession();
  const descricao = dados.descricao.trim();
  if (!GRUPOS.includes(dados.grupo) || !descricao || !dados.unidade.trim()) {
    return { ok: false, erro: "Informe a descrição e a unidade do item." };
  }
  if (!(dados.quantidade > 0)) return { ok: false, erro: "A quantidade precisa ser maior que zero." };
  if (dados.valorUnitario < 0) return { ok: false, erro: "O valor não pode ser negativo." };
  try {
    const cat = dados.catalogoId ? await prisma.catalogo_obra.findUnique({ where: { id: dados.catalogoId }, select: { id: true, preco_ref: true } }) : null;
    const ultimo = await prisma.manutencao_orcamento_itens.findFirst({ where: { manutencao_id: id }, orderBy: { ordem: "desc" }, select: { ordem: true } });
    const item = await prisma.manutencao_orcamento_itens.create({
      data: {
        manutencao_id: id,
        grupo: dados.grupo,
        categoria: dados.categoria || null,
        descricao,
        unidade: dados.unidade.trim(),
        quantidade: dados.quantidade,
        valor_unitario: dados.valorUnitario,
        fornecedor: (dados.fornecedor ?? "").trim() || null,
        catalogo_id: cat?.id ?? null,
        preco_ref: cat?.preco_ref ?? null,
        ordem: (ultimo?.ordem ?? -1) + 1
      }
    });
    return { ok: true, item: itemOrcamento(item) };
  } catch (erro) {
    return falha(erro, "Não foi possível adicionar o item.");
  }
}

export async function atualizarItemOrcamentoAction(
  itemId: string,
  patch: { quantidade?: number; valorUnitario?: number; descricao?: string; unidade?: string; fornecedor?: string | null }
): Promise<ResultadoMan> {
  await requireAdminSession();
  const dados: Record<string, unknown> = {};
  if (patch.quantidade !== undefined) {
    if (!(patch.quantidade > 0)) return { ok: false, erro: "A quantidade precisa ser maior que zero." };
    dados.quantidade = patch.quantidade;
  }
  if (patch.valorUnitario !== undefined) {
    if (patch.valorUnitario < 0) return { ok: false, erro: "O valor não pode ser negativo." };
    dados.valor_unitario = patch.valorUnitario;
  }
  if (patch.descricao !== undefined) {
    if (!patch.descricao.trim()) return { ok: false, erro: "A descrição não pode ficar vazia." };
    dados.descricao = patch.descricao.trim();
  }
  if (patch.unidade !== undefined) {
    if (!patch.unidade.trim()) return { ok: false, erro: "A unidade não pode ficar vazia." };
    dados.unidade = patch.unidade.trim();
  }
  if (patch.fornecedor !== undefined) dados.fornecedor = (patch.fornecedor ?? "").trim() || null;
  try {
    await prisma.manutencao_orcamento_itens.update({ where: { id: itemId }, data: dados });
    return { ok: true };
  } catch (erro) {
    return falha(erro, "Não foi possível salvar o item.");
  }
}

export async function removerItemOrcamentoAction(itemId: string): Promise<ResultadoMan> {
  await requireAdminSession();
  try {
    await prisma.manutencao_orcamento_itens.delete({ where: { id: itemId } });
    return { ok: true };
  } catch (erro) {
    return falha(erro, "Não foi possível remover o item.");
  }
}

// --- Pagamento (depois de aprovado) ---

function linhaPagamento(l: { id: string; descricao: string; forma: string; valor: unknown; vencimento: Date | null; pago_em: Date | null }): LinhaPagamento {
  return {
    id: l.id,
    descricao: l.descricao,
    forma: l.forma,
    valor: num(l.valor),
    vencimento: l.vencimento ? l.vencimento.toISOString().slice(0, 10) : null,
    pagoEm: l.pago_em ? l.pago_em.toISOString().slice(0, 10) : null
  };
}

const dataValida = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null);

// quem_arca / quem_paga / obs do plano de pagamento.
export async function salvarPagamentoCampoAction(id: string, campo: string, valor: string | null): Promise<ResultadoMan> {
  await requireAdminSession();
  const v = (valor ?? "").trim() || null;
  let dados: Record<string, unknown>;
  if (campo === "pagamento_quem_arca") {
    if (v && !QUEM_ARCA.some((q) => q.valor === v)) return { ok: false, erro: "Valor inválido." };
    dados = { pagamento_quem_arca: v };
  } else if (campo === "pagamento_quem_paga") {
    if (v && !QUEM_PAGA.some((q) => q.valor === v)) return { ok: false, erro: "Valor inválido." };
    dados = { pagamento_quem_paga: v };
  } else if (campo === "pagamento_obs") {
    dados = { pagamento_obs: v };
  } else {
    return { ok: false, erro: "Campo não permitido." };
  }
  try {
    await prisma.manutencoes.update({ where: { id }, data: { ...(dados as object), updated_at: new Date() } });
    return { ok: true };
  } catch (erro) {
    return falha(erro, "Não foi possível salvar.");
  }
}

export async function adicionarLinhaPagamentoAction(
  id: string,
  dados: { descricao: string; forma: string; valor: number; vencimento: string | null }
): Promise<{ ok: true; linha: LinhaPagamento } | { ok: false; erro: string }> {
  await requireAdminSession();
  if (!dados.descricao.trim() || !FORMAS_PAGAMENTO.some((f) => f.valor === dados.forma)) {
    return { ok: false, erro: "Informe a descrição e a forma de pagamento." };
  }
  if (!(dados.valor >= 0)) return { ok: false, erro: "Valor inválido." };
  try {
    const ultimo = await prisma.manutencao_pagamento_linhas.findFirst({ where: { manutencao_id: id }, orderBy: { ordem: "desc" }, select: { ordem: true } });
    const l = await prisma.manutencao_pagamento_linhas.create({
      data: { manutencao_id: id, descricao: dados.descricao.trim(), forma: dados.forma, valor: dados.valor, vencimento: dataValida(dados.vencimento), ordem: (ultimo?.ordem ?? -1) + 1 }
    });
    return { ok: true, linha: linhaPagamento(l) };
  } catch (erro) {
    return falha(erro, "Não foi possível adicionar o pagamento.");
  }
}

export async function atualizarLinhaPagamentoAction(
  linhaId: string,
  patch: { descricao?: string; forma?: string; valor?: number; vencimento?: string | null; pagoEm?: string | null }
): Promise<ResultadoMan> {
  await requireAdminSession();
  const dados: Record<string, unknown> = {};
  if (patch.descricao !== undefined) {
    if (!patch.descricao.trim()) return { ok: false, erro: "A descrição não pode ficar vazia." };
    dados.descricao = patch.descricao.trim();
  }
  if (patch.forma !== undefined) {
    if (!FORMAS_PAGAMENTO.some((f) => f.valor === patch.forma)) return { ok: false, erro: "Forma de pagamento inválida." };
    dados.forma = patch.forma;
  }
  if (patch.valor !== undefined) {
    if (!(patch.valor >= 0)) return { ok: false, erro: "Valor inválido." };
    dados.valor = patch.valor;
  }
  if (patch.vencimento !== undefined) dados.vencimento = dataValida(patch.vencimento);
  if (patch.pagoEm !== undefined) dados.pago_em = dataValida(patch.pagoEm);
  try {
    await prisma.manutencao_pagamento_linhas.update({ where: { id: linhaId }, data: dados });
    return { ok: true };
  } catch (erro) {
    return falha(erro, "Não foi possível salvar o pagamento.");
  }
}

export async function removerLinhaPagamentoAction(linhaId: string): Promise<ResultadoMan> {
  await requireAdminSession();
  try {
    await prisma.manutencao_pagamento_linhas.delete({ where: { id: linhaId } });
    return { ok: true };
  } catch (erro) {
    return falha(erro, "Não foi possível remover o pagamento.");
  }
}

// Cria as parcelas mensais de um valor (ex.: material em 3x no boleto).
export async function gerarParcelasPagamentoAction(
  id: string,
  dados: { descricao: string; forma: string; total: number; parcelas: number; primeiroVencimento: string }
): Promise<{ ok: true; linhas: LinhaPagamento[] } | { ok: false; erro: string }> {
  await requireAdminSession();
  if (!dados.descricao.trim() || !FORMAS_PAGAMENTO.some((f) => f.valor === dados.forma)) {
    return { ok: false, erro: "Informe a descrição e a forma de pagamento." };
  }
  if (!(dados.total > 0) || !Number.isInteger(dados.parcelas) || dados.parcelas < 1 || dados.parcelas > 36) {
    return { ok: false, erro: "Informe o valor e um número de parcelas entre 1 e 36." };
  }
  if (!dataValida(dados.primeiroVencimento)) return { ok: false, erro: "Informe a data do primeiro vencimento." };
  try {
    const ultimo = await prisma.manutencao_pagamento_linhas.findFirst({ where: { manutencao_id: id }, orderBy: { ordem: "desc" }, select: { ordem: true } });
    const base = (ultimo?.ordem ?? -1) + 1;
    const partes = gerarParcelas(dados.total, dados.parcelas, dados.primeiroVencimento);
    const criadas = await prisma.$transaction(
      partes.map((p, i) =>
        prisma.manutencao_pagamento_linhas.create({
          data: {
            manutencao_id: id,
            descricao: dados.parcelas === 1 ? dados.descricao.trim() : `${dados.descricao.trim()} ${i + 1}/${dados.parcelas}`,
            forma: dados.forma,
            valor: p.valor,
            vencimento: dataValida(p.vencimento),
            ordem: base + i
          }
        })
      )
    );
    return { ok: true, linhas: criadas.map(linhaPagamento) };
  } catch (erro) {
    return falha(erro, "Não foi possível gerar as parcelas.");
  }
}
