import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { ClientesKanban } from "@/components/clientes-kanban";
import { carregarFunil } from "@/lib/clientes/funil-servidor";

export const dynamic = "force-dynamic";

// "Meus clientes" do corretor: o mesmo Kanban de Clientes do administrativo, só com os clientes que
// estão no nome dele (clientes.parceiro_id). A etapa de cada um é calculada pelo sistema (vínculos,
// contratos, propostas, avaliações), então o quadro muda sozinho. O corretor não arrasta nada: abre a
// etiqueta para acompanhar (WhatsApp, vínculos, contatos e notas) e complementar os dados.
// Cliente que o administrativo acabou de passar para ele fica em destaque até o primeiro movimento.
export default async function PortalClientesPage() {
  const session = await requirePortalSession();

  const cards = await carregarFunil(
    {
      parceiro_id: session.parceiroId,
      AND: [{ OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] }]
    },
    { restrito: true }
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="px-4 py-6 max-w-[1800px] mx-auto">
        <Link href="/portal" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar
        </Link>

        <div className="text-lg font-bold text-gray-900 mb-1">Meus clientes</div>
        <p className="text-xs text-gray-500 mb-4">
          Seus clientes por etapa. Cada um cai na etapa certa sozinho: lead recém-cadastrado, proprietário, inquilino, comprador, em atendimento, proposta criada
          ou negócio fechado. Clique no cliente para abrir a etiqueta: mensagens de WhatsApp, vínculos, contatos e notas, e para complementar os dados.
        </p>

        <ClientesKanban cards={cards} modoCorretor />
      </div>
    </div>
  );
}
