import Link from "next/link";
import { COLUNAS_KANBAN, TIPO_GESTAO_LABEL } from "@/lib/gestoes/opcoes";

export type CardGestaoCorretor = {
  id: string;
  coluna: string;
  tipo: string;
  imoveis: { endereco: string | null; id_legado: string | null; anuncio_id: string | null } | null;
  clientes: { nome: string } | null;
};

// O mesmo quadro de Gestões / Captações do administrativo (mesmas colunas, mesma ordem), só com os cards do corretor
// e sem arrastar: quem move é o administrativo, e o card muda de coluna aqui sozinho. Clicar abre a etiqueta
// (`hrefBase` + id).
export function GestaoKanbanCorretor({ cards, hrefBase }: { cards: CardGestaoCorretor[]; hrefBase: string }) {
  return (
    <div className="flex flex-col md:flex-row gap-3 md:overflow-x-auto pb-2">
      {COLUNAS_KANBAN.map((coluna) => {
        const doCard = cards.filter((c) => c.coluna === coluna.id);
        return (
          <div key={coluna.id} className="md:w-72 md:shrink-0 rounded-xl border border-gray-200 bg-gray-50 p-2 flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-gray-700">{coluna.label}</span>
              <span className="text-[11px] text-gray-400">{doCard.length}</span>
            </div>
            <div className="flex flex-col gap-2 md:max-h-[65vh] md:overflow-y-auto">
              {doCard.map((c) => (
                <Link
                  key={c.id}
                  href={`${hrefBase}/${c.id}`}
                  className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-1.5 hover:border-primary/40 hover:shadow-sm transition-shadow"
                >
                  <div className="text-xs font-semibold text-gray-800 leading-snug truncate">
                    {c.imoveis?.endereco ?? c.imoveis?.id_legado ?? "Sem endereço"}
                  </div>
                  <span
                    className={`self-start text-[9px] font-bold rounded-full border px-1.5 py-0.5 ${
                      c.tipo === "captacao" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                    }`}
                  >
                    {TIPO_GESTAO_LABEL[c.tipo] ?? "Gestão"}
                  </span>
                  {c.clientes?.nome && <div className="text-[11px] text-gray-500 truncate">Cliente: {c.clientes.nome}</div>}
                  {c.imoveis?.anuncio_id && <div className="text-[10px] text-green-700 truncate">🌐 Anúncio {c.imoveis.anuncio_id}</div>}
                </Link>
              ))}
              {doCard.length === 0 && <div className="text-[11px] text-gray-300 text-center py-4">Nenhum card aqui.</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
