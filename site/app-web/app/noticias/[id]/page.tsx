import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ShareButton } from "@/components/site/share-button";
import { ChecklistShareActions } from "@/components/site/checklist-share-actions";

export const dynamic = "force-dynamic";

function formatData(data: Date) {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Porto_Velho" });
}

const TIPO_BADGE: Record<string, string> = {
  Noticia: "bg-blue-50 text-blue-700 border-blue-200",
  Edital: "bg-amber-50 text-amber-700 border-amber-200",
  Checklist: "bg-emerald-50 text-emerald-700 border-emerald-200"
};

function tipoLabel(tipo: string) {
  if (tipo === "Edital") return "Edital";
  if (tipo === "Checklist") return "Checklist";
  return "Notícia";
}

async function baseUrlAtual() {
  const host = (await headers()).get("host");
  return `${host?.includes("localhost") ? "http" : "https"}://${host}`;
}

// Tags Open Graph pra quando o link (compartilhado pelo ShareButton) for
// colado no WhatsApp/Instagram/etc. — sem isso, o preview do link sai só
// com título genérico do site, sem a imagem do flyer nem o resumo. Cada
// publicação vira uma prévia própria, com a arte 1080x1080 anexada.
export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const publicacao = await prisma.publicacoes_site.findFirst({ where: { id, ativo: true } });
  if (!publicacao) return {};

  const baseUrl = await baseUrlAtual();
  const url = `${baseUrl}/noticias/${publicacao.id}`;
  const descricao = publicacao.resumo ?? publicacao.corpo.slice(0, 160);

  return {
    title: `${publicacao.titulo} — RE/MAX Engimob`,
    description: descricao,
    openGraph: {
      title: publicacao.titulo,
      description: descricao,
      url,
      siteName: "RE/MAX Engimob",
      type: "article",
      locale: "pt_BR",
      images: publicacao.imagem_url ? [{ url: publicacao.imagem_url, width: 1080, height: 1080 }] : undefined
    },
    twitter: {
      card: publicacao.imagem_url ? "summary_large_image" : "summary",
      title: publicacao.titulo,
      description: descricao,
      images: publicacao.imagem_url ? [publicacao.imagem_url] : undefined
    }
  };
}

// Página pública de uma notícia/edital específico — existe porque o card na
// home (/login) só mostrava um resumo curto sem jeito nenhum de abrir e ler
// o texto inteiro, e o link de compartilhar apontava pra âncora da home (uma
// página cheia de outras seções), que não é um link útil de mandar pra
// alguém de fora. Aqui cada publicação tem sua própria URL só com ela.
export default async function NoticiaDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;

  const publicacao = await prisma.publicacoes_site.findFirst({
    where: { id, ativo: true }
  });

  if (!publicacao) notFound();

  const baseUrl = await baseUrlAtual();

  // O link de "Voltar" muda conforme quem abriu a página: se veio do Portal
  // do Corretor (link com ?from=portal), volta pro portal. Se é uma
  // Notícia/Edital normal, volta pro mural público de sempre. Se é um
  // Checklist aberto direto (ex: cliente que recebeu o link pelo WhatsApp,
  // sem vir do portal), não faz sentido mostrar "voltar" pra nenhum lugar —
  // a pessoa nem tem acesso a essas telas.
  const voltar =
    from === "portal"
      ? { href: "/portal", texto: "← Voltar para o Portal" }
      : publicacao.tipo === "Checklist"
        ? null
        : { href: "/login#noticias", texto: "← Voltar para notícias" };

  return (
    <div className="min-h-screen bg-appbg">
      <header className="bg-primary">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/login" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-192.png" alt="SisEng" className="h-9 w-9" />
          </Link>
          {voltar && (
            <Link href={voltar.href} className="text-xs text-white/70 hover:text-white whitespace-nowrap">
              {voltar.texto}
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {publicacao.imagem_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={publicacao.imagem_url}
              alt={publicacao.titulo}
              className="w-full max-h-[520px] object-cover"
            />
          )}
          <div className="p-6">
          <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border ${
                  TIPO_BADGE[publicacao.tipo] ?? "bg-gray-50 text-gray-600 border-gray-200"
                }`}
              >
                {tipoLabel(publicacao.tipo)}
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

          {publicacao.tipo === "Checklist" && (
            <ChecklistShareActions
              titulo={publicacao.titulo}
              corpo={publicacao.corpo}
              url={`${baseUrl}/noticias/${publicacao.id}`}
            />
          )}
          </div>
        </div>
      </main>

      <footer className="max-w-3xl mx-auto px-4 pb-8 text-center text-gray-400 text-[11px]">
        RE/MAX Engimob · Porto Velho/RO — SisEng, sistema interno de gestão.
      </footer>
    </div>
  );
}
