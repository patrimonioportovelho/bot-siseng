"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PortalSidebar } from "@/components/portal-sidebar";
import { RouteLoadingBar } from "@/components/route-loading-bar";
import { RodapePrivacidade } from "@/components/link-privacidade";
import { AvisosEquipeToasts } from "@/components/avisos-equipe-toasts";
import { PontoMonitor } from "@/components/ponto-monitor";
import type { StatusPonto } from "@/lib/ponto/servidor";
import { nivelNaRota, modulosDaRota, type AcessoEfetivo } from "@/lib/acessos";

export function AppShell({ children, acessos, ponto }: { children: React.ReactNode; acessos: AcessoEfetivo[] | null; ponto?: StatusPonto | null }) {
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
    pathname === "/privacidade" ||
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
          <main className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1">{children}</div>
            <RodapePrivacidade />
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <RouteLoadingBar />
      <div className="flex flex-col md:flex-row min-h-screen">
        <Sidebar acessos={acessos} />
        <main className="flex-1 min-w-0 p-4 md:p-6 flex flex-col">
          {searchParams?.get("negado") === "1" && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">
              Seu acesso não permite abrir ou alterar essa área. Se precisar dela, peça ao Diretor para ajustar seus acessos.
            </div>
          )}
          {acessos && pathname && modulosDaRota(pathname) && nivelNaRota(acessos, pathname) === "ver" && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 mb-4">
              Somente consulta: seu acesso a esta área permite ver, mas não alterar.
            </div>
          )}
          <div className="flex-1">{children}</div>
          <RodapePrivacidade />
        </main>
      </div>
      {/* Avisos estilo MSN: corretor entrou / fez proposta / cadastrou algo */}
      <AvisosEquipeToasts />
      {/* Controle de ponto (só quem tem o uso controlado) */}
      {ponto?.controlado && <PontoMonitor statusInicial={ponto} />}
    </>
  );
}
