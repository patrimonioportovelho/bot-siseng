import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { GestaoWhatsapp } from "@/components/gestao-whatsapp";
import { prisma } from "@/lib/prisma";
import { resolverUrlDocumentoGerado } from "@/lib/supabase-admin";
import { formatData } from "@/lib/format";
import { labelColuna } from "@/lib/gestoes/opcoes";

export const dynamic = "force-dynamic";

// Etiqueta da Ficha de Captação no portal do corretor: onde o card está no quadro, a ficha gerada e o gerador de
// mensagens de WhatsApp para manter o proprietário (sem exclusividade) informado. Só abre a ficha do próprio corretor.
export default async function PortalCaptacaoEtiquetaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortalSession();
  const { id } = await params;

  const gestao = await prisma.gestoes.findFirst({
    where: { id, parceiro_id: session.parceiroId, excluido: false, tipo: "captacao" },
    select: {
      id: true,
      id_legado: true,
      coluna: true,
      created_at: true,
      clientes: { select: { nome: true, telefone: true } },
      imoveis: { select: { endereco: true, id_legado: true, anuncio_id: true, anuncio_url: true } }
    }
  });
  if (!gestao) notFound();

  const ficha = await prisma.documentos_gerados.findFirst({
    where: { entidade_tipo: "gestao", entidade_id: gestao.id, tipo_documento: "ficha_captacao", status: "Sucesso" },
    orderBy: { gerado_em: "desc" }
  });
  const urlFicha = ficha ? await resolverUrlDocumentoGerado(ficha) : null;
  const rotuloFicha = ficha?.arquivo_caminho?.endsWith(".pdf") ? "Baixar a ficha (PDF)" : "Baixar a ficha (Word)";

  const endereco = gestao.imoveis?.endereco ?? gestao.imoveis?.id_legado ?? "Imóvel";

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-4">
        <Link href="/portal/captacao" className="text-xs text-gray-500 hover:text-gray-800 inline-block">
          ← Voltar para Ficha de Captação
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
            <span className="text-sm font-bold text-gray-800">{endereco}</span>
            <span className="text-[11px] font-semibold px-2 py-1 rounded-lg border bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
              {labelColuna(gestao.coluna)}
            </span>
          </div>
          <div className="text-[11px] text-gray-400">
            {gestao.id_legado ?? gestao.id} · cadastrado em {formatData(gestao.created_at)}
            {gestao.clientes?.nome && <> · Cliente: {gestao.clientes.nome}</>}
          </div>
          {gestao.imoveis?.anuncio_id && (
            <div className="text-[11px] text-green-700 mt-1">
              🌐 Anunciado no site · ID {gestao.imoveis.anuncio_id}
              {gestao.imoveis.anuncio_url && (
                <>
                  {" · "}
                  <a href={gestao.imoveis.anuncio_url} target="_blank" rel="noreferrer" className="text-primary underline">
                    Abrir anúncio ↗
                  </a>
                </>
              )}
            </div>
          )}
          {urlFicha && ficha && (
            <a href={urlFicha} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline inline-block mt-2">
              {rotuloFicha} · gerada em {formatData(ficha.gerado_em)}
            </a>
          )}
        </div>

        <GestaoWhatsapp
          coluna={gestao.coluna}
          nome={gestao.clientes?.nome ?? ""}
          telefone={gestao.clientes?.telefone ?? null}
          endereco={endereco}
          remetente={session.nome}
          anuncioUrl={gestao.imoveis?.anuncio_url ?? null}
          urlFicha={urlFicha}
          rotuloFicha={rotuloFicha}
        />
      </div>
    </div>
  );
}
