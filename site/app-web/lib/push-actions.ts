"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { MODULOS_PUSH, notificarPessoa, pushConfigurado } from "@/lib/push";

type Resultado = { ok: true } | { ok: false; erro: string };

const MODULOS_VALIDOS = new Set<string>(MODULOS_PUSH.map((m) => m.id));

// Chave pública (VAPID) lida em tempo de execução — não precisa estar embutida no build.
export async function obterConfigPushAction(): Promise<{ disponivel: boolean; chave: string | null }> {
  await requireAdminSession();
  return { disponivel: pushConfigurado(), chave: process.env.VAPID_PUBLIC_KEY ?? null };
}

export async function obterModulosPushAction(endpoint: string): Promise<string[] | null> {
  const sessao = await requireAdminSession();
  const a = await prisma.push_assinaturas.findUnique({ where: { endpoint }, select: { parceiro_id: true, modulos: true } });
  return a && a.parceiro_id === sessao.parceiroId ? a.modulos : null;
}

export async function salvarAssinaturaPushAction(
  assinatura: { endpoint: string; p256dh: string; auth: string },
  userAgent: string | null
): Promise<Resultado> {
  const sessao = await requireAdminSession();
  if (!assinatura.endpoint.startsWith("https://") || !assinatura.p256dh || !assinatura.auth) return { ok: false, erro: "Assinatura inválida." };
  try {
    await prisma.push_assinaturas.upsert({
      where: { endpoint: assinatura.endpoint },
      create: { parceiro_id: sessao.parceiroId, endpoint: assinatura.endpoint, p256dh: assinatura.p256dh, auth: assinatura.auth, user_agent: userAgent?.slice(0, 300) ?? null },
      // o mesmo navegador pode mudar de pessoa (troca de login): passa a valer para quem está logado
      update: { parceiro_id: sessao.parceiroId, p256dh: assinatura.p256dh, auth: assinatura.auth, user_agent: userAgent?.slice(0, 300) ?? null }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível ativar." };
  }
}

export async function removerAssinaturaPushAction(endpoint: string): Promise<Resultado> {
  const sessao = await requireAdminSession();
  await prisma.push_assinaturas.deleteMany({ where: { endpoint, parceiro_id: sessao.parceiroId } });
  return { ok: true };
}

export async function salvarModulosPushAction(endpoint: string, modulos: string[]): Promise<Resultado> {
  const sessao = await requireAdminSession();
  const validos = modulos.filter((m) => MODULOS_VALIDOS.has(m));
  const r = await prisma.push_assinaturas.updateMany({ where: { endpoint, parceiro_id: sessao.parceiroId }, data: { modulos: validos } });
  return r.count > 0 ? { ok: true } : { ok: false, erro: "Aviso não encontrado neste navegador." };
}

export async function enviarTestePushAction(): Promise<Resultado> {
  const sessao = await requireAdminSession();
  if (!pushConfigurado()) return { ok: false, erro: "Avisos ainda não configurados no servidor." };
  const r = await notificarPessoa(sessao.parceiroId, {
    title: "SisEng — aviso de teste",
    body: "Funcionou! Você vai receber aqui as movimentações dos quadros.",
    url: "/dashboard",
    tag: "teste"
  });
  return r.enviados > 0 ? { ok: true } : { ok: false, erro: "Nenhum navegador ativado recebeu o teste." };
}
