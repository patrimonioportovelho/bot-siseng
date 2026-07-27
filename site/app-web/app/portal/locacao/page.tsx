import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalRascunhoAviso } from "@/components/portal-rascunho-aviso";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatDataCalendario, statusTone, STATUS_TRANSACAO_EM_ABERTO, type Tone } from "@/lib/format";

export const dynamic = "force-dynamic";

const TONE_CLASSES: Record<Tone, string> = {
  ativa: "bg-blue-50 text-blue-700 border-blue-200",
  concluida: "bg-green-50 text-green-700 border-green-200",
  pendente: "bg-gray-50 text-gray-600 border-gray-200",
  cancelada: "bg-red-50 text-red-600 border-red-200"
};

// Painel do corretor pra Locação — mesmo padrão do painel de Compra e
// Venda (app/portal/compra-venda/page.tsx): só leitura, rascunho salvo no
// navegador em destaque, finalizadas/canceladas saem da lista.
export default async function PortalLocacaoPage() {
  const session = await requirePortalSession();
  const pid = session.parceiroId;

  const transacoes = await prisma.transacoes.findMany({
    where: {
      excluido: false,
      tipo: "Locação",
      status: STATUS_TRANSACAO_EM_ABERTO,
      OR: [{ corretor_proprietario_id: pid }, { corretor_contraparte_id: pid }]
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      id_legado: true,
      status: true,
      valor_transacao: true,
      created_at: true,
      imoveis: { select: { endereco: true } },
      clientes_transacoes_cliente_idToclientes: { select: { nome: true } },
      clientes_transacoes_cliente_contraparte_idToclientes: { select: { nome: true } }
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
          <div className="text-lg font-bold text-gray-900">Locação</div>
          <Link
            href="/portal/locacao/novo"
            className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold hover:opacity-90"
          >
            + Nova locação
          </Link>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Suas locações em andamento — depois de cadastrado só dá pra acompanhar aqui, quem altera é o
          administrativo. Finalizadas/canceladas saem desta lista (contam só no seu painel principal).
        </p>

        <div className="mb-4">
          <PortalRascunhoAviso chave="sis_rascunho_locacao" href="/portal/locacao/novo" label="locação" />
        </div>

        {transacoes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-xs text-gray-400">Nenhuma locação em andamento no momento.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {transacoes.map((t) => (
              <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-gray-800">
                    {t.imoveis?.endereco ?? "Imóvel sem endereço"}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-1 rounded-lg border whitespace-nowrap ${TONE_CLASSES[statusTone(t.status)]}`}
                  >
                    {t.status ?? "Sem status"}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400">
                  {t.id_legado ?? t.id} · {formatMoeda(t.valor_transacao)}/mês · cadastrado em{" "}
                  {formatDataCalendario(t.created_at)}
                  {t.clientes_transacoes_cliente_idToclientes?.nome && (
                    <> · Propr.: {t.clientes_transacoes_cliente_idToclientes.nome}</>
                  )}
                  {t.clientes_transacoes_cliente_contraparte_idToclientes?.nome && (
                    <> · Locatário: {t.clientes_transacoes_cliente_contraparte_idToclientes.nome}</>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
