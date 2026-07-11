import { ShareButton } from "@/components/site/share-button";

// Card de Notícia/Edital reaproveitado no mural público (/login) e no mural
// do Portal do Corretor (/portal) — mesma cara nos dois lugares. A imagem
// (quando tem) entra em moldura quadrada no topo: é o formato que a maioria
// das artes prontas (flyers de reunião, editais etc.) já vem, geralmente
// 1080x1080.
export type PublicacaoCardData = {
  id: string;
  tipo: string;
  titulo: string;
  resumo: string | null;
  corpo: string;
  imagem_url: string | null;
  publicado_em: Date;
};

const TIPO_BADGE: Record<string, string> = {
  Noticia: "bg-blue-50 text-blue-700 border-blue-200",
  Edital: "bg-amber-50 text-amber-700 border-amber-200"
};

function formatData(data: Date) {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Porto_Velho" });
}

export function PublicacaoCard({ publicacao, baseUrl }: { publicacao: PublicacaoCardData; baseUrl: string }) {
  const p = publicacao;

  return (
    <article id={`noticia-${p.id}`} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {p.imagem_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.imagem_url} alt={p.titulo} className="w-full aspect-square object-cover" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border ${
                TIPO_BADGE[p.tipo] ?? "bg-gray-50 text-gray-600 border-gray-200"
              }`}
            >
              {p.tipo === "Edital" ? "Edital" : "Notícia"}
            </span>
            <span className="text-[11px] text-gray-400">{formatData(p.publicado_em)}</span>
          </div>
          {/* Compartilha o link da página própria da publicação
              (/noticias/[id]), não uma âncora da home — assim quem recebe
              abre direto o conteúdo, sem o resto da página. O preview no
              WhatsApp usa a imagem via as tags Open Graph de lá. */}
          <ShareButton url={`${baseUrl}/noticias/${p.id}`} title={p.titulo} text={p.resumo ?? undefined} />
        </div>
        <div className="text-sm font-bold text-gray-800">{p.titulo}</div>
        <p className="text-xs text-gray-600 mt-1 whitespace-pre-line line-clamp-3">{p.resumo || p.corpo}</p>
        <a href={`/noticias/${p.id}`} className="text-xs font-semibold text-primary hover:underline mt-2 inline-block">
          Ler {p.tipo === "Edital" ? "o edital completo" : "a notícia completa"} →
        </a>
      </div>
    </article>
  );
}
