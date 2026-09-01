import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signSession, verifySession, sessaoExpiradaPeloResetDiario } from "@/lib/session";
import { checarBloqueioLogin, registrarTentativaFalha, limparTentativas } from "@/lib/rate-limit";

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

// Acesso completo (isAdm) = está na lista fixa do servidor (ADM_PARCEIRO_IDS
// — rede de segurança, sempre funciona mesmo que o campo abaixo seja mexido
// errado) OU tem parceiros.acesso_completo marcado (editável em
// Configurações > Acesso completo, pedido do usuário 31/08/2026 — antes só
// dava pra conceder isso mexendo na variável de ambiente).
async function isAdmDoParceiro(parceiroId: string): Promise<boolean> {
  if (admIds().includes(parceiroId)) return true;
  const parceiro = await prisma.parceiros.findUnique({
    where: { id: parceiroId },
    select: { acesso_completo: true }
  });
  return parceiro?.acesso_completo ?? false;
}

// Exportado só pra tela de Configurações mostrar, ao lado de cada parceiro,
// quando o acesso completo dele vem fixo do servidor (ADM_PARCEIRO_IDS) em
// vez do campo editável ali — pra não confundir quem for mexer na lista.
export function idsAcessoCompletoFixo(): string[] {
  return admIds();
}

export type AdminSession = {
  parceiroId: string;
  nome: string;
  isAdm: boolean;
  iat: number;
  exp: number;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// Hash de senha com PBKDF2 (Web Crypto, já disponível no runtime do Node —
// sem precisar adicionar bcrypt/argon2 como dependência nova).
//
// Formato salvo (achado "Médio" da auditoria de 01/08/2026): antes era fixo
// "<salt em hex>:<hash em hex>", com a contagem de iterações hardcoded em
// 100_000 (abaixo da recomendação atual da OWASP, 600_000+ pro PBKDF2-SHA256
// — 100k reduz o custo de um ataque offline de força bruta se o hash
// vazasse do banco). Pra subir a contagem SEM quebrar login de quem já tem
// senha (não dá pra recalcular hash de senha que a gente não guarda em
// texto puro), o formato novo passou a incluir a própria contagem:
// "<iterações>:<salt em hex>:<hash em hex>". Hash antigo (2 partes, sem
// contagem) continua verificado com 100_000 — só troca pro formato/contagem
// nova depois de um login bem-sucedido (ver rehashSeNecessario mais abaixo),
// de forma gradual e transparente, sem exigir reset de senha de ninguém.
const PBKDF2_ITERACOES_ATUAL = 600_000;
const PBKDF2_ITERACOES_LEGADO = 100_000;

async function derivarBits(senha: string, salt: Uint8Array, iteracoes: number): Promise<ArrayBuffer> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  // Cast só de tipo (sem efeito em runtime) — o lib.dom.d.ts do TS atual
  // ficou mais estrito sobre o generic de Uint8Array vs BufferSource
  // (ArrayBufferLike inclui SharedArrayBuffer, que BufferSource não aceita).
  // A Web Crypto API sempre aceitou um Uint8Array normal aqui.
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations: iteracoes, hash: "SHA-256" }, chave, 256);
}

export async function hashSenha(senha: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derivarBits(senha, salt, PBKDF2_ITERACOES_ATUAL);
  return `${PBKDF2_ITERACOES_ATUAL}:${Buffer.from(salt).toString("hex")}:${Buffer.from(bits).toString("hex")}`;
}

// Exportado para o lib/portal-auth.ts reusar a mesma verificação de senha
// (PBKDF2) no login do portal do corretor — mesmo mecanismo, sem duplicar.
export async function verificarSenha(senha: string, hashArmazenado: string | null): Promise<boolean> {
  if (!hashArmazenado) return false;
  const partes = hashArmazenado.split(":");

  let iteracoes: number;
  let saltHex: string;
  let hashHex: string;
  if (partes.length === 3) {
    [iteracoes, saltHex, hashHex] = [Number(partes[0]), partes[1], partes[2]] as [number, string, string];
  } else if (partes.length === 2) {
    iteracoes = PBKDF2_ITERACOES_LEGADO;
    [saltHex, hashHex] = partes as [string, string];
  } else {
    return false;
  }
  if (!Number.isFinite(iteracoes) || !saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const bits = await derivarBits(senha, salt, iteracoes);

  // Comparação constant-time (achado "Baixo" da auditoria de 01/08/2026):
  // "===" entre strings pode retornar mais rápido quando o primeiro
  // caractere já diverge, o que teoricamente vaza informação por tempo de
  // resposta. timingSafeEqual exige buffers do mesmo tamanho — se o hash
  // guardado tiver tamanho diferente (corrompido/formato inesperado), já é
  // seguro dizer que não bate, sem chamar timingSafeEqual.
  const calculado = Buffer.from(bits);
  const armazenado = Buffer.from(hashHex, "hex");
  if (calculado.length !== armazenado.length) return false;
  return timingSafeEqual(calculado, armazenado);
}

// true quando o hash guardado ainda está no formato/contagem antiga — quem
// chama (loginAdmin/loginPortal) usa isso pra, só depois de confirmar a
// senha certa, recalcular e gravar um hash novo com a contagem atual.
export function precisaRehash(hashArmazenado: string | null): boolean {
  if (!hashArmazenado) return false;
  const partes = hashArmazenado.split(":");
  if (partes.length !== 3) return true;
  return Number(partes[0]) < PBKDF2_ITERACOES_ATUAL;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession<AdminSession>(token, sessionSecret());
  if (!session) return null;
  // Reset diário às 3h (Porto Velho) — ver lib/session.ts. O middleware já
  // barra isso na maioria das rotas, mas Server Actions podem ser chamadas
  // fora do caminho normal (revalidação, etc.), por isso checa de novo aqui.
  if (sessaoExpiradaPeloResetDiario(session.iat)) return null;
  return session;
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

type LoginResult = { ok: true } | { ok: false; error: string };

// Login por Email + Senha (substituiu o antigo Nome + CPF — bater CPF
// exigia que a pessoa já tivesse CPF cadastrado, o que travava quem ainda
// não tinha, ex.: colaborador administrativo recém-entrado). O e-mail
// identifica o parceiro sem ambiguidade (sem a comparação "tolerante" de
// nomes de antes).
//
// Diferente do portal do corretor (ver loginPortal em lib/portal-auth.ts),
// aqui NÃO tem autoatendimento no primeiro acesso — pedido explícito do
// usuário: "o acesso ao administrativo, só se o administrador passar a
// senha". Sem senha definida, a pessoa é só informada de que precisa pedir
// pra um administrador cadastrar a senha inicial em Configurações (mesma
// tela que já existia pra isso — "Definir senha manualmente"). O fluxo antigo
// de "solicitação de acesso" (solicitacoes_acesso) continua existindo só pra
// quem já tinha um pedido pendente de antes dessa mudança — não é mais
// alimentado por login nenhum.
export async function loginAdmin(email: string, senha: string): Promise<LoginResult> {
  const emailNorm = normalizeEmail(email);

  if (!emailNorm || !senha) {
    return { ok: false, error: "Informe email e senha." };
  }

  // Rate limiting (achado "Alto" da auditoria de 01/08/2026): bloqueia por
  // um tempo depois de várias tentativas erradas seguidas pro mesmo email —
  // ver lib/rate-limit.ts.
  const bloqueio = checarBloqueioLogin(emailNorm);
  if (bloqueio.bloqueado) {
    return {
      ok: false,
      error: `Muitas tentativas erradas. Tente de novo em ${bloqueio.minutosRestantes} minuto(s).`
    };
  }

  const parceiro = await prisma.parceiros.findFirst({
    where: {
      status_funcao: "Ativo",
      email: { equals: emailNorm, mode: "insensitive" }
    },
    select: { id: true, nome: true, senha_hash: true }
  });

  if (!parceiro) {
    registrarTentativaFalha(emailNorm);
    return {
      ok: false,
      error:
        "Email não encontrado no cadastro de parceiros. Peça para um administrador cadastrar seu email na ficha de parceiro."
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
    registrarTentativaFalha(emailNorm);
    return { ok: false, error: "Senha incorreta." };
  }
  limparTentativas(emailNorm);

  // Migração gradual e transparente pra contagem de iterações nova (ver
  // comentário em hashSenha) — só acontece depois de confirmar a senha
  // certa, nunca bloqueia o login se der algum erro salvando.
  if (precisaRehash(parceiro.senha_hash)) {
    const novoHash = await hashSenha(senha);
    await prisma.parceiros.update({ where: { id: parceiro.id }, data: { senha_hash: novoHash } }).catch(() => {});
  }

  return await concederAcesso(parceiro.id, parceiro.nome);
}

async function concederAcesso(parceiroId: string, nome: string): Promise<LoginResult> {
  const now = Date.now();
  const payload: AdminSession = {
    parceiroId,
    nome,
    isAdm: await isAdmDoParceiro(parceiroId),
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
      data: { senha_hash: solicitacao.senha_hash_informada }
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
    dadosDepois: { email: solicitacao.email_informado }
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

// Variantes de log para o portal do corretor — o portal usa um cookie de
// sessão diferente (sis_portal_session, ver lib/portal-auth.ts), então
// recebem o parceiroId explícito em vez de ler o cookie de admin. Usado
// pra registrar todo login do corretor e todo documento que ele gerar
// (ex.: contrato de gestão), visível em Configurações > Logs junto com os
// logs do admin.
export async function logAcessoPortal(parceiroId: string, acao: "login" | "logout" = "login") {
  await prisma.logs_acesso.create({
    data: { parceiro_id: parceiroId, tipo_portal: "corretor", acao }
  });
}

export async function logAlteracaoPortal(params: {
  parceiroId: string;
  entidadeTipo: string;
  entidadeId?: string | null;
  acao: string;
  dadosAntes?: unknown;
  dadosDepois?: unknown;
}) {
  await prisma.logs_alteracao.create({
    data: {
      parceiro_id: params.parceiroId,
      entidade_tipo: params.entidadeTipo,
      entidade_id: params.entidadeId ?? null,
      acao: params.acao,
      dados_antes: params.dadosAntes === undefined ? undefined : (params.dadosAntes as object),
      dados_depois: params.dadosDepois === undefined ? undefined : (params.dadosDepois as object)
    }
  });
}
