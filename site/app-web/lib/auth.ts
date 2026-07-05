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

function admIds() {
  return (process.env.ADM_PARCEIRO_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type AdminSession = {
  parceiroId: string;
  nome: string;
  isAdm: boolean;
  iat: number;
  exp: number;
};

function normalizeCpf(cpf: string) {
  return cpf.replace(/\D/g, "");
}

function cpfValido(cpf: string | null | undefined) {
  return !!cpf && normalizeCpf(cpf).length === 11;
}

// Remove acentos, baixa caixa e junta espaços — pra aceitar variações de
// digitação (maiúsculas, acentos, espaços extras).
function normalizeNome(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function tokensNome(nome: string) {
  return normalizeNome(nome).split(" ").filter(Boolean);
}

// Compara dois nomes de forma tolerante: bate exato (já normalizado) ou,
// se um for uma versão parcial do outro (faltando sobrenome, por exemplo),
// aceita desde que todas as palavras do menor apareçam no maior, na mesma
// ordem relativa (evita "Ana Paula" bater com "Paula Ana", por ex.).
function nomesCompativeis(nomeCadastro: string, nomeDigitado: string) {
  const a = normalizeNome(nomeCadastro);
  const b = normalizeNome(nomeDigitado);
  if (a === b) return true;

  const tokensA = tokensNome(nomeCadastro);
  const tokensB = tokensNome(nomeDigitado);
  const [menor, maior] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  if (menor.length === 0) return false;

  let i = 0;
  for (const palavra of maior) {
    if (palavra === menor[i]) i++;
    if (i === menor.length) return true;
  }
  return false;
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

export async function requireAdm(): Promise<AdminSession> {
  const session = await requireAdminSession();
  if (!session.isAdm) redirect("/dashboard");
  return session;
}

type LoginResult =
  | { ok: true }
  | { ok: false; pendente: true; error: string }
  | { ok: false; pendente: false; error: string };

export async function loginAdmin(nomeCompleto: string, cpf: string): Promise<LoginResult> {
  const nomeNorm = normalizeNome(nomeCompleto);
  const cpfDigits = normalizeCpf(cpf);

  if (!nomeNorm || !cpfDigits) {
    return { ok: false, pendente: false, error: "Informe nome completo e CPF." };
  }

  // Não limitamos mais por função — qualquer parceiro ativo pode pedir acesso,
  // desde que o nome já esteja cadastrado.
  const candidatos = await prisma.parceiros.findMany({
    where: { status_funcao: "Ativo" },
    select: { id: true, nome: true, cpf: true }
  });

  const encontrados = candidatos.filter((p) => nomesCompativeis(p.nome, nomeCompleto));

  if (encontrados.length === 0) {
    return {
      ok: false,
      pendente: false,
      error: "Nome não encontrado no cadastro de parceiros. O nome precisa estar cadastrado para pedir acesso."
    };
  }

  // Se mais de um parceiro bateu com o nome digitado, prioriza quem já tem
  // CPF válido cadastrado e confere com o CPF informado (login direto).
  const comCpfBatendo = encontrados.find(
    (p) => cpfValido(p.cpf) && normalizeCpf(p.cpf!) === cpfDigits
  );

  if (comCpfBatendo) {
    return await concederAcesso(comCpfBatendo.id, comCpfBatendo.nome);
  }

  // Nenhum CPF bateu. Se algum encontrado já tem CPF válido cadastrado
  // (diferente do informado), é erro de CPF mesmo.
  const algumComCpfValido = encontrados.some((p) => cpfValido(p.cpf));
  if (algumComCpfValido) {
    return { ok: false, pendente: false, error: "CPF não confere com o cadastro." };
  }

  if (encontrados.length > 1) {
    return {
      ok: false,
      pendente: false,
      error: "Encontrei mais de um cadastro com esse nome. Peça para um administrador liberar seu acesso manualmente."
    };
  }

  // Único encontrado, sem CPF válido cadastrado ainda -> abre/atualiza
  // solicitação de acesso pendente, pra um ADM aprovar depois.
  const parceiro = encontrados[0];
  const pendente = await prisma.solicitacoes_acesso.findFirst({
    where: { parceiro_id: parceiro.id, status: "pendente" }
  });

  if (pendente) {
    await prisma.solicitacoes_acesso.update({
      where: { id: pendente.id },
      data: { nome_informado: nomeCompleto, cpf_informado: cpfDigits, criado_em: new Date() }
    });
  } else {
    await prisma.solicitacoes_acesso.create({
      data: { parceiro_id: parceiro.id, nome_informado: nomeCompleto, cpf_informado: cpfDigits }
    });
  }

  return {
    ok: false,
    pendente: true,
    error:
      "Solicitação enviada! Assim que um administrador aprovar, seu CPF fica registrado e você já consegue entrar normalmente."
  };
}

async function concederAcesso(parceiroId: string, nome: string): Promise<LoginResult> {
  const now = Date.now();
  const payload: AdminSession = {
    parceiroId,
    nome,
    isAdm: admIds().includes(parceiroId),
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
    data: { parceiro_id: parceiroId, tipo_portal: "admin", acao: "login" }
  });

  return { ok: true };
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

export async function listarSolicitacoesPendentes() {
  await requireAdm();
  return prisma.solicitacoes_acesso.findMany({
    where: { status: "pendente" },
    orderBy: { criado_em: "asc" },
    include: { parceiros_solicitacoes_acesso_parceiro_idToparceiros: true }
  });
}

export async function aprovarSolicitacaoAction(solicitacaoId: string) {
  const admin = await requireAdm();

  const solicitacao = await prisma.solicitacoes_acesso.findUnique({
    where: { id: solicitacaoId }
  });
  if (!solicitacao || solicitacao.status !== "pendente") return;

  await prisma.$transaction([
    prisma.parceiros.update({
      where: { id: solicitacao.parceiro_id },
      data: { cpf: solicitacao.cpf_informado }
    }),
    prisma.solicitacoes_acesso.update({
      where: { id: solicitacaoId },
      data: { status: "aprovado", decidido_em: new Date(), decidido_por_parceiro_id: admin.parceiroId }
    })
  ]);

  await logAlteracao({
    entidadeTipo: "parceiros",
    entidadeId: solicitacao.parceiro_id,
    acao: "aprovar_acesso",
    dadosDepois: { cpf: solicitacao.cpf_informado }
  });
}

export async function rejeitarSolicitacaoAction(solicitacaoId: string) {
  const admin = await requireAdm();

  await prisma.solicitacoes_acesso.updateMany({
    where: { id: solicitacaoId, status: "pendente" },
    data: { status: "rejeitado", decidido_em: new Date(), decidido_por_parceiro_id: admin.parceiroId }
  });
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
