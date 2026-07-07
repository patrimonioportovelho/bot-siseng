"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // /noticias/[id] é a página pública de cada notícia/edital (aberta a
  // partir do "Ler mais" em /login) — tem que ficar igual pra todo mundo,
  // logado ou não, já que serve de respaldo jurídico do que foi publicado.
  const semMenu =
    pathname === "/login" || pathname?.startsWith("/portal") || pathname?.startsWith("/noticias");

  if (semMenu) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
    </div>
  );
}
