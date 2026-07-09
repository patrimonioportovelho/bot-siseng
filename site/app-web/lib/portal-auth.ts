import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signSession, verifySession } from "@/lib/session";
import { logAcessoPortal } from "@/lib/auth";

const PORTAL_COOKIE = "sis_portal_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

// Domínio exigido pra logar no portal do corretor. Só entra quem tem esse
// email cadastrado na ficha de parceiro E função = "Corretor" (ativa) — o
// mesmo parceiro pode inclusive não ter acesso ao admin (papéis diferentes).
// Sem senha: o acesso é liberado só por conferir email + função + status no
// cadastro administrativo (é o próprio administrativo que controla quem
// entra, cadastrando ou desativando o parceiro).
const DOMINIO_PORTAL = "@remax.com.br";

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado no .env");
  return secret;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// parceiroId/nome não são nullable: o portal não tem acesso anônimo — toda
// sessão de portal corresponde a um corretor identificado por email.
export type PortalSession = {
  tipo: "corretor";
  parceiroId: string;
  nome: string;
  iat: number;
  exp: number;
};

export async function getPortalSession(): Promise<PortalSession | null> {
  const store = await cookies();
  const token = store.get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  return verifySession<PortalSession>(token, sessionSecret());
}

export async function requirePortalSession(): Promise<PortalSession> {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  return session;
}

type LoginPortalResult = { ok: true } | { ok: false; error: string };

// Login do portal do corretor — só o email, sem senha. Libera acesso quem
// tiver email "@remax.com.br" e função "Corretor" ativa no cadastro de
// parceiros; quem não estiver cadastrado assim (função errada, inativo, ou
// email não encontrado) não entra.
export async function loginPortal(email: string): Promise<LoginPortalResult> {
  const emailNorm = normalizeEmail(email);

  if (!emailNorm) {
    return { ok: false, error: "Informe seu email." };
  }

  if (!emailNorm.endsWith(DOMINIO_PORTAL)) {
    return { ok: false, error: `O portal do corretor só aceita email ${DOMINIO_PORTAL}.` };
  }

  const parceiro = await prisma.parceiros.findFirst({
    where: {
      status_funcao: "Ativo",
      funcao: "Corretor",
      email: { equals: emailNorm, mode: "insensitive" }
    },
    select: { id: true, nome: true }
  });

  if (!parceiro) {
    return {
      ok: false,
      error:
        "Email não encontrado como Corretor ativo no cadastro. Peça para um administrador conferir sua ficha de parceiro (email e função)."
    };
  }

  return await concederAcessoPortal(parceiro.id, parceiro.nome);
}

async function concederAcessoPortal(parceiroId: string, nome: string): Promise<LoginPortalResult> {
  const now = Date.now();
  const payload: PortalSession = {
    tipo: "corretor",
    parceiroId,
    nome,
    iat: now,
    exp: now + SESSION_TTL_MS
  };
  const token = await signSession(payload, sessionSecret());

  const store = await cookies();
  store.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000
  });

  await logAcessoPortal(parceiroId, "login");

  return { ok: true };
}

export async function logoutPortal() {
  const session = await getPortalSession();
  const store = await cookies();
  store.delete(PORTAL_COOKIE);
  if (session) {
    await logAcessoPortal(session.parceiroId, "logout");
  }
}
