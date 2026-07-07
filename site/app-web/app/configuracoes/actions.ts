"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAlteracao, requireAdm, aprovarSolicitacaoAction, rejeitarSolicitacaoAction, hashSenha } from "@/lib/auth";

// Libera (ou troca) o acesso de alguém direto, sem passar pela fila de
// solicitação — útil pro cadastro inicial de cada parceiro e também pra você
// mesmo (admin) trocar sua própria senha quando precisar.
export async function definirSenhaParceiroAction(formData: FormData) {
  await requireAdm();

  const parceiroId = String(formData.get("parceiroId") ?? "");
  const senha = String(formData.get("senha") ?? "").trim();
  if (!parceiroId || !senha) {
    redirect(`/configuracoes?erro=${encodeURIComponent("Selecione o parceiro e digite uma senha.")}`);
  }

  const senhaHash = await hashSenha(senha);

  await prisma.parceiros.update({
    where: { id: parceiroId },
    data: { senha_hash: senhaHash }
  });

  await logAlteracao({
    entidadeTipo: "parceiros",
    entidadeId: parceiroId,
    acao: "definir_senha_manual"
  });

  revalidatePath("/configuracoes");
  redirect("/configuracoes?salvo=1");
}

export async function aprovarAcessoAction(formData: FormData) {
  const id = String(formData.get("solicitacaoId") ?? "");
  if (!id) return;
  await aprovarSolicitacaoAction(id);
  revalidatePath("/configuracoes");
  redirect("/configuracoes?aprovado=1");
}

export async function rejeitarAcessoAction(formData: FormData) {
  const id = String(formData.get("solicitacaoId") ?? "");
  if (!id) return;
  await rejeitarSolicitacaoAction(id);
  revalidatePath("/configuracoes");
  redirect("/configuracoes?rejeitado=1");
}

// Notícias e editais do site público (login) — separado da tabela "noticias"
// (essa é só pro corretor logado no Portal). Sem publicação automática por
// e-mail nem nada externo: é só um CRUD simples pra manter o site atualizado.
function dadosPublicacao(formData: FormData) {
  return {
    tipo: String(formData.get("tipo") ?? "Noticia"),
    titulo: String(formData.get("titulo") ?? "").trim(),
    resumo: String(formData.get("resumo") ?? "").trim() || null,
    corpo: String(formData.get("corpo") ?? "").trim(),
    imagem_url: String(formData.get("imagem_url") ?? "").trim() || null,
    ativo: formData.get("ativo") === "on"
  };
}

export async function criarPublicacaoAction(formData: FormData) {
  const admin = await requireAdm();
  const dados = dadosPublicacao(formData);
  if (!dados.titulo || !dados.corpo) {
    redirect(`/configuracoes?erro=${encodeURIComponent("Preencha título e texto da publicação.")}`);
  }

  const criada = await prisma.publicacoes_site.create({
    data: { ...dados, autor_parceiro_id: admin.parceiroId }
  });

  await logAlteracao({
    entidadeTipo: "publicacoes_site",
    entidadeId: criada.id,
    acao: "criar",
    dadosDepois: dados
  });

  revalidatePath("/configuracoes");
  revalidatePath("/login");
  redirect("/configuracoes?salvo_publicacao=1");
}

export async function atualizarPublicacaoAction(formData: FormData) {
  await requireAdm();
  const id = String(formData.get("publicacaoId") ?? "");
  if (!id) redirect(`/configuracoes?erro=${encodeURIComponent("Publicação inválida.")}`);
  const dados = dadosPublicacao(formData);
  if (!dados.titulo || !dados.corpo) {
    redirect(`/configuracoes?erro=${encodeURIComponent("Preencha título e texto da publicação.")}`);
  }

  const antes = await prisma.publicacoes_site.findUnique({ where: { id } });
  await prisma.publicacoes_site.update({
    where: { id },
    data: { ...dados, updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "publicacoes_site",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: dados
  });

  revalidatePath("/configuracoes");
  revalidatePath("/login");
  redirect("/configuracoes?salvo_publicacao=1");
}

export async function alternarAtivoPublicacaoAction(formData: FormData) {
  await requireAdm();
  const id = String(formData.get("publicacaoId") ?? "");
  if (!id) return;

  const atual = await prisma.publicacoes_site.findUnique({ where: { id } });
  if (!atual) return;

  await prisma.publicacoes_site.update({
    where: { id },
    data: { ativo: !atual.ativo, updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "publicacoes_site",
    entidadeId: id,
    acao: atual.ativo ? "desativar" : "ativar",
    dadosAntes: { ativo: atual.ativo },
    dadosDepois: { ativo: !atual.ativo }
  });

  revalidatePath("/configuracoes");
  revalidatePath("/login");
}

export async function excluirPublicacaoAction(formData: FormData) {
  await requireAdm();
  const id = String(formData.get("publicacaoId") ?? "");
  if (!id) return;

  const antes = await prisma.publicacoes_site.findUnique({ where: { id } });
  if (!antes) return;

  await prisma.publicacoes_site.delete({ where: { id } });

  await logAlteracao({
    entidadeTipo: "publicacoes_site",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { titulo: antes.titulo }
  });

  revalidatePath("/configuracoes");
  revalidatePath("/login");
}

// Mensagens do SAC — o site público só grava a mensagem (ver
// criarMensagemSacAction em app/login/actions.ts); aqui é só o
// acompanhamento manual: abrir, ler e marcar o andamento.
export async function atualizarStatusSacAction(formData: FormData) {
  const admin = await requireAdm();
  const id = String(formData.get("mensagemId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !status) return;

  await prisma.mensagens_sac.update({
    where: { id },
    data: {
      status,
      resolvido_em: status === "Resolvido" ? new Date() : null,
      resolvido_por_parceiro_id: status === "Resolvido" ? admin.parceiroId : null
    }
  });

  await logAlteracao({
    entidadeTipo: "mensagens_sac",
    entidadeId: id,
    acao: "atualizar_status",
    dadosDepois: { status }
  });

  revalidatePath("/configuracoes");
}
