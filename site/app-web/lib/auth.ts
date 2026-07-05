import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signSession, verifySession } from "@/lib/session";

const ADMIN_COOKIE = "sis_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado no .env");
  return secret;
}

export type AdminSession = {
  parceiroId: string;
  nome: string;
  iat: number;
  exp: number;
};

function normalizeCpf(cpf: string) {
  return cpf.replace(/\D/g, "");
}

function normalizeNome(nome: string) {
  return nome.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return verifySession<AdminSession>(token, sessionSecret());
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  return session;
}

export async function loginAdmin(nomeCompleto: string, cpf: string) {
  const nomeNorm = normalizeNome(nomeCompleto);
  const cpfDigits = normalizeCpf(cpf);

  if (!nomeNorm || !cpfDigits) {
    return { ok: false as const, error: "Informe nome completo e CPF." };
  }

  const candidatos = await prisma.parceiros.findMany({
    where: { funcao: "Administrativo", status_funcao: "Ativo" },
    select: { id: true, nome: true, cpf: true }
  });

  const porNome = candidatos.filter((p) => normalizeNome(p.nome) === nomeNorm);

  // Se já tem CPF cadastrado, o CPF informado precisa bater. Se ainda não tem
  // (situação inicial, antes de cadastrarem os CPFs em Configurações), aceita
  // só pelo nome — dá pra entrar, ir em Configurações e cadastrar o próprio
  // CPF na hora, sem depender de mais ninguém pra isso.
  const encontrado =
    porNome.find((p) => p.cpf && normalizeCpf(p.cpf) === cpfDigits) ??
    porNome.find((p) => !p.cpf);

  if (!encontrado) {
    return {
      ok: false as const,
      error: "Nome ou CPF não conferem com nenhum administrativo ativo cadastrado."
    };
  }

  const now = Date.now();
  const payload: AdminSession = {
    parceiroId: encontrado.id,
    nome: encontrado.nome,
    iat: now,
    exp: now + SESSION_TTL_MS
  };
  const token = await signSession(payload, sessionSecret());

  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000
  });

  await prisma.logs_acesso.create({
    data: { parceiro_id: encontrado.id, tipo_portal: "admin", acao: "login" }
  });

  return { ok: true as const };
}

export async function logoutAdmin() {
  const session = await getAdminSession();
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  if (session) {
    await prisma.logs_acesso.create({
      data: { parceiro_id: session.parceiroId, tipo_portal: "admin", acao: "logout" }
    });
  }
}

// Chame isso em toda Server Action que criar/editar/excluir algo, para manter
// o log de auditoria (quem fez o quê e quando).
export async function logAlteracao(params: {
  entidadeTipo: string;
  entidadeId?: string | null;
  acao: string;
  dadosAntes?: unknown;
  dadosDepois?: unknown;
}) {
  const session = await getAdminSession();
  await prisma.logs_alteracao.create({
    data: {
      parceiro_id: session?.parceiroId ?? null,
      entidade_tipo: params.entidadeTipo,
      entidade_id: params.entidadeId ?? null,
      acao: params.acao,
      dados_antes: params.dadosAntes === undefined ? undefined : (params.dadosAntes as object),
      dados_depois: params.dadosDepois === undefined ? undefined : (params.dadosDepois as object)
    }
  });
}
