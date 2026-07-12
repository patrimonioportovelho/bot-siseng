import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalClientesLista } from "@/components/portal-clientes-lista";

export const dynamic = "force-dynamic";

// "Agenda do corretor" — todos os clientes cadastrados no nome dele
// (clientes.parceiro_id), com os imóveis vinculados a cada um. Mesmos dados
// que o acesso administrativo vê, só que escopados: cada corretor só enxerga
// os seus (mesma regra já usada em Elaboração de Contrato de Gestão).
export default async function PortalClientesPage() {
  const session = await requirePortalSession();

  const clientes = await prisma.clientes.findMany({
    where: { parceiro_id: session.parceiroId },
    orderBy: { nome: "asc" },
    include: {
      imoveis_proprietarios: {
        include: { imoveis: true }
      }
    }
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/portal" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar
        </Link>

        <div className="text-lg font-bold text-gray-900 mb-1">Meus clientes</div>
        <p className="text-xs text-gray-500 mb-6">
          Todos os clientes cadastrados no seu nome, com os imóveis vinculados a cada um.
        </p>

        <PortalClientesLista
          clientes={clientes.map((c) => ({
            id: c.id,
            nome: c.nome,
            telefone: c.telefone,
            email: c.email,
            cpfCnpj: c.cpf ?? c.cnpj,
            imoveis: c.imoveis_proprietarios
              .filter((v) => !v.imoveis.excluido)
              .map((v) => ({ id: v.imoveis.id, endereco: v.imoveis.endereco }))
          }))}
        />
      </div>
    </div>
  );
}
