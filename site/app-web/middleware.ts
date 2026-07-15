import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, sessaoExpiradaPeloResetDiario } from "@/lib/session";

const ADMIN_COOKIE = "sis_admin_session";
const PORTAL_COOKIE = "sis_portal_session";

// Reset diário: todo dia às 3h (Porto Velho), toda sessão vira inválida,
// mesmo com token ainda dentro do prazo normal — ver
// lib/session.ts#sessaoExpiradaPeloResetDiario. Aplica pros dois acessos
// (portal do corretor e administrativo).
async function sessaoValida(token: string | undefined, secret: string | undefined) {
  if (!secret || !token) return false;
  const payload = await verifySession<{ iat?: number }>(token, secret);
  if (!payload) return false;
  if (sessaoExpiradaPeloResetDiario(payload.iat)) return false;
  return true;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const secret = process.env.SESSION_SECRET;

  // Portal externo dos corretores — sessão própria, senha única.
  if (pathname.startsWith("/portal")) {
    if (pathname === "/portal/login") return NextResponse.next();
    const token = req.cookies.get(PORTAL_COOKIE)?.value;
    if (!(await sessaoValida(token, secret))) return NextResponse.redirect(new URL("/portal/login", req.url));
    return NextResponse.next();
  }

  // Sistema administrativo — tudo fora de /login exige sessão válida.
  // /noticias/[id] também é público: é a página de cada notícia/edital
  // aberta a partir do card em /login (ver app/noticias/[id]/page.tsx).
  if (pathname === "/login" || pathname.startsWith("/noticias/")) return NextResponse.next();

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!(await sessaoValida(token, secret))) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"]
};
