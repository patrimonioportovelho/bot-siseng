import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalAvaliacaoCpfForm } from "@/components/portal-avaliacao-cpf-form";
import { listarClientesParaCompraVenda } from "@/lib/transacoes/buscas";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// Baixar e reanexar os documentos do cliente pro email pode levar alguns
// segundos por arquivo — mesmo motivo do maxDuration em
// app/portal/compra-venda/novo/page.tsx.
export const maxDuration = 30;

// "Avaliação de CPF" — porta de entrada, pelo portal do corretor, pra um
// cliente que quer COMPRAR um imóvel. Cadastra o cliente completo (é o que o
// administrativo precisa pra rodar a avaliação de crédito de verdade),
// anexa os documentos dele e cria uma Avaliação com status "Consulta de
// CPF" — que já aparece na tela /financiamento do administrativo, pra eles
// definirem a finalidade e darem seguimento no processo.
export default async function PortalAvaliacaoCpfNovoPage() {
  const session = await requirePortalSession();

  const [clientes, bancos] = await Promise.all([
    listarClientesParaCompraVenda(session.parceiroId),
    prisma.bancos.findMany({ orderBy: { nome: "asc" } })
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/portal" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar
        </Link>

        <div className="text-lg font-bold text-gray-900 mb-1">Avaliação de CPF</div>
        <p className="text-xs text-gray-500 mb-6">
          Para clientes que querem comprar um imóvel — preencha o cadastro completo, anexe os documentos e o
          administrativo dá seguimento na avaliação de crédito.
        </p>

        <PortalAvaliacaoCpfForm
          clientesDisponiveis={clientes}
          bancos={bancos.map((b) => ({ id: b.id, nome: b.nome, codigo: b.codigo }))}
        />
      </div>
    </div>
  );
}
