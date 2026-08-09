import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { AtividadesTabs } from "@/components/atividades-tabs";
import { FUNCOES_CORRETOR } from "@/lib/transacoes/opcoes";

export const dynamic = "force-dynamic";

// Listagem de perfis de marketing dos corretores (Fase 5b, 09/08/2026) —
// Notion "Corretores". Todo Corretor/Corretor Estagiário ativo aparece
// aqui, tenha ou não perfil preenchido ainda (vínculo é opcional).
export default async function MarketingCorretoresPage() {
  const [corretores, perfis] = await Promise.all([
    prisma.parceiros.findMany({
      where: { funcao: { in: FUNCOES_CORRETOR }, status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, funcao: true }
    }),
    prisma.marketing_corretores.findMany({ select: { parceiro_id: true, status: true, instagram: true } })
  ]);

  const perfilPorParceiro = new Map(perfis.map((p) => [p.parceiro_id, p]));

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Marketing · Corretores (perfil de marca)</div>
        <AtividadesTabs ativo="/marketing" />
      </div>

      <Link href="/marketing" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-4">
        ← Voltar para o quadro
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {corretores.map((c) => {
          const perfil = perfilPorParceiro.get(c.id);
          return (
            <Link
              key={c.id}
              href={`/marketing/corretores/${c.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-gray-800 truncate">{c.nome}</div>
                <div className="text-[11px] text-gray-400 truncate">
                  {c.funcao}
                  {perfil?.instagram ? ` · ${perfil.instagram}` : ""}
                </div>
              </div>
              {perfil ? (
                <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 border shrink-0 bg-green-50 text-green-700 border-green-200">
                  Perfil preenchido
                </span>
              ) : (
                <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 border shrink-0 bg-gray-100 text-gray-500 border-gray-200">
                  Sem perfil
                </span>
              )}
            </Link>
          );
        })}
        {corretores.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">Nenhum corretor ativo cadastrado.</div>
        )}
      </div>
    </div>
  );
}
