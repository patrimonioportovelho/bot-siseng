import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { ClientesKanban } from "@/components/clientes-kanban";
import { lojasSelecionadas, whereLojaFiltro } from "@/lib/lojas/filtro";
import { carregarFunil } from "@/lib/clientes/funil-servidor";
import { moverClienteFunilAction } from "../funil-actions";

export const dynamic = "force-dynamic";

// Clientes em Kanban: a mesma base da lista de Clientes, organizada por etapa. A etapa é
// calculada (vínculos, contratos, propostas, avaliações), então um cliente novo que o corretor
// cadastra no portal já aparece aqui, em Leads, e muda de coluna sozinho conforme avança.
export default async function ClientesFunilPage() {
  const lojasFiltro = await lojasSelecionadas();
  // mesmo filtro da lista: sem arquivados e respeitando a loja escolhida no topo
  const cards = await carregarFunil({
    AND: [{ OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] }, whereLojaFiltro(lojasFiltro)]
  });

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-sm font-bold text-gray-800">Clientes em Kanban</div>
          <div className="text-[11px] text-gray-400">
            Cada cliente cai na etapa certa sozinho. Arraste entre Leads e Em atendimento; as demais etapas são automáticas. Clique no card para abrir a etiqueta com o WhatsApp.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/clientes" className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold text-gray-600 whitespace-nowrap">
            Ver em lista
          </Link>
          <Link href="/clientes/novo" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap">
            + Adicionar cliente
          </Link>
        </div>
      </div>

      <ClientesKanban cards={cards} mover={moverClienteFunilAction} />
    </div>
  );
}
