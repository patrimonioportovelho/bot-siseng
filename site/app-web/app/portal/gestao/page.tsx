import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalRascunhoAviso } from "@/components/portal-rascunho-aviso";
import { prisma } from "@/lib/prisma";
import { formatDataCalendario } from "@/lib/format";
import { labelColuna } from "@/lib/gestoes/opcoes";

export const dynamic = "force-dynamic";

// O Contrato de Gestão não tem um estágio "concluído" — o quadro (kanban) só
// percorre 5 colunas (ver lib/gestoes/opcoes.ts) e o corretor acompanha isso
// aqui, sempre. Só sai da lista se for excluída/cancelada (excluido=true).
export default async function PortalGestaoPage() {
  const session = await requirePortalSession();

  const gestoes = await prisma.gestoes.findMany({
    where: { parceiro_id: session.parceiroId, excluido: false },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      id_legado: true,
      coluna: true,
      created_at: true,
      clientes: { select: { nome: true } },
      imoveis: { select: { endereco: true } }
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
          <div className="text-lg font-bold text-gray-900">Contrato de Gestão</div>
          <Link
            href="/portal/gestao/novo"
            className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold hover:opacity-90"
          >
            + Novo contrato
          </Link>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Suas gestões — o estágio muda aqui conforme o administrativo avança no quadro (Captação, Gestão Ativa,
          Comercialização, Visitas, Proposta/Negociação).
        </p>

        <div className="mb-4">
          <PortalRascunhoAviso chave="sis_rascunho_gestao" href="/portal/gestao/novo" label="contrato de gestão" />
        </div>

        {gestoes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-xs text-gray-400">Nenhum contrato de gestão no momento.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {gestoes.map((g) => (
              <div key={g.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-gray-800">
                    {g.imoveis?.endereco ?? "Imóvel sem endereço"}
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-1 rounded-lg border bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
                    {labelColuna(g.coluna)}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400">
                  {g.id_legado ?? g.id} · cadastrado em {formatDataCalendario(g.created_at)}
                  {g.clientes?.nome && <> · Cliente: {g.clientes.nome}</>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
