import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/session";

const ADMIN_COOKIE = "sis_admin_session";
const PORTAL_COOKIE = "sis_portal_session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const secret = process.env.SESSION_SECRET;

  // Portal externo dos corretores — sessão própria, senha única.
  if (pathname.startsWith("/portal")) {
    if (pathname === "/portal/login") return NextResponse.next();
    const token = req.cookies.get(PORTAL_COOKIE)?.value;
    const valid = secret && token ? await verifySession(token, secret) : null;
    if (!valid) return NextResponse.redirect(new URL("/portal/login", req.url));
    return NextResponse.next();
  }

  // Sistema administrativo — tudo fora de /login exige sessão válida.
  if (pathname === "/login") return NextResponse.next();

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const valid = secret && token ? await verifySession(token, secret) : null;
  if (!valid) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"]
};
