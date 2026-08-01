"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Barra de progresso no topo da tela — resolve a reclamação de "clico e não
// sei se está carregando ou travou" ao abrir qualquer aba (inclusive login).
//
// Não usa nenhuma lib nova (nextjs-toploader, NProgress etc.) de propósito:
// o sandbox de desenvolvimento não tem acesso ao registro do npm pra
// resolver uma dependência nova com segurança (ver auditoria de segurança
// de 01/08/2026), então implementado só com React + CSS.
//
// Como funciona: o App Router do Next só atualiza a URL/pathname quando os
// dados da página nova já chegaram — ou seja, "esperar o pathname mudar"
// pra mostrar a barra seria tarde demais (a demora toda já teria
// acontecido). Por isso a barra escuta cliques em qualquer link interno
// (capturados no `document`, fase de captura, antes do Next processar o
// clique) e começa a "andar" na hora — e só termina quando o pathname (ou
// os query params) realmente mudam, sinal de que a página nova já
// renderizou.
export function RouteLoadingBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [carregando, setCarregando] = useState(false);
  const [largura, setLargura] = useState(0);
  const tempoLimiteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chaveAnteriorRef = useRef(`${pathname}?${searchParams?.toString() ?? ""}`);

  // Detecta clique em qualquer link interno de navegação (renderizado pelo
  // next/link como <a href="...">) e já começa a barra, otimisticamente.
  useEffect(() => {
    function aoClicar(evento: MouseEvent) {
      if (evento.defaultPrevented || evento.button !== 0) return;
      if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;

      const alvo = evento.target as HTMLElement | null;
      const link = alvo?.closest("a");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (link.target === "_blank" || link.hasAttribute("download")) return;

      // Só links internos (mesma origem) — link externo não passa pelo
      // roteador do Next, não faz sentido mostrar a barra.
      let destino: URL;
      try {
        destino = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (destino.origin !== window.location.origin) return;
      if (destino.href === window.location.href) return;

      setCarregando(true);
      setLargura(15);

      // Trava de segurança: se por algum motivo o pathname nunca mudar
      // (ex.: navegação pro mesmo componente, ou algo cancelado), some a
      // barra sozinha depois de um tempo em vez de ficar travada pra
      // sempre.
      if (tempoLimiteRef.current) clearTimeout(tempoLimiteRef.current);
      tempoLimiteRef.current = setTimeout(() => setCarregando(false), 12_000);
    }

    document.addEventListener("click", aoClicar, { capture: true });
    return () => document.removeEventListener("click", aoClicar, { capture: true });
  }, []);

  // "Anda" a barra devagar enquanto carrega, dando sensação de progresso
  // contínuo (nunca trava visualmente parada num mesmo ponto).
  useEffect(() => {
    if (!carregando) return;
    const intervalo = setInterval(() => {
      setLargura((atual) => (atual < 85 ? atual + (85 - atual) * 0.1 : atual));
    }, 200);
    return () => clearInterval(intervalo);
  }, [carregando]);

  // Sinal de "chegou": pathname ou query mudaram de verdade — conclui a
  // barra e some.
  useEffect(() => {
    const chaveAtual = `${pathname}?${searchParams?.toString() ?? ""}`;
    if (chaveAtual === chaveAnteriorRef.current) return;
    chaveAnteriorRef.current = chaveAtual;

    if (tempoLimiteRef.current) clearTimeout(tempoLimiteRef.current);
    if (!carregando) return;

    setLargura(100);
    const t = setTimeout(() => {
      setCarregando(false);
      setLargura(0);
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  if (!carregando) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-transparent pointer-events-none">
      <div
        className="h-full bg-primary transition-[width] duration-200 ease-out"
        style={{ width: `${largura}%` }}
      />
    </div>
  );
}
