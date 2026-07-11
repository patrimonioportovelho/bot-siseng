import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PublicacaoCard } from "@/components/site/publicacao-card";
import { toggleChecklistAction } from "./actions";

export const dynamic = "force-dynamic";

// Portal do corretor — desde a mudança pra login por email @remax.com.br +
// função Corretor (lib/portal-auth.ts), toda sessão aqui é de um corretor
// identificado (session.parceiroId sempre presente); não existe mais o
// acesso anônimo "sem identificação" que só via notícias.
//
// O mural de notícias aqui usa a mesma tabela publicacoes_site do site
// público (/login), filtrando só quem foi marcado com "portal_corretor" em
// Configurações — antes disso existia uma tabela "noticias" separada, sem
// nenhuma tela de cadastro (só dava pra popular direto no banco).
export default async function PortalPage() {
  const session = await requirePortalSession();

  const [noticias, itens, conclusoesDoCorretor] = await Promise.all([
    prisma.publicacoes_site.findMany({
      where: { ativo: true, portal_corretor: true },
      orderBy: { publicado_em: "desc" },
      take: 20
    }),
    prisma.checklist_itens.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" }
    }),
    prisma.checklist_conclusoes.findMany({
      where: { parceiro_id: session.parceiroId }
    })
  ]);

  // Link absoluto pro compartilhar (ShareButton/WhatsApp) funcionar mesmo
  // fora do portal — mesmo padrão usado em /login e /noticias/[id].
  const host = (await headers()).get("host");
  const baseUrl = `${host?.includes("localhost") ? "http" : "https"}://${host}`;

  const concluidos = new Set(conclusoesDoCorretor.map((c) => c.item_id));

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-4">
          <Link
            href="/portal/gestao/novo"
            className="flex items-center justify-between gap-3 bg-primary text-white rounded-xl px-4 py-4 hover:opacity-90 transition-opacity"
          >
            <div>
              <div className="text-sm font-bold">Elaboração de Contrato de Gestão</div>
              <div className="text-xs opacity-80 mt-0.5">
                Preencha os dados do cliente e do imóvel para gerar o contrato de captação exclusiva
              </div>
            </div>
            <span className="text-xl leading-none">→</span>
          </Link>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800 mb-3">Notícias</div>
            {noticias.length === 0 && (
              <p className="text-xs text-gray-400">Nenhuma notícia publicada ainda.</p>
            )}
            <div className="flex flex-col gap-3 max-h-[32rem] overflow-auto">
              {noticias.map((n) => (
                <PublicacaoCard key={n.id} publicacao={n} baseUrl={baseUrl} />
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800 mb-3">Checklist</div>
            {itens.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum item de checklist cadastrado ainda.</p>
            )}
            <div className="flex flex-col gap-2">
              {itens.map((item) => {
                const feito = concluidos.has(item.id);
                return (
                  <form key={item.id} action={toggleChecklistAction.bind(null, item.id)}>
                    <button
                      type="submit"
                      className={
                        "w-full text-left flex items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors " +
                        (feito
                          ? "bg-[#e3f5ea] border-[#bfe3cd] text-[#1f7a4d]"
                          : "border-gray-200 text-gray-700 hover:bg-gray-50")
                      }
                    >
                      <span>{feito ? "☑" : "☐"}</span>
                      <span>
                        <span className="block">{item.titulo}</span>
                        {item.descricao && <span className="block text-xs opacity-80">{item.descricao}</span>}
                      </span>
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
