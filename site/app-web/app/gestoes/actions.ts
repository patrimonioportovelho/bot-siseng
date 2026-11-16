"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAlteracao, requireEdicao } from "@/lib/auth";
import { valorEditavelParaDecimal, percentualParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { logMovimentoQuadro } from "@/lib/quadro-log";
import { sincronizarProprietariosExtra, sincronizarVinculosConjuge } from "@/lib/imoveis/proprietarios-extra";
import { validarAnuncio, type AnuncioInformado } from "@/lib/gestoes/anuncio";

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

function percentual(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return percentualParaDecimal(t);
}

function inteiro(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

// Ao mandar o card para "Comercialização" o administrativo confirma se o imóvel já foi anunciado no site. Se foi,
// o ID e o link do anúncio ficam no cadastro do imóvel (imoveis.anuncio_id / anuncio_url); se não foi, o que
// estiver lá é apagado.
async function gravarAnuncioNoImovel(imovelId: string, anuncio: AnuncioInformado) {
  const antes = await prisma.imoveis.findUnique({ where: { id: imovelId }, select: { anuncio_id: true, anuncio_url: true } });
  const novo = anuncio.anunciado ? { anuncio_id: anuncio.id.trim(), anuncio_url: anuncio.url.trim() } : { anuncio_id: null, anuncio_url: null };
  if (antes?.anuncio_id === novo.anuncio_id && antes?.anuncio_url === novo.anuncio_url) return;
  await prisma.imoveis
    .update({ where: { id: imovelId }, data: { ...novo, updated_at: new Date() } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "imoveis", entidadeId: imovelId, acao: "editar", erro }));
  await logAlteracao({ entidadeTipo: "imoveis", entidadeId: imovelId, acao: "editar", dadosAntes: antes, dadosDepois: novo });
  revalidatePath(`/imoveis/${imovelId}`);
  revalidatePath("/imoveis");
}

// A confirmação chega do formulário da ficha da gestão como três campos: anuncio_resposta ("sim" | "nao"),
// anuncio_id e anuncio_url.
function anuncioDoFormulario(formData: FormData): AnuncioInformado | null {
  const resposta = texto(formData, "anuncio_resposta");
  if (resposta === "nao") return { anunciado: false };
  if (resposta === "sim") return { anunciado: true, id: texto(formData, "anuncio_id") ?? "", url: texto(formData, "anuncio_url") ?? "" };
  return null;
}

// Edição completa da ficha da Gestão — Cliente/Imóvel não são editáveis
// aqui (nasceram do formulário do portal, mostrados só como leitura no
// cabeçalho da página).
export async function atualizarGestaoAction(formData: FormData) {
  await requireEdicao("atividades");

  const id = texto(formData, "gestaoId");
  if (!id) throw new Error("Gestão inválida.");

  const antes = await prisma.gestoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Gestão não encontrada.");

  await sincronizarProprietariosExtra(antes.imovel_id, formData);
  await sincronizarVinculosConjuge(formData);

  // Indo para Comercialização, exige a confirmação do anúncio (a tela abre a janela antes de salvar; isto é a
  // garantia do servidor).
  const colunaNova = texto(formData, "coluna");
  const indoParaComercializacao = colunaNova === "comercializacao" && antes.coluna !== "comercializacao";
  const anuncio = indoParaComercializacao ? anuncioDoFormulario(formData) : null;
  if (indoParaComercializacao) {
    const erroAnuncio = validarAnuncio(anuncio);
    if (erroAnuncio) throw new Error(erroAnuncio);
  }

  const novaChavePosse = texto(formData, "chave_posse") ?? "imobiliaria";
  const novaChaveCom = texto(formData, "chave_com");
  const chaveMudou = novaChavePosse !== antes.chave_posse || novaChaveCom !== antes.chave_com;

  const depois = await prisma.gestoes
    .update({
      where: { id },
      data: {
        coluna: texto(formData, "coluna") ?? undefined,
        parceiro_id: texto(formData, "parceiro_id"),
        valor_venda: valorMonetario(formData, "valor_venda"),
        porc_honorario: percentual(formData, "porc_honorario"),
        prazo_gestao_dias: inteiro(formData, "prazo_gestao_dias"),
        data_assinatura: data(formData, "data_assinatura"),
        chave_posse: novaChavePosse,
        chave_com: novaChaveCom,
        chave_atualizado_em: chaveMudou ? new Date() : undefined,
        updated_at: new Date()
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "gestoes", entidadeId: id, acao: "editar", erro }));

  if (anuncio) await gravarAnuncioNoImovel(antes.imovel_id, anuncio);

  await logAlteracao({ entidadeTipo: "gestoes", entidadeId: id, acao: "editar", dadosAntes: antes, dadosDepois: depois });

  revalidatePath(`/gestoes/${id}`);
  revalidatePath("/gestoes");
  revalidatePath("/manutencao/painel");
  redirect(`/gestoes/${id}?salvo=1`);
}

// Chamada direto do arrastar-e-soltar do Kanban — mesmo padrão do quadro de
// Manutenção (moverColunaAction em app/manutencao/actions.ts): o card já muda
// de coluna na tela, aqui só grava e devolve rápido (log depois da resposta).
// Indo para "Comercialização" exige a confirmação do anúncio (`anuncio`); sem ela, recusa e o card volta. Recusa
// de regra volta como { ok: false, erro } porque em produção o Next esconde a mensagem de um erro lançado.
export async function moverColunaAction(id: string, novaColuna: string, anuncio?: AnuncioInformado): Promise<void | { ok: false; erro: string }> {
  const sessao = await requireEdicao("atividades");

  const antes = await prisma.gestoes.findUnique({ where: { id }, select: { coluna: true, imovel_id: true } });
  if (!antes) throw new Error("Gestão não encontrada.");
  if (antes.coluna === novaColuna) return;

  if (novaColuna === "comercializacao") {
    const erroAnuncio = validarAnuncio(anuncio);
    if (erroAnuncio) return { ok: false, erro: erroAnuncio };
    await gravarAnuncioNoImovel(antes.imovel_id, anuncio!);
  }

  await prisma.gestoes
    .update({ where: { id }, data: { coluna: novaColuna, updated_at: new Date() } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "gestoes", entidadeId: id, acao: "mover_coluna", erro }));

  logMovimentoQuadro({
    parceiroId: sessao.parceiroId,
    entidadeTipo: "gestoes",
    entidadeId: id,
    antes: { coluna: antes.coluna },
    depois: { coluna: novaColuna }
  });
}

// Soft-delete — mesmo padrão do resto do sistema: marca excluido=true em vez
// de apagar de verdade (histórico de checklist/atividades/notas continua).
export async function apagarGestaoAction(formData: FormData) {
  await requireEdicao("atividades");

  const id = texto(formData, "gestaoId");
  if (!id) throw new Error("Gestão inválida.");

  await prisma.gestoes
    .update({ where: { id }, data: { excluido: true, updated_at: new Date() } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "gestoes", entidadeId: id, acao: "apagar", erro }));

  await logAlteracao({ entidadeTipo: "gestoes", entidadeId: id, acao: "apagar" });

  revalidatePath("/gestoes");
  redirect("/gestoes");
}

// --- Checklist ---

export async function adicionarChecklistItemAction(formData: FormData) {
  await requireEdicao("atividades");

  const gestaoId = texto(formData, "gestaoId");
  const label = texto(formData, "label");
  if (!gestaoId || !label) throw new Error("Informe o item do checklist.");

  const ultimo = await prisma.gestao_checklist_itens.findFirst({
    where: { gestao_id: gestaoId },
    orderBy: { ordem: "desc" }
  });

  await prisma.gestao_checklist_itens
    .create({
      data: { gestao_id: gestaoId, label, ordem: (ultimo?.ordem ?? -1) + 1 }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "gestao_checklist_itens", entidadeId: gestaoId, acao: "criar", erro }));

  revalidatePath(`/gestoes/${gestaoId}`);
}

export async function marcarChecklistItemAction(id: string, gestaoId: string) {
  await requireEdicao("atividades");

  const item = await prisma.gestao_checklist_itens.findUnique({ where: { id } });
  if (!item) throw new Error("Item não encontrado.");

  await prisma.gestao_checklist_itens
    .update({ where: { id }, data: { done: !item.done } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "gestao_checklist_itens", entidadeId: id, acao: "marcar", erro }));

  revalidatePath(`/gestoes/${gestaoId}`);
}

export async function removerChecklistItemAction(id: string, gestaoId: string) {
  await requireEdicao("atividades");

  await prisma.gestao_checklist_itens
    .delete({ where: { id } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "gestao_checklist_itens", entidadeId: id, acao: "remover", erro }));

  revalidatePath(`/gestoes/${gestaoId}`);
}

// --- Atividades (agendadas dentro da gestão, aparecem no Calendário) ---

export async function criarAtividadeAction(formData: FormData) {
  await requireEdicao("atividades");

  const gestaoId = texto(formData, "gestaoId");
  const tipo = texto(formData, "tipo");
  const titulo = texto(formData, "titulo");
  const dataAtividade = data(formData, "data");

  if (!gestaoId || !tipo || !titulo || !dataAtividade) {
    throw new Error("Tipo, título e data são obrigatórios pra agendar a atividade.");
  }

  await prisma.gestao_atividades
    .create({
      data: {
        gestao_id: gestaoId,
        tipo,
        titulo,
        data: dataAtividade,
        notas: texto(formData, "notas")
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "gestao_atividades", entidadeId: gestaoId, acao: "criar", erro }));

  revalidatePath(`/gestoes/${gestaoId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

export async function marcarAtividadeFeitaAction(id: string, gestaoId: string) {
  await requireEdicao("atividades");

  const atividade = await prisma.gestao_atividades.findUnique({ where: { id } });
  if (!atividade) throw new Error("Atividade não encontrada.");

  await prisma.gestao_atividades
    .update({ where: { id }, data: { feito: !atividade.feito } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "gestao_atividades", entidadeId: id, acao: "marcar_feita", erro }));

  revalidatePath(`/gestoes/${gestaoId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

export async function removerAtividadeAction(id: string, gestaoId: string) {
  await requireEdicao("atividades");

  await prisma.gestao_atividades
    .delete({ where: { id } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "gestao_atividades", entidadeId: id, acao: "remover", erro }));

  revalidatePath(`/gestoes/${gestaoId}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

// --- Notas (histórico, timestamp automático, ordem cronológica reversa) ---

export async function adicionarNotaAction(formData: FormData) {
  await requireEdicao("atividades");

  const gestaoId = texto(formData, "gestaoId");
  const textoNota = texto(formData, "texto");
  if (!gestaoId || !textoNota) throw new Error("Escreva o texto da nota.");

  await prisma.gestao_notas
    .create({ data: { gestao_id: gestaoId, texto: textoNota } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "gestao_notas", entidadeId: gestaoId, acao: "criar", erro }));

  revalidatePath(`/gestoes/${gestaoId}`);
}
