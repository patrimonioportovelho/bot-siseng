import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signSession, verifySession } from "@/lib/session";
import { hashSenha, verificarSenha, logAcessoPortal } from "@/lib/auth";

const PORTAL_COOKIE = "sis_portal_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

// Domínio exigido pra logar no portal do corretor. Só entra quem tem esse
// email cadastrado na ficha de parceiro E função = "Corretor" — o mesmo
// parceiro pode inclusive não ter acesso ao admin (papéis diferentes).
const DOMINIO_PORTAL = "@remax.com.br";

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado no .env");
  return secret;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// parceiroId/nome deixaram de ser nullable: o portal não tem mais acesso
// anônimo (tela pública/lista de corretores) — toda sessão de portal
// corresponde a um corretor autenticado por email+senha.
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

type LoginPortalResult =
  | { ok: true }
  | { ok: false; pendente: true; error: string }
  | { ok: false; pendente: false; error: string };

// Login do portal do corretor — email + senha, com o mesmo mecanismo de
// hash (PBKDF2) e o mesmo fluxo de primeiro acesso do login admin (ver
// loginAdmin em lib/auth.ts), só que restrito a quem tem email
// "@remax.com.br" e função "Corretor" ativa no cadastro. Um parceiro que
// já tem senha definida (seja porque já usa o admin, seja porque já foi
// aprovado antes pelo portal) usa a mesma senha nos dois lugares — é o
// mesmo cadastro, só dois pontos de entrada diferentes.
export async function loginPortal(email: string, senha: string): Promise<LoginPortalResult> {
  const emailNorm = normalizeEmail(email);

  if (!emailNorm || !senha) {
    return { ok: false, pendente: false, error: "Informe email e senha." };
  }

  if (!emailNorm.endsWith(DOMINIO_PORTAL)) {
    return {
      ok: false,
      pendente: false,
      error: `O portal do corretor só aceita email ${DOMINIO_PORTAL}.`
    };
  }

  const parceiro = await prisma.parceiros.findFirst({
    where: {
      status_funcao: "Ativo",
      funcao: "Corretor",
      email: { equals: emailNorm, mode: "insensitive" }
    },
    select: { id: true, nome: true, senha_hash: true }
  });

  if (!parceiro) {
    return {
      ok: false,
      pendente: false,
      error:
        "Email não encontrado como Corretor ativo no cadastro. Peça para um administrador conferir sua ficha de parceiro (email e função)."
    };
  }

  if (parceiro.senha_hash) {
    const senhaOk = await verificarSenha(senha, parceiro.senha_hash);
    if (!senhaOk) {
      return { ok: false, pendente: false, error: "Senha incorreta." };
    }
    return await concederAcessoPortal(parceiro.id, parceiro.nome);
  }

  // Primeiro acesso — mesma solicitação pendente usada pelo login admin;
  // aparece em Configurações pra um admin aprovar, e a senha passa a valer
  // tanto no admin quanto no portal (é o mesmo campo parceiros.senha_hash).
  const senhaHash = await hashSenha(senha);
  const pendente = await prisma.solicitacoes_acesso.findFirst({
    where: { parceiro_id: parceiro.id, status: "pendente" }
  });

  if (pendente) {
    await prisma.solicitacoes_acesso.update({
      where: { id: pendente.id },
      data: {
        nome_informado: parceiro.nome,
        email_informado: emailNorm,
        senha_hash_informada: senhaHash,
        criado_em: new Date()
      }
    });
  } else {
    await prisma.solicitacoes_acesso.create({
      data: {
        parceiro_id: parceiro.id,
        nome_informado: parceiro.nome,
        email_informado: emailNorm,
        senha_hash_informada: senhaHash
      }
    });
  }

  return {
    ok: false,
    pendente: true,
    error:
      "Solicitação enviada! Assim que um administrador aprovar, você já consegue entrar no portal com esse email e senha."
  };
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
