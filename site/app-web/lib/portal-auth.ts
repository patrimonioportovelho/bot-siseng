import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signSession, verifySession, sessaoExpiradaPeloResetDiario } from "@/lib/session";
import { logAcessoPortal, hashSenha, verificarSenha } from "@/lib/auth";

const PORTAL_COOKIE = "sis_portal_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

// Domínio exigido pra logar no portal do corretor. Só entra quem tem esse
// email cadastrado na ficha de parceiro, função = "Corretor" (ativa) E a
// senha certa (ver loginPortal abaixo) — o mesmo parceiro pode inclusive
// não ter acesso ao admin (papéis diferentes).
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
  const session = await verifySession<PortalSession>(token, sessionSecret());
  if (!session) return null;
  // Reset diário às 3h (Porto Velho) — ver lib/session.ts. O middleware já
  // barra isso na maioria das rotas, mas Server Actions podem ser chamadas
  // fora do caminho normal (revalidação, etc.), por isso checa de novo aqui.
  if (sessaoExpiradaPeloResetDiario(session.iat)) return null;
  return session;
}

export async function requirePortalSession(): Promise<PortalSession> {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  return session;
}

type LoginPortalResult = { ok: true } | { ok: false; error: string };

// Login do portal do corretor — email + senha. A senha usa o mesmo campo
// (parceiros.senha_hash) e o mesmo hash (PBKDF2, lib/auth.ts) do login
// administrativo: é a MESMA senha nos dois acessos, quando o corretor tem
// os dois. Continua exigindo email "@remax.com.br" e função "Corretor"
// ativa no cadastro — isso não mudou, é só mais uma camada.
//
// Diferente do admin, o portal não tem fluxo de "solicitação pendente" pra
// primeiro acesso: quem define a senha inicial (e reseta se o corretor
// esquecer) é um administrador, na tela Configurações > "Definir senha
// manualmente" — já existe, não precisou de nada novo. Se o corretor ainda
// não tem senha definida, a mensagem de erro deixa isso claro.
export async function loginPortal(email: string, senha: string): Promise<LoginPortalResult> {
  const emailNorm = normalizeEmail(email);

  if (!emailNorm || !senha) {
    return { ok: false, error: "Informe seu email e sua senha." };
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
    select: { id: true, nome: true, senha_hash: true }
  });

  if (!parceiro) {
    return {
      ok: false,
      error:
        "Email não encontrado como Corretor ativo no cadastro. Peça para um administrador conferir sua ficha de parceiro (email e função)."
    };
  }

  if (!parceiro.senha_hash) {
    return {
      ok: false,
      error: "Você ainda não tem senha definida. Peça para um administrador definir sua senha inicial em Configurações."
    };
  }

  const senhaOk = await verificarSenha(senha, parceiro.senha_hash);
  if (!senhaOk) {
    return { ok: false, error: "Senha incorreta." };
  }

  return await concederAcessoPortal(parceiro.id, parceiro.nome);
}

// Troca de senha feita pelo próprio corretor, já logado no portal — pede a
// senha atual (evita que alguém com a sessão aberta numa máquina compartilhada
// troque a senha sem saber a atual) e grava o novo hash no mesmo campo
// senha_hash (então também atualiza a senha de admin, se o corretor tiver).
export async function trocarSenhaPortal(
  parceiroId: string,
  senhaAtual: string,
  senhaNova: string
): Promise<LoginPortalResult> {
  if (!senhaAtual || !senhaNova) {
    return { ok: false, error: "Preencha a senha atual e a nova senha." };
  }
  if (senhaNova.length < 6) {
    return { ok: false, error: "A nova senha precisa ter pelo menos 6 caracteres." };
  }

  const parceiro = await prisma.parceiros.findUnique({
    where: { id: parceiroId },
    select: { senha_hash: true }
  });

  if (!parceiro?.senha_hash || !(await verificarSenha(senhaAtual, parceiro.senha_hash))) {
    return { ok: false, error: "Senha atual incorreta." };
  }

  const novoHash = await hashSenha(senhaNova);
  await prisma.parceiros.update({ where: { id: parceiroId }, data: { senha_hash: novoHash } });

  return { ok: true };
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
