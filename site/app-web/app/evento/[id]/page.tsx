import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ShareButton } from "@/components/site/share-button";
import { recorrenciaLabel } from "@/lib/eventos/opcoes";

export const dynamic = "force-dynamic";

function formatData(data: Date) {
  return new Date(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Porto_Velho"
  });
}

async function baseUrlAtual() {
  const host = (await headers()).get("host");
  return `${host?.includes("localhost") ? "http" : "https"}://${host}`;
}

// Só evento com visibilidade "Publico", ativo e já dentro da janela de
// publicação (publicado_em) entra aqui — os outros (fechado administrativo/
// corretores/interno, ou agendado pro futuro) devolvem 404, mesmo sabendo o
// id: essa rota é pública (ver middleware.ts), não passa por sessão nenhuma.
async function buscarEventoPublico(id: string) {
  return prisma.eventos.findFirst({
    where: {
      id,
      excluido: false,
      ativo: true,
      visibilidade: "Publico",
      publicado_em: { lte: new Date() }
    },
    include: { parceiros: true }
  });
}

// Tags Open Graph pro link (compartilhado pelo ShareButton) render bonito no
// WhatsApp/Instagram — mesmo padrão de app/noticias/[id]/page.tsx.
export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const evento = await buscarEventoPublico(id);
  if (!evento) return {};

  const baseUrl = await baseUrlAtual();
  const url = `${baseUrl}/evento/${evento.id}`;
  const descricao = evento.descricao?.slice(0, 160) ?? `${formatData(evento.data_inicio)}${evento.local ? ` · ${evento.local}` : ""}`;

  return {
    title: `${evento.nome} — RE/MAX Engimob`,
    description: descricao,
    openGraph: {
      title: evento.nome,
      description: descricao,
      url,
      siteName: "RE/MAX Engimob",
      type: "article",
      locale: "pt_BR",
      images: evento.imagem_url ? [{ url: evento.imagem_url, width: 1080, height: 1080 }] : undefined
    },
    twitter: {
      card: evento.imagem_url ? "summary_large_image" : "summary",
      title: evento.nome,
      description: descricao,
      images: evento.imagem_url ? [evento.imagem_url] : undefined
    }
  };
}

export default async function EventoPublicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const evento = await buscarEventoPublico(id);
  if (!evento) notFound();

  const baseUrl = await baseUrlAtual();

  return (
    <div className="min-h-screen bg-appbg">
      <header className="bg-primary">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/login" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-192.png" alt="SisEng" className="h-9 w-9" />
          </Link>
          <Link href="/login#eventos" className="text-xs text-white/70 hover:text-white whitespace-nowrap">
            ← Voltar para eventos
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {evento.imagem_url && (
            // Capa é sempre quadrada (1080x1080) — aspect-square em vez de
            // max-h-[420px], senão o object-cover corta boa parte de cima/
            // baixo da imagem num container largo (bug relatado 10/08/2026).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={evento.imagem_url} alt={evento.nome} className="w-full aspect-square object-cover" />
          )}
          <div className="p-6">
            <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {evento.tipo && (
                  <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border bg-gray-50 text-gray-600 border-gray-200">
                    {evento.tipo}
                  </span>
                )}
                {evento.recorrencia !== "Nenhuma" && (
                  <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border bg-purple-50 text-purple-700 border-purple-200">
                    {recorrenciaLabel(evento.recorrencia)}
                  </span>
                )}
              </div>
              <ShareButton
                url={`${baseUrl}/evento/${evento.id}`}
                title={evento.nome}
                text={evento.descricao ?? undefined}
              />
            </div>

            <h1 className="text-xl font-bold text-gray-800 mb-3">{evento.nome}</h1>

            <div className="flex flex-col gap-1 text-sm text-gray-600 mb-4">
              <div>
                <span className="font-semibold text-gray-800">Data:</span> {formatData(evento.data_inicio)}
                {evento.recorrencia_ate && ` (repete até ${formatData(evento.recorrencia_ate)})`}
              </div>
              {(evento.horario_inicio || evento.horario_fim) && (
                <div>
                  <span className="font-semibold text-gray-800">Horário:</span> {evento.horario_inicio ?? "—"}
                  {evento.horario_fim ? ` às ${evento.horario_fim}` : ""}
                </div>
              )}
              {evento.local && (
                <div>
                  <span className="font-semibold text-gray-800">Local:</span> {evento.local}
                </div>
              )}
              {evento.pago && (
                <div>
                  <span className="font-semibold text-gray-800">Investimento:</span>{" "}
                  {evento.valor ? Number(evento.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Consulte"}
                  {evento.tem_desconto && evento.valor_desconto && (
                    <>
                      {" "}
                      · com desconto:{" "}
                      {Number(evento.valor_desconto).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      {evento.desconto_prazo && ` até ${formatData(evento.desconto_prazo)}`}
                    </>
                  )}
                </div>
              )}
            </div>

            {evento.descricao && (
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{evento.descricao}</p>
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
