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
