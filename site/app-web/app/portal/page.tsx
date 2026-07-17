import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PublicacaoCard } from "@/components/site/publicacao-card";

const IMOBVIEW_URL = "https://www.imobview.pro/login";

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

  const [noticias, checklists] = await Promise.all([
    prisma.publicacoes_site.findMany({
      where: { ativo: true, portal_corretor: true, tipo: { not: "Checklist" } },
      orderBy: { publicado_em: "desc" },
      take: 20
    }),
    // Checklists da imobiliária — mesma tabela publicacoes_site, reaproveitando
    // o formato de publicação (abre em /noticias/[id], dá pra copiar a
    // mensagem ou mandar direto no WhatsApp pro cliente).
    prisma.publicacoes_site.findMany({
      where: { ativo: true, portal_corretor: true, tipo: "Checklist" },
      orderBy: { titulo: "asc" }
    })
  ]);

  // Link absoluto pro compartilhar (ShareButton/WhatsApp) funcionar mesmo
  // fora do portal — mesmo padrão usado em /login e /noticias/[id].
  const host = (await headers()).get("host");
  const baseUrl = `${host?.includes("localhost") ? "http" : "https"}://${host}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-4 flex flex-col gap-3">
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

          <Link
            href="/portal/proposta/novo"
            className="flex items-center justify-between gap-3 bg-primary text-white rounded-xl px-4 py-4 hover:opacity-90 transition-opacity"
          >
            <div>
              <div className="text-sm font-bold">Proposta de Compra e Venda</div>
              <div className="text-xs opacity-80 mt-0.5">
                Preencha os dados do cliente e do imóvel para gerar a proposta (imóvel não é cadastrado)
              </div>
            </div>
            <span className="text-xl leading-none">→</span>
          </Link>

          <Link
            href="/portal/compra-venda/novo"
            className="flex items-center justify-between gap-3 bg-primary text-white rounded-xl px-4 py-4 hover:opacity-90 transition-opacity"
          >
            <div>
              <div className="text-sm font-bold">Elaboração de Compra e Venda</div>
              <div className="text-xs opacity-80 mt-0.5">
                Puxe o imóvel já captado e o(s) comprador(es) para cadastrar a transação de verdade
              </div>
            </div>
            <span className="text-xl leading-none">→</span>
          </Link>

          <Link
            href="/portal/avaliacao-cpf/novo"
            className="flex items-center justify-between gap-3 bg-primary text-white rounded-xl px-4 py-4 hover:opacity-90 transition-opacity"
          >
            <div>
              <div className="text-sm font-bold">Avaliação de CPF</div>
              <div className="text-xs opacity-80 mt-0.5">
                Cliente quer comprar um imóvel — cadastre completo, anexe os documentos e o administrativo avalia
              </div>
            </div>
            <span className="text-xl leading-none">→</span>
          </Link>

          <Link
            href="/portal/administracao/novo"
            className="flex items-center justify-between gap-3 bg-primary text-white rounded-xl px-4 py-4 hover:opacity-90 transition-opacity"
          >
            <div>
              <div className="text-sm font-bold">Elaboração de Contrato de Administração</div>
              <div className="text-xs opacity-80 mt-0.5">
                Cadastre o(s) proprietário(s) e o imóvel para captação — entra com status Captação
              </div>
            </div>
            <span className="text-xl leading-none">→</span>
          </Link>

          <Link
            href="/portal/clientes"
            className="flex items-center justify-between gap-3 bg-white border border-gray-200 text-gray-800 rounded-xl px-4 py-4 hover:bg-gray-50 transition-colors"
          >
            <div>
              <div className="text-sm font-bold">Meus clientes</div>
              <div className="text-xs text-gray-500 mt-0.5">Todos os clientes cadastrados no seu nome, com os imóveis vinculados</div>
            </div>
            <span className="text-xl leading-none text-gray-400">→</span>
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
            <div className="text-sm font-bold text-gray-800 mb-1">Checklists</div>
            <p className="text-xs text-gray-500 mb-3">
              Abra um checklist, copie a mensagem ou já encaminhe pronta no WhatsApp pro cliente.
            </p>
            {checklists.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum checklist cadastrado ainda.</p>
            )}
            <div className="flex flex-col gap-2">
              {checklists.map((c) => (
                <Link
                  key={c.id}
                  href={`/noticias/${c.id}?from=portal`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span>{c.titulo}</span>
                  <span className="text-gray-400">→</span>
                </Link>
              ))}

              <a
                href={IMOBVIEW_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 mt-2"
              >
                <span>
                  ImobView <span className="text-xs text-gray-400">— estudo de mercado</span>
                </span>
                <span className="text-gray-400">↗</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
