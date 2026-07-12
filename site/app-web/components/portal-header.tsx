import Link from "next/link";
import { logoutPortalAction } from "@/app/portal/actions";

// Faixa de topo do portal do corretor — mesma linguagem visual do cabeçalho
// do site público (bg-primary, marca à esquerda), só que com "Sair" e um
// link de volta pro site institucional em vez do login do admin. Fica fora
// do container centralizado (max-w) de cada página pra ocupar a largura
// toda, com o conteúdo interno centralizado igual ao resto do site.
export function PortalHeader({ nome }: { nome: string }) {
  return (
    <header className="bg-primary">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-white font-bold text-base leading-tight">RE/MAX Engimob</div>
          <div className="text-white/60 text-[11px]">SisEng · Portal do corretor · Olá, {nome}</div>
        </div>
        <div className="flex items-center gap-3">
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
