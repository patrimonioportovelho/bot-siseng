"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { logMovimentoQuadro } from "@/lib/quadro-log";
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
