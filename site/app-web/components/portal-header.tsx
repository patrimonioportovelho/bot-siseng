import Link from "next/link";
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
  const notificacoes = await obterNotificacoesPortal(parceiro?.funcao ?? null);

  return (
    <header className="bg-primary">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-192.png" alt="SisEng" className="h-9 w-9" />
          <div className="text-white/60 text-[11px] leading-tight">Portal do corretor · Olá, {nome}</div>
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
    </header>
  );
}
