// Sessão simples assinada por HMAC-SHA256, usando só Web Crypto (funciona
// tanto no runtime Edge do middleware quanto no runtime Node das Server
// Actions/Server Components — sem depender de nenhuma lib externa).

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSession(payload: Record<string, unknown>, secret: string): Promise<string> {
  const bodyB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(bodyB64));
  const sigB64 = toBase64Url(new Uint8Array(sig));
  return `${bodyB64}.${sigB64}`;
}

export async function verifySession<T = Record<string, unknown>>(
  token: string,
  secret: string
): Promise<T | null> {
  const [bodyB64, sigB64] = token.split(".");
  if (!bodyB64 || !sigB64) return null;

  try {
    const key = await getKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sigB64) as BufferSource,
      encoder.encode(bodyB64)
    );
    if (!ok) return null;

    const payload = JSON.parse(decoder.decode(fromBase64Url(bodyB64))) as T & { exp?: number };
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// Reset diário de sessão: todo mundo (portal do corretor + administrativo)
// precisa logar de novo todo dia às 3h da manhã, horário de Porto Velho —
// pedido explícito, independente do TTL normal de cada sessão (7 dias no
// portal, 12h no admin). Não usa cron nenhum: o corte é recalculado a cada
// verificação de sessão, comparando o "iat" (quando a sessão foi emitida)
// com o horário do último 3h que já passou. Funciona tanto no runtime Edge
// do middleware quanto no runtime Node das Server Actions/Components (só
// depende de Intl, disponível nos dois).
//
// Porto Velho (RO) fica em UTC-4 o ano todo (Brasil não tem mais horário de
// verão desde 2019) — por isso dá pra reconstruir o instante em UTC direto,
// sem depender de tabela de fuso horário.
const FUSO_PORTO_VELHO_HORAS = 4; // UTC = horário local + 4h
const HORA_DO_RESET = 3;

function partesAgoraPortoVelho(agora: Date): { ano: number; mes: number; dia: number; hora: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Porto_Velho",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(agora);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return { ano: valor("year"), mes: valor("month"), dia: valor("day"), hora: valor("hour") };
}

// Timestamp (ms desde epoch, UTC) do último "3h da manhã em Porto Velho" que
// já passou — hoje às 3h, se já passou desse horário hoje; ontem às 3h, senão.
export function ultimoResetSessaoMs(agora: Date = new Date()): number {
  const { ano, mes, dia, hora } = partesAgoraPortoVelho(agora);
  const meiaNoiteHojeUTC = Date.UTC(ano, mes - 1, dia, 0, 0, 0) + FUSO_PORTO_VELHO_HORAS * 60 * 60 * 1000;
  const resetHojeUTC = meiaNoiteHojeUTC + HORA_DO_RESET * 60 * 60 * 1000;
  if (hora < HORA_DO_RESET) {
    return resetHojeUTC - 24 * 60 * 60 * 1000;
  }
  return resetHojeUTC;
}

// Uma sessão emitida (iat) antes do último corte de 3h é tratada como
// expirada, mesmo que o token em si (exp) ainda seja válido.
export function sessaoExpiradaPeloResetDiario(iat: number | undefined): boolean {
  if (typeof iat !== "number") return false;
  return iat < ultimoResetSessaoMs();
}
