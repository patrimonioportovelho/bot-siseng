import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, sessaoExpiradaPeloResetDiario } from "@/lib/session";
import { acessosDaSessao, nivelNaRota } from "@/lib/acessos";

const ADMIN_COOKIE = "sis_admin_session";
const PORTAL_COOKIE = "sis_portal_session";

// Reset diário: todo dia às 3h (Porto Velho), toda sessão vira inválida,
// mesmo com token ainda dentro do prazo normal — ver
// lib/session.ts#sessaoExpiradaPeloResetDiario. Aplica pros dois acessos
// (portal do corretor e administrativo).
type PayloadSessao = { iat?: number; isAdm?: boolean; acessos?: string[] };

async function lerSessao(token: string | undefined, secret: string | undefined): Promise<PayloadSessao | null> {
  if (!secret || !token) return null;
  const payload = await verifySession<PayloadSessao>(token, secret);
  if (!payload) return null;
  if (sessaoExpiradaPeloResetDiario(payload.iat)) return null;
  return payload;
}

async function sessaoValida(token: string | undefined, secret: string | undefined) {
  return (await lerSessao(token, secret)) !== null;
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
  // /evento/[id] (singular — diferente de /eventos, que é a tela
  // administrativa protegida) é a versão pública de um Evento, mostrada no
  // mural externo junto com notícias/editais.
  // /privacidade (Política de Privacidade) também é pública — é o link do
  // rodapé e da tela de login, e precisa abrir sem sessão.
  if (
    pathname === "/login" ||
    pathname === "/privacidade" ||
    pathname.startsWith("/noticias/") ||
    pathname.startsWith("/evento/")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const sessao = await lerSessao(token, secret);
  if (!sessao) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Acessos (papéis): quem não pode nem ver a área volta ao Dashboard com aviso.
  // (Gravar é checado dentro de cada Server Action — ver requireEdicao em lib/auth.ts.)
  const nivel = nivelNaRota(acessosDaSessao(sessao), pathname, req.nextUrl.searchParams.get("embed") === "1");
  if (nivel === null) {
    const url = new URL("/dashboard", req.url);
    url.searchParams.set("negado", "1");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Além dos já existentes, exclui qualquer arquivo estático de imagem em
  // public/ (logo.png, logo-192.png, logo-512.png, icon.png, etc.) — sem
  // isso, o middleware tratava o próprio pedido da imagem como se fosse uma
  // página, exigindo sessão e redirecionando pro login (por isso a logo
  // aparecia quebrada pra quem não tinha sessão de admin ativa).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"]
};
