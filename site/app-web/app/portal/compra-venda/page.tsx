import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalRascunhoAviso } from "@/components/portal-rascunho-aviso";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatDataCalendario, statusTone, STATUS_TRANSACAO_TODOS, type Tone } from "@/lib/format";
import { andamentoTone } from "@/lib/transacoes/opcoes";

export const dynamic = "force-dynamic";

const TONE_CLASSES: Record<Tone, string> = {
  ativa: "bg-blue-50 text-blue-700 border-blue-200",
  concluida: "bg-green-50 text-green-700 border-green-200",
  pendente: "bg-gray-50 text-gray-600 border-gray-200",
  cancelada: "bg-red-50 text-red-600 border-red-200"
};

// Painel do corretor pra Compra e Venda — mostra o que ele já cadastrou (só
// leitura: quem edita é o administrativo em /transacoes) e o rascunho salvo
// no navegador, se tiver.
//
// Histórico (16/08/2026): a lista só mostrava negócio ABERTO
// (STATUS_TRANSACAO_EM_ABERTO), e ainda tinha um filtro por mês/ano de
// cadastro (MesAnoFiltro) que fazia negócio em andamento sumir assim que o
// mês virava (usuário: "não está aparecendo as transações em andamento").
// Removido o filtro de data. Só que aí, negócio FINALIZADO some da lista de
// vez — e o usuário voltou: "mesmo com status finalizado é preciso aparecer
// pro corretor saber o que ele fechou e quando fechou... vai replicar a
// parte de compra e venda lá [/transacoes/venda, admin] mas sendo apenas do
// Parceiro". Agora replica esse comportamento: mostra TODO negócio dele
// (qualquer status, incluindo finalizado/cancelado), agrupado por Status
// (mesma ordem de STATUS_TRANSACAO_TODOS — aberto primeiro, encerrado por
// último), com a busca por imóvel/cliente/Id ("não esqueça do filtro") igual
// à do administrativo — só que list ONLY dos negócios dele (proprietário ou
// contraparte), sem o agrupamento por Loja (não faz sentido pra um corretor
// só, que só vê os negócios que já são dele).
export default async function PortalCompraVendaPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requirePortalSession();
  const pid = session.parceiroId;

  const { q } = await searchParams;
  const termo = (q ?? "").trim();

  const transacoes = await prisma.transacoes.findMany({
    where: {
      excluido: false,
      tipo: "Compra e Venda",
      AND: [
        { OR: [{ corretor_proprietario_id: pid }, { corretor_contraparte_id: pid }] },
        ...(termo
          ? [
              {
                OR: [
                  { imoveis: { endereco: { contains: termo, mode: "insensitive" as const } } },
                  { imoveis: { inscricao: { contains: termo, mode: "insensitive" as const } } },
                  { clientes_transacoes_cliente_idToclientes: { nome: { contains: termo, mode: "insensitive" as const } } },
                  {
                    clientes_transacoes_cliente_contraparte_idToclientes: {
                      nome: { contains: termo, mode: "insensitive" as const }
                    }
                  },
                  { id_legado: { contains: termo, mode: "insensitive" as const } }
                ]
              }
            ]
          : [])
      ]
    },
    orderBy: [{ data_assinatura: { sort: "desc", nulls: "last" } }, { created_at: "desc" }],
    select: {
      id: true,
      id_legado: true,
      status: true,
      andamento: true,
      valor_transacao: true,
      data_assinatura: true,
      created_at: true,
      imoveis: { select: { endereco: true } },
      clientes_transacoes_cliente_idToclientes: { select: { nome: true } },
      clientes_transacoes_cliente_contraparte_idToclientes: { select: { nome: true } }
    }
  });

  const porStatus = new Map<string, typeof transacoes>();
  for (const t of transacoes) {
    const s = t.status ?? "Sem status";
    if (!porStatus.has(s)) porStatus.set(s, []);
    porStatus.get(s)!.push(t);
  }
  const statusOrdenados = [...porStatus.keys()].sort((x, y) => {
    const ix = STATUS_TRANSACAO_TODOS.indexOf(x);
    const iy = STATUS_TRANSACAO_TODOS.indexOf(y);
    if (ix === -1 && iy === -1) return x.localeCompare(y);
    if (ix === -1) return 1;
    if (iy === -1) return -1;
    return ix - iy;
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
          Todos os seus negócios de compra e venda, do início até fechar (ou cancelar) — depois de cadastrado só dá
          pra acompanhar aqui, quem altera é o administrativo.
        </p>

        <div className="mb-4">
          <PortalRascunhoAviso
            chave="sis_rascunho_compra_venda"
            href="/portal/compra-venda/novo"
            label="compra e venda"
          />
        </div>

        <form className="flex gap-2 flex-wrap mb-4">
          <input
            type="text"
            name="q"
            defaultValue={termo}
            placeholder="Buscar por imóvel, cliente ou Id..."
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full sm:w-72 outline-none focus:border-primary bg-white"
          />
          <button type="submit" className="text-xs bg-white border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5">
            Buscar
          </button>
        </form>

        {transacoes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-xs text-gray-400">
              {termo ? "Nenhum negócio encontrado pra essa busca." : "Nenhum negócio de compra e venda cadastrado ainda."}
            </p>
          </div>
        ) : (
          statusOrdenados.map((status) => {
            const doStatus = porStatus.get(status)!;
            const tone = statusTone(status === "Sem status" ? null : status);
            return (
              <div key={status} className="mb-4 last:mb-0">
                <div className={`text-xs font-bold px-3 py-1.5 mb-2 rounded-lg border ${TONE_CLASSES[tone]}`}>
                  {status} ({doStatus.length})
                </div>
                <div className="flex flex-col gap-2">
                  {doStatus.map((t) => (
                    <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-gray-800">
                          {t.imoveis?.endereco ?? "Imóvel sem endereço"}
                        </span>
                        {/* Andamento (etapa real do processo — Elaboração/
                            Conferência/.../Conclusão) continua como
                            destaque secundário — o Status (agrupamento
                            acima) já mostra em que pé geral está o negócio. */}
                        {t.andamento && (
                          <span
                            className={`text-[11px] font-semibold px-2 py-1 rounded-lg border whitespace-nowrap ${TONE_CLASSES[andamentoTone(t.andamento)]}`}
                          >
                            {t.andamento}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {t.id_legado ?? t.id} · {formatMoeda(t.valor_transacao)}
                        {t.data_assinatura ? (
                          <> · assinado em {formatDataCalendario(t.data_assinatura)}</>
                        ) : (
                          <> · cadastrado em {formatDataCalendario(t.created_at)}</>
                        )}
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
