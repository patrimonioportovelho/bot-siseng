"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAlteracao, requireAdm, requireAdminSession, aprovarSolicitacaoAction, rejeitarSolicitacaoAction, hashSenha } from "@/lib/auth";
import {
  apagarImagemPublicacao,
  criarUploadAssinadoImagemPublicacao,
  publicUrlImagemPublicacao
} from "@/lib/supabase-admin";

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

// Notícias e editais — gerenciadas aqui, aparecem no mural público (/login)
// e, quando "portal_corretor" estiver marcado, também no mural do Portal do
// Corretor (substituiu a antiga tabela "noticias", que nunca teve tela de
// cadastro própria). Sem publicação automática por e-mail nem nada externo:
// é só um CRUD simples pra manter os dois murais atualizados.
function dadosBasePublicacao(formData: FormData) {
  return {
    tipo: String(formData.get("tipo") ?? "Noticia"),
    titulo: String(formData.get("titulo") ?? "").trim(),
    resumo: String(formData.get("resumo") ?? "").trim() || null,
    corpo: String(formData.get("corpo") ?? "").trim(),
    ativo: formData.get("ativo") === "on",
    portal_corretor: formData.get("portal_corretor") === "on"
  };
}

// A Vercel tem um limite FIXO de 4,5MB por requisição de Server Action — não
// dá pra aumentar por configuração. Mandar o arquivo de imagem direto no
// FormData da action (como era antes) estourava isso fácil com uma foto de
// capa em boa resolução, e a tela quebrava com "An unexpected response was
// received from the server" (a Vercel corta a requisição e o Next não sabe
// explicar o motivo). A partir daqui a imagem já sobe direto do navegador
// pro Storage via URL assinada (ver components/publicacao-form.tsx) antes da
// action ser chamada — ela só recebe "imagem_caminho", um texto pequeno.
export async function prepararUploadImagemPublicacaoAction(
  nomeArquivo: string
): Promise<{ ok: true; caminho: string; token: string } | { ok: false; erro: string }> {
  await requireAdminSession();
  try {
    const { caminho, token } = await criarUploadAssinadoImagemPublicacao(nomeArquivo);
    return { ok: true, caminho, token };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Falha ao preparar o upload da imagem." };
  }
}

// Notícias, editais e checklists ficam abertos a qualquer administrativo
// logado (não só isAdm) — pedido explícito do usuário, diferente do resto
// desta tela (aprovação de acesso, senha, logs), que continua isAdm-only.
export async function criarPublicacaoAction(formData: FormData) {
  const admin = await requireAdminSession();
  const dados = dadosBasePublicacao(formData);
  if (!dados.titulo || !dados.corpo) {
    redirect(`/configuracoes?erro=${encodeURIComponent("Preencha título e texto da publicação.")}`);
  }

  const imagemCaminho = String(formData.get("imagem_caminho") ?? "").trim();
  const imagem_url = imagemCaminho ? publicUrlImagemPublicacao(imagemCaminho) : null;

  const criada = await prisma.publicacoes_site.create({
    data: { ...dados, imagem_url, autor_parceiro_id: admin.parceiroId }
  });

  await logAlteracao({
    entidadeTipo: "publicacoes_site",
    entidadeId: criada.id,
    acao: "criar",
    dadosDepois: { ...dados, imagem_url }
  });

  revalidatePath("/configuracoes");
  revalidatePath("/login");
  revalidatePath("/portal");
  redirect("/configuracoes?salvo_publicacao=1");
}

export async function atualizarPublicacaoAction(formData: FormData) {
  await requireAdminSession();
  const id = String(formData.get("publicacaoId") ?? "");
  if (!id) redirect(`/configuracoes?erro=${encodeURIComponent("Publicação inválida.")}`);
  const dados = dadosBasePublicacao(formData);
  if (!dados.titulo || !dados.corpo) {
    redirect(`/configuracoes?erro=${encodeURIComponent("Preencha título e texto da publicação.")}`);
  }

  const antes = await prisma.publicacoes_site.findUnique({ where: { id } });
  if (!antes) redirect(`/configuracoes?erro=${encodeURIComponent("Publicação não encontrada.")}`);

  // Três cenários pra imagem: (1) o navegador já subiu um arquivo novo direto
  // pro Storage (ver prepararUploadImagemPublicacaoAction) e manda o caminho
  // aqui — troca e apaga a antiga pra não deixar lixo; (2) marcou "remover
  // imagem" sem escolher outra — só apaga e limpa o campo; (3) não mexeu em
  // nada — mantém a imagem que já estava.
  const imagemCaminho = String(formData.get("imagem_caminho") ?? "").trim();
  const removerImagem = formData.get("remover_imagem") === "on";
  let imagem_url = antes!.imagem_url;

  if (imagemCaminho) {
    imagem_url = publicUrlImagemPublicacao(imagemCaminho);
    await apagarImagemPublicacao(antes!.imagem_url);
  } else if (removerImagem) {
    await apagarImagemPublicacao(antes!.imagem_url);
    imagem_url = null;
  }

  await prisma.publicacoes_site.update({
    where: { id },
    data: { ...dados, imagem_url, updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "publicacoes_site",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: { ...dados, imagem_url }
  });

  revalidatePath("/configuracoes");
  revalidatePath("/login");
  revalidatePath("/portal");
  revalidatePath(`/noticias/${id}`);
  redirect("/configuracoes?salvo_publicacao=1");
}

export async function alternarAtivoPublicacaoAction(formData: FormData) {
  await requireAdminSession();
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
  revalidatePath("/portal");
}

// Excluir de verdade (não só desativar) — pedido explícito pra poder
// cancelar uma publicação sem deixar registro/arquivo parado ocupando
// espaço à toa. Some da tela e apaga também a imagem do Storage, se tiver.
export async function excluirPublicacaoAction(formData: FormData) {
  await requireAdminSession();
  const id = String(formData.get("publicacaoId") ?? "");
  if (!id) return;

  const antes = await prisma.publicacoes_site.findUnique({ where: { id } });
  if (!antes) return;

  await prisma.publicacoes_site.delete({ where: { id } });
  await apagarImagemPublicacao(antes.imagem_url);

  await logAlteracao({
    entidadeTipo: "publicacoes_site",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { titulo: antes.titulo }
  });

  revalidatePath("/configuracoes");
  revalidatePath("/login");
  revalidatePath("/portal");
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

// Erros de cadastro (logs_erro) — cada erro de salvamento (ex.: constraint do
// banco rejeitando um valor) fica registrado aqui pra dar pra consultar
// depois; "marcar visto" só tira da contagem de pendentes, não apaga nada.
export async function marcarErroVistoAction(formData: FormData) {
  await requireAdm();
  const id = String(formData.get("erroId") ?? "");
  if (!id) return;

  await prisma.logs_erro.update({
    where: { id },
    data: { visto: true }
  });

  revalidatePath("/configuracoes");
}
