import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalRascunhoAviso } from "@/components/portal-rascunho-aviso";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatDataCalendario, statusTone, STATUS_TRANSACAO_EM_ABERTO, type Tone } from "@/lib/format";
import { andamentoTone } from "@/lib/transacoes/opcoes";

export const dynamic = "force-dynamic";

const TONE_CLASSES: Record<Tone, string> = {
  ativa: "bg-blue-50 text-blue-700 border-blue-200",
  concluida: "bg-green-50 text-green-700 border-green-200",
  pendente: "bg-gray-50 text-gray-600 border-gray-200",
  cancelada: "bg-red-50 text-red-600 border-red-200"
};

// Painel do corretor pra Compra e Venda — mostra o que ele já cadastrou
// (só leitura: quem edita é o administrativo em /transacoes) e o rascunho
// salvo no navegador, se tiver. Negócios finalizados/cancelados seguem fora
// desta lista (mesmo critério de STATUS_TRANSACAO_EM_ABERTO usado no resto
// do sistema) — já contam no painel principal (/portal). O destaque de cada
// card é o Andamento do contrato (Elaboração/Conferência/.../Conclusão —
// ver lib/transacoes/opcoes.ts) em vez do Status normal, que fica só como
// texto menor de apoio — o Andamento é o que reflete de verdade em que pé
// está o processo, dia a dia.
//
// Um filtro por mês/ano de cadastro (MesAnoFiltro) chegou a existir aqui
// (01/08/2026), mas quebrava o propósito da própria tela: um negócio em
// andamento não tem prazo — cadastrado em julho e ainda aberto em agosto
// simplesmente sumia da lista assim que o mês virava, porque o filtro
// exigia created_at dentro do mês selecionado (16/08/2026, usuário: "não
// está aparecendo as transações em andamento"). Removido — a lista mostra
// TODO negócio aberto dele, sem recorte de data; quem quiser histórico de
// negócio já concluído continua olhando o painel principal (/portal).
export default async function PortalCompraVendaPage() {
  const session = await requirePortalSession();
  const pid = session.parceiroId;

  const transacoes = await prisma.transacoes.findMany({
    where: {
      excluido: false,
      tipo: "Compra e Venda",
      status: STATUS_TRANSACAO_EM_ABERTO,
      OR: [{ corretor_proprietario_id: pid }, { corretor_contraparte_id: pid }]
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      id_legado: true,
      status: true,
      andamento: true,
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
          <div className="text-lg font-bold text-gray-900">Compra e venda</div>
          <Link
            href="/portal/compra-venda/novo"
            className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold hover:opacity-90"
          >
            + Novo negócio
          </Link>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Seus negócios em andamento — depois de cadastrado só dá pra acompanhar aqui, quem altera é o
          administrativo. Finalizados/cancelados saem desta lista (contam só no seu painel principal).
        </p>

        <div className="mb-4">
          <PortalRascunhoAviso
            chave="sis_rascunho_compra_venda"
            href="/portal/compra-venda/novo"
            label="compra e venda"
          />
        </div>

        {transacoes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-xs text-gray-400">Nenhum negócio de compra e venda em andamento no momento.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {transacoes.map((t) => (
              <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-gray-800">
                    {t.imoveis?.endereco ?? "Imóvel sem endereço"}
                  </span>
                  {/* Destaque passou a ser o Andamento (etapa real do
                      processo — Elaboração/Conferência/.../Conclusão),
                      pedido do usuário em 01/08/2026: reflete melhor o dia a
                      dia do que o Status normal, que fica como texto de
                      apoio logo abaixo. */}
                  <span
                    className={`text-[11px] font-semibold px-2 py-1 rounded-lg border whitespace-nowrap ${TONE_CLASSES[andamentoTone(t.andamento)]}`}
                  >
                    {t.andamento ?? "Sem andamento"}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400">
                  {t.id_legado ?? t.id} · {formatMoeda(t.valor_transacao)} · Status: {t.status ?? "—"} · cadastrado em{" "}
                  {formatDataCalendario(t.created_at)}
                  {t.clientes_transacoes_cliente_idToclientes?.nome && (
                    <> · Propr.: {t.clientes_transacoes_cliente_idToclientes.nome}</>
                  )}
                  {t.clientes_transacoes_cliente_contraparte_idToclientes?.nome && (
                    <> · Interess.: {t.clientes_transacoes_cliente_contraparte_idToclientes.nome}</>
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
