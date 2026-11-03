"use server";

import { prisma } from "@/lib/prisma";
import { logAlteracao, requireEdicao } from "@/lib/auth";
import { enviarUmPeloResend } from "@/lib/email";
import { criarUploadAssinadoImagemEmail } from "@/lib/supabase-admin";
import { montarHtmlDisparo, normalizarLink, type ConteudoDisparo } from "@/lib/documentos/disparo-email";
import {
  MAXIMO_DESTINATARIOS,
  ORDENS_CLIENTES,
  emailValido,
  resolverDestinatarios,
  type FiltroDisparo
} from "@/lib/documentos/disparo-email-servidor";

// Tudo aqui exige poder editar o módulo Documentos (Diretor e Administrativo).

export type MensagemDisparoEntrada = {
  assunto: string;
  remetenteNome: string;
  responderPara: string;
  titulo: string;
  mensagem: string;
  imagemUrl: string | null;
  linkUrl: string;
  linkTexto: string;
};

function validarMensagem(m: MensagemDisparoEntrada): { erro: string } | { conteudo: ConteudoDisparo; linkUrl: string | null; replyTo: string | null } {
  if (!m.assunto.trim()) return { erro: "Escreva o assunto do e-mail." };
  if (m.assunto.length > 200) return { erro: "O assunto está grande demais (máximo 200 caracteres)." };
  if (!m.mensagem.trim() && !m.imagemUrl) return { erro: "Escreva a mensagem ou coloque uma imagem." };
  if (m.mensagem.length > 8000) return { erro: "A mensagem está grande demais (máximo 8.000 caracteres)." };
  const linkUrl = m.linkUrl.trim() ? normalizarLink(m.linkUrl) : null;
  if (m.linkUrl.trim() && !linkUrl) return { erro: "O link não é válido. Use um endereço completo, como https://meusite.com.br/pagina." };
  const replyTo = m.responderPara.trim();
  if (replyTo && !emailValido(replyTo)) return { erro: "O e-mail de resposta não é válido." };
  return {
    conteudo: { titulo: m.titulo, mensagem: m.mensagem, imagemUrl: m.imagemUrl, linkUrl, linkTexto: m.linkTexto },
    linkUrl,
    replyTo: replyTo || null
  };
}

function validarFiltro(f: FiltroDisparo): FiltroDisparo {
  return {
    funcoes: Array.isArray(f.funcoes) ? f.funcoes.filter((x) => typeof x === "string") : [],
    clientes:
      f.clientes && Number.isFinite(f.clientes.quantidade) && f.clientes.quantidade > 0
        ? {
            quantidade: Math.floor(f.clientes.quantidade),
            ordem: ORDENS_CLIENTES.includes(f.clientes.ordem) ? f.clientes.ordem : "recentes"
          }
        : null
  };
}

export async function prepararUploadImagemEmailAction(): Promise<
  { ok: true; caminho: string; token: string; urlPublica: string } | { ok: false; erro: string }
> {
  await requireEdicao("documentos");
  try {
    return { ok: true, ...(await criarUploadAssinadoImagemEmail()) };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Falha ao preparar o upload da imagem." };
  }
}

// Quantos e-mails sairiam com essas escolhas (já sem repetidos nem inválidos).
export async function contarDestinatariosAction(filtro: FiltroDisparo): Promise<{ total: number; parceiros: number; clientes: number }> {
  await requireEdicao("documentos");
  const lista = await resolverDestinatarios(validarFiltro(filtro));
  return {
    total: lista.length,
    parceiros: lista.filter((d) => d.tipo === "parceiro").length,
    clientes: lista.filter((d) => d.tipo === "cliente").length
  };
}

// Um e-mail de teste, igual ao que sai no disparo (conta na cota do Resend).
export async function enviarTesteDisparoAction(
  mensagem: MensagemDisparoEntrada,
  para: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  await requireEdicao("documentos");
  if (!emailValido(para)) return { ok: false, erro: "Informe um e-mail válido para receber o teste." };
  const v = validarMensagem(mensagem);
  if ("erro" in v) return { ok: false, erro: v.erro };
  const r = await enviarUmPeloResend({
    to: para.trim(),
    subject: `[TESTE] ${mensagem.assunto.trim()}`,
    html: montarHtmlDisparo(v.conteudo, mensagem.assunto.trim()),
    replyTo: v.replyTo ?? undefined,
    nomeRemetente: mensagem.remetenteNome
  });
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}

// Cria o disparo e a fila de destinatários. O envio em si é feito, em lotes, pela
// rota /documentos/disparo-email/lote (a tela chama até terminar).
export async function criarDisparoEmailAction(
  mensagem: MensagemDisparoEntrada,
  filtroBruto: FiltroDisparo
): Promise<{ ok: true; disparoId: string; total: number } | { ok: false; erro: string }> {
  const admin = await requireEdicao("documentos");
  const v = validarMensagem(mensagem);
  if ("erro" in v) return { ok: false, erro: v.erro };
  const filtro = validarFiltro(filtroBruto);

  const destinatarios = await resolverDestinatarios(filtro);
  if (destinatarios.length === 0) return { ok: false, erro: "Nenhum destinatário com e-mail válido nas opções marcadas." };
  if (destinatarios.length > MAXIMO_DESTINATARIOS) {
    return { ok: false, erro: `Muitos destinatários de uma vez (${destinatarios.length}). O máximo por disparo é ${MAXIMO_DESTINATARIOS}.` };
  }

  const html = montarHtmlDisparo(v.conteudo, mensagem.assunto.trim());
  const disparo = await prisma.disparos_email.create({
    data: {
      assunto: mensagem.assunto.trim(),
      remetente_nome: mensagem.remetenteNome.replace(/["<>\r\n]/g, "").trim() || "SisEng",
      responder_para: v.replyTo,
      html,
      imagem_url: mensagem.imagemUrl,
      link_url: v.linkUrl,
      filtros: filtro as object,
      total: destinatarios.length,
      criado_por: admin.parceiroId,
      destinatarios: { create: destinatarios.map((d) => ({ tipo: d.tipo, nome: d.nome, email: d.email })) }
    },
    select: { id: true }
  });

  await logAlteracao({
    entidadeTipo: "disparos_email",
    entidadeId: disparo.id,
    acao: "criar_disparo_email",
    dadosDepois: { assunto: mensagem.assunto.trim(), total: destinatarios.length, filtro }
  }).catch(() => undefined);

  return { ok: true, disparoId: disparo.id, total: destinatarios.length };
}

// "Continuar envio" de um disparo pausado ou interrompido: volta ao estado de envio.
export async function retomarDisparoEmailAction(disparoId: string): Promise<{ ok: true; pendentes: number } | { ok: false; erro: string }> {
  await requireEdicao("documentos");
  const d = await prisma.disparos_email.findUnique({ where: { id: disparoId }, select: { id: true } });
  if (!d) return { ok: false, erro: "Disparo não encontrado." };
  const pendentes = await prisma.disparos_email_destinatarios.count({ where: { disparo_id: disparoId, status: "pendente" } });
  if (pendentes === 0) return { ok: false, erro: "Este disparo não tem mais e-mails pendentes." };
  await prisma.disparos_email.update({ where: { id: disparoId }, data: { status: "enviando", motivo_pausa: null } });
  return { ok: true, pendentes };
}
