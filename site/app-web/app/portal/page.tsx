import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logoutPortalAction, toggleChecklistAction } from "./actions";

export const dynamic = "force-dynamic";

function formatData(data: Date) {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

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
    session.parceiroId
      ? prisma.checklist_conclusoes.findMany({
          where: { parceiro_id: session.parceiroId }
        })
      : Promise.resolve([])
  ]);

  const concluidos = new Set(conclusoesDoCorretor.map((c) => c.item_id));

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-6">
        <div>
          <div className="text-lg font-bold text-gray-900">Acesso SisEng · Portal do corretor</div>
          <div className="text-xs text-gray-500">
            {session.nome ? `Olá, ${session.nome}` : "Acesso sem identificação"}
          </div>
        </div>
        <form action={logoutPortalAction}>
          <button type="submit" className="text-xs text-gray-400 hover:text-gray-700">
            Sair
          </button>
        </form>
      </div>

      <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
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
                    disabled={!session.parceiroId}
                    className={
                      "w-full text-left flex items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors " +
                      (feito
                        ? "bg-[#e3f5ea] border-[#bfe3cd] text-[#1f7a4d]"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50") +
                      (!session.parceiroId ? " opacity-60 cursor-not-allowed" : "")
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
          {!session.parceiroId && (
            <p className="text-[11px] text-gray-400 mt-3">
              Entre novamente informando seu nome para marcar itens do checklist.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
