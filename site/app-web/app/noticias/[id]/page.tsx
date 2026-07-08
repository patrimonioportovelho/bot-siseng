import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ShareButton } from "@/components/site/share-button";

export const dynamic = "force-dynamic";

function formatData(data: Date) {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Porto_Velho" });
}

const TIPO_BADGE: Record<string, string> = {
  Noticia: "bg-blue-50 text-blue-700 border-blue-200",
  Edital: "bg-amber-50 text-amber-700 border-amber-200"
};

// Página pública de uma notícia/edital específico — existe porque o card na
// home (/login) só mostrava um resumo curto sem jeito nenhum de abrir e ler
// o texto inteiro, e o link de compartilhar apontava pra âncora da home (uma
// página cheia de outras seções), que não é um link útil de mandar pra
// alguém de fora. Aqui cada publicação tem sua própria URL só com ela.
export default async function NoticiaDetalhePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const publicacao = await prisma.publicacoes_site.findFirst({
    where: { id, ativo: true }
  });

  if (!publicacao) notFound();

  const host = (await headers()).get("host");
  const baseUrl = `${host?.includes("localhost") ? "http" : "https"}://${host}`;

  return (
    <div className="min-h-screen bg-appbg">
      <header className="bg-primary">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/login" className="text-white font-bold text-lg leading-tight">
            RE/MAX Engimob
          </Link>
          <Link href="/login#noticias" className="text-xs text-white/70 hover:text-white whitespace-nowrap">
            ← Voltar para notícias
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border ${
                  TIPO_BADGE[publicacao.tipo] ?? "bg-gray-50 text-gray-600 border-gray-200"
                }`}
              >
                {publicacao.tipo === "Edital" ? "Edital" : "Notícia"}
              </span>
              <span className="text-xs text-gray-400">{formatData(publicacao.publicado_em)}</span>
            </div>
            <ShareButton
              url={`${baseUrl}/noticias/${publicacao.id}`}
              title={publicacao.titulo}
              text={publicacao.resumo ?? undefined}
            />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-4">{publicacao.titulo}</h1>

          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{publicacao.corpo}</p>
        </div>
      </main>

      <footer className="max-w-3xl mx-auto px-4 pb-8 text-center text-gray-400 text-[11px]">
        RE/MAX Engimob · Porto Velho/RO — SisEng, sistema interno de gestão.
      </footer>
    </div>
  );
}
