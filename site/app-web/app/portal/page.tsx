import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { toggleChecklistAction } from "./actions";

export const dynamic = "force-dynamic";

function formatData(data: Date) {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Porto_Velho" });
}

// Portal do corretor — desde a mudança pra login por email @remax.com.br +
// função Corretor (lib/portal-auth.ts), toda sessão aqui é de um corretor
// identificado (session.parceiroId sempre presente); não existe mais o
// acesso anônimo "sem identificação" que só via notícias.
export default async function PortalPage() {
  const session = await requirePortalSession();

  const [noticias, itens, conclusoesDoCorretor] = await Promise.all([
    prisma.noticias.findMany({
      where: { ativo: true },
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
            <div className="flex flex-col gap-3">
              {noticias.map((n) => (
                <div key={n.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <div className="text-xs text-gray-400 mb-0.5">{formatData(n.publicado_em)}</div>
                  <div className="text-sm font-semibold text-gray-800">{n.titulo}</div>
                  <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{n.corpo}</p>
                </div>
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
