import { Suspense } from "react";
import Link from "next/link";
import { PortalIndicadores, PortalIndicadoresCarregando } from "@/components/portal-indicadores";
import { logoutPortalAction } from "@/app/portal/actions";
import { requirePortalSession } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { obterNotificacoesPortal } from "@/lib/notificacoes";
import { NotificacoesSino } from "@/components/notificacoes-sino";

// Faixa de topo do portal do corretor — mesma linguagem visual do cabeçalho
// do site público (bg-primary, marca à esquerda), só que com "Sair" e um
// link de volta pro site institucional em vez do login do admin. Fica fora
// do container centralizado (max-w) de cada página pra ocupar a largura
// toda, com o conteúdo interno centralizado igual ao resto do site.
//
// Virou async component (Fase 4, 10/08/2026: "quero que ative o sino no
// sistema do corretor") pra buscar a própria sessão + notificações — evita
// ter que passar isso por prop em toda página do Portal (19 pontos de
// chamada só passavam `nome` até aqui). requirePortalSession() de novo aqui
// é barato (só valida o cookie assinado, sem custo de outra sessão) e nunca
// redireciona de verdade nesse ponto, porque toda página que renderiza este
// componente já validou a sessão antes.
export async function PortalHeader({ nome }: { nome: string }) {
  const session = await requirePortalSession();
  const parceiro = await prisma.parceiros.findUnique({
    where: { id: session.parceiroId },
    select: { funcao: true }
  });
  const notificacoes = await obterNotificacoesPortal(parceiro?.funcao ?? null, session.parceiroId);

  return (
    <header className="bg-primary">
      {/* A marca fica só no menu lateral (e na barra do celular): aqui não repete o logo. */}
      <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="text-white/80 text-xs leading-tight">
          <span className="font-semibold text-white">Portal do corretor</span> · Olá, {nome}
        </div>
        <div className="flex items-center gap-3">
          <NotificacoesSino itens={notificacoes} />
          <Link href="/portal/senha" className="text-xs text-white/80 hover:text-white font-medium">
            Trocar senha
          </Link>
          <Link href="/login" className="text-xs text-white/80 hover:text-white font-medium">
            Voltar ao site
          </Link>
          <form action={logoutPortalAction}>
            <button
              type="submit"
              className="text-xs bg-white/10 text-white rounded-lg px-3 py-1.5 font-semibold hover:bg-white/20 transition-colors"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
      {/* Dólar, euro, Selic, inflação e Ibovespa — carrega à parte, sem atrasar o resto da página. */}
      <Suspense fallback={<PortalIndicadoresCarregando />}>
        <PortalIndicadores />
      </Suspense>
    </header>
  );
}
