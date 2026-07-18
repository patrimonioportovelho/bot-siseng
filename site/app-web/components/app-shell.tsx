"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PortalSidebar } from "@/components/portal-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // /noticias/[id] é a página pública de cada notícia/edital (aberta a
  // partir do "Ler mais" em /login) — tem que ficar igual pra todo mundo,
  // logado ou não, já que serve de respaldo jurídico do que foi publicado.
  // /portal/login também fica sem menu (ainda não tem sessão pra montar o
  // menu lateral do corretor).
  const semMenu =
    pathname === "/login" || pathname === "/portal/login" || pathname?.startsWith("/noticias");
  const isPortal = pathname?.startsWith("/portal") && !semMenu;

  if (semMenu) {
    return <main className="min-h-screen">{children}</main>;
  }

  // Portal do corretor ganhou o mesmo menu lateral vertical do administrativo
  // (pedido do usuário) — só que cada página do portal já cuida do próprio
  // "bg-gray-50 min-h-screen" + PortalHeader, então o <main> aqui fica sem
  // padding próprio (diferente do admin, que aplica p-4 md:p-6).
  if (isPortal) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen">
        <PortalSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
    </div>
  );
}
