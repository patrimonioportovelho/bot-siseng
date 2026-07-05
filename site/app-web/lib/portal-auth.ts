import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signSession, verifySession } from "@/lib/session";

const PORTAL_COOKIE = "sis_portal_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado no .env");
  return secret;
}

export type PortalSession = {
  tipo: "corretor";
  parceiroId: string | null;
  nome: string | null;
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

export async function loginPortal(senha: string, parceiroId: string | null) {
  const senhaCorreta = process.env.PORTAL_CORRETOR_SENHA;
  if (!senhaCorreta) {
    return { ok: false as const, error: "Senha do portal não configurada. Avise o administrador." };
  }
  if (senha !== senhaCorreta) {
    return { ok: false as const, error: "Senha incorreta." };
  }

  let nome: string | null = null;
  if (parceiroId) {
    const parceiro = await prisma.parceiros.findUnique({
      where: { id: parceiroId },
      select: { nome: true }
    });
    nome = parceiro?.nome ?? null;
  }

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

  if (parceiroId) {
    await prisma.logs_acesso.create({
      data: { parceiro_id: parceiroId, tipo_portal: "corretor", acao: "login" }
    });
  }

  return { ok: true as const };
}

export async function logoutPortal() {
  const store = await cookies();
  store.delete(PORTAL_COOKIE);
}
