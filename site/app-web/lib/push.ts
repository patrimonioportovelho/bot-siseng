import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// Avisos na tela (Web Push): o "quadradinho no canto" do sistema operacional,
// que aparece mesmo com o SisEng em outra aba ou com o navegador minimizado
// (o navegador precisa estar aberto). Quem recebe é quem ativou o aviso no sino
// do Topbar; a pessoa que fez a movimentação não recebe o próprio aviso.

export const MODULOS_PUSH = [
  { id: "financiamento", rotulo: "Financiamento" },
  { id: "recrutamento", rotulo: "Recrutamento" },
  { id: "manutencao", rotulo: "Manutenção" },
  { id: "gestao", rotulo: "Gestões" },
  { id: "marketing", rotulo: "Marketing" },
  { id: "portal", rotulo: "Novos cadastros do portal" }
] as const;

export type ModuloPush = (typeof MODULOS_PUSH)[number]["id"];

export function pushConfigurado(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configurado = false;
function configurar() {
  if (configurado) return true;
  if (!pushConfigurado()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contato@remax.com.br", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configurado = true;
  return true;
}

export type PayloadPush = { title: string; body: string; url: string; tag?: string };

type Assinatura = { id: string; endpoint: string; p256dh: string; auth: string };

async function enviarPara(assinaturas: Assinatura[], payload: PayloadPush) {
  if (assinaturas.length === 0 || !configurar()) return { enviados: 0, removidos: 0 };
  const texto = JSON.stringify(payload);
  const expiradas: string[] = [];
  let enviados = 0;
  await Promise.all(
    assinaturas.map(async (a) => {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, texto, { TTL: 60 * 60 * 12 });
        enviados += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410: o navegador cancelou a assinatura — apaga para não tentar de novo.
        if (status === 404 || status === 410) expiradas.push(a.id);
      }
    })
  );
  if (expiradas.length > 0) await prisma.push_assinaturas.deleteMany({ where: { id: { in: expiradas } } }).catch(() => {});
  return { enviados, removidos: expiradas.length };
}

// Aviso de movimentação para todos que ativaram o módulo (menos quem fez).
// Nunca lança erro: aviso é complemento, não pode derrubar a ação principal.
export async function notificarModulo(params: {
  modulo: ModuloPush;
  titulo: string;
  corpo: string;
  url: string;
  atorParceiroId?: string | null;
  tag?: string;
}) {
  try {
    const assinaturas = await prisma.push_assinaturas.findMany({
      where: {
        modulos: { has: params.modulo },
        ...(params.atorParceiroId ? { parceiro_id: { not: params.atorParceiroId } } : {})
      },
      select: { id: true, endpoint: true, p256dh: true, auth: true }
    });
    await enviarPara(assinaturas, { title: params.titulo, body: params.corpo, url: params.url, tag: params.tag });
  } catch {
    // ignora
  }
}

// Aviso de teste para os navegadores de uma pessoa.
export async function notificarPessoa(parceiroId: string, payload: PayloadPush) {
  const assinaturas = await prisma.push_assinaturas.findMany({
    where: { parceiro_id: parceiroId },
    select: { id: true, endpoint: true, p256dh: true, auth: true }
  });
  return enviarPara(assinaturas, payload);
}
