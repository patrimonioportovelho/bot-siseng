import { ShareButton } from "@/components/site/share-button";

// Card de Evento reaproveitado no mural público (/login) e no mural do
// Portal do Corretor (/portal) — mesma cara do PublicacaoCard (Notícias/
// Editais), mas com data/horário/local em vez de resumo de texto.
export type EventoCardData = {
  id: string;
  tipo: string | null;
  nome: string;
  local: string | null;
  imagem_url: string | null;
  dataExibida: Date;
  recorrencia: string;
  horario_inicio: string | null;
};

function formatData(data: Date) {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Porto_Velho" });
}

// `publico` decide o destino do card: eventos com visibilidade "Publico" têm
// página própria em /evento/[id] (compartilhável, ver app/evento/[id]/
// page.tsx); eventos internos (fechado administrativo/corretores/interno)
// não têm — essa rota só responde 200 pra "Publico" — então o card manda
// pra lista completa do portal em vez de dar 404, e some o botão de
// compartilhar (não faz sentido mandar um link que só quem já está logado
// no portal consegue ver).
export function EventoCard({
  evento,
  baseUrl,
  publico = true
}: {
  evento: EventoCardData;
  baseUrl: string;
  publico?: boolean;
}) {
  const e = evento;
  const href = publico ? `/evento/${e.id}` : "/portal/eventos";

  return (
    <article className="bg-white border border-gray-200 rounded-xl overflow-hidden h-full flex flex-col">
      {e.imagem_url && (
        // Capa do evento é sempre quadrada (1080x1080, ver evento-form.tsx)
        // — aspect-square em vez de aspect-video (16:9), senão o object-cover
        // corta as bordas de cima/baixo da imagem (bug relatado 10/08/2026:
        // o texto do flyer aparecia cortado no mural do Portal do Corretor).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.imagem_url} alt={e.nome} className="w-full aspect-square object-cover" />
      )}
      <div className="p-4 flex-1 flex flex-col min-h-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border bg-purple-50 text-purple-700 border-purple-200">
              {e.tipo ?? "Evento"}
            </span>
            <span className="text-[11px] text-gray-400">
              {formatData(e.dataExibida)}
              {e.horario_inicio ? ` · ${e.horario_inicio}` : ""}
            </span>
          </div>
          {publico && <ShareButton url={`${baseUrl}/evento/${e.id}`} title={e.nome} text={e.local ?? undefined} />}
        </div>
        <div className="text-sm font-bold text-gray-800">{e.nome}</div>
        {e.local && <p className="text-xs text-gray-600 mt-1 flex-1">{e.local}</p>}
        <a href={href} className="text-xs font-semibold text-primary hover:underline inline-block mt-auto pt-2">
          Ver detalhes do evento →
        </a>
      </div>
    </article>
  );
}
