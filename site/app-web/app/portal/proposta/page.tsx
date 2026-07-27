import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalRascunhoAviso } from "@/components/portal-rascunho-aviso";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatDataCalendario } from "@/lib/format";

export const dynamic = "force-dynamic";

// Proposta de Compra e Venda não tem status/estágio no banco (é um
// documento gerado na hora, sem soft-delete) — a lista aqui é só o
// histórico de propostas já geradas por este corretor.
export default async function PortalPropostaPage() {
  const session = await requirePortalSession();

  const propostas = await prisma.propostas.findMany({
    where: { parceiro_id: session.parceiroId },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      descricao: true,
      rua: true,
      numero: true,
      bairro: true,
      cidade: true,
      valor_proposta: true,
      created_at: true,
      clientes: { select: { nome: true } }
    }
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/portal" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar
        </Link>

        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <div className="text-lg font-bold text-gray-900">Proposta de Compra e Venda</div>
          <Link
            href="/portal/proposta/novo"
            className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold hover:opacity-90"
          >
            + Nova proposta
          </Link>
        </div>
        <p className="text-xs text-gray-500 mb-4">Suas propostas já geradas.</p>

        <div className="mb-4">
          <PortalRascunhoAviso chave="sis_rascunho_proposta" href="/portal/proposta/novo" label="proposta" />
        </div>

        {propostas.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-xs text-gray-400">Nenhuma proposta gerada até agora.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {propostas.map((p) => {
              const enderecoImovel =
                p.descricao ||
                [p.rua, p.numero].filter(Boolean).join(", ") + (p.bairro ? ` - ${p.bairro}` : "") ||
                "Imóvel sem descrição";
              return (
                <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-800">{enderecoImovel}</span>
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-lg border bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
                      {formatMoeda(p.valor_proposta)}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400">
                    gerada em {formatDataCalendario(p.created_at)}
                    {p.clientes?.nome && <> · Cliente: {p.clientes.nome}</>}
                    {p.cidade && <> · {p.cidade}</>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
