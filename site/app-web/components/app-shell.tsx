"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PortalSidebar } from "@/components/portal-sidebar";
import { RouteLoadingBar } from "@/components/route-loading-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // ?embed=1 é usado pelo painel lateral (drawer) da transação — abre
  // /imoveis/[id] ou /clientes/[id] num iframe dentro do próprio detalhe da
  // transação, então não faz sentido repetir o menu lateral/Topbar lá
  // dentro (pedido do usuário: conferir/editar sem sair da tela, sem abrir
  // aba nova).
  const embutido = searchParams?.get("embed") === "1";
  // /noticias/[id] é a página pública de cada notícia/edital (aberta a
  // partir do "Ler mais" em /login) — tem que ficar igual pra todo mundo,
  // logado ou não, já que serve de respaldo jurídico do que foi publicado.
  // /portal/login também fica sem menu (ainda não tem sessão pra montar o
  // menu lateral do corretor).
  // /evento/[id] (Fase 6, 12/08/2026): mesmo raciocínio — é a página
  // pública de inscrição/pagamento de convidado, pensada pra ser
  // compartilhada num anúncio (link direto, WhatsApp etc.). BUG
  // CORRIGIDO: sem essa exclusão, quem abrisse o link já logado no
  // sistema (o próprio admin testando, ou um corretor com o Portal aberto
  // na mesma aba) via o menu lateral inteiro do admin/portal por cima —
  // nada disso deveria aparecer numa página feita pra circular fora do
  // sistema.
  const semMenu =
    embutido ||
    pathname === "/login" ||
    pathname === "/portal/login" ||
    pathname?.startsWith("/noticias") ||
    pathname?.startsWith("/evento/");
  const isPortal = pathname?.startsWith("/portal") && !semMenu;

  if (semMenu) {
    return (
      <>
        <RouteLoadingBar />
        <main className="min-h-screen">{children}</main>
      </>
    );
  }

  // Portal do corretor ganhou o mesmo menu lateral vertical do administrativo
  // (pedido do usuário) — só que cada página do portal já cuida do próprio
  // "bg-gray-50 min-h-screen" + PortalHeader, então o <main> aqui fica sem
  // padding próprio (diferente do admin, que aplica p-4 md:p-6).
  if (isPortal) {
    return (
      <>
        <RouteLoadingBar />
        <div className="flex flex-col md:flex-row min-h-screen">
          <PortalSidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </>
    );
  }

  return (
    <>
      <RouteLoadingBar />
      <div className="flex flex-col md:flex-row min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
      </div>
    </>
  );
}
