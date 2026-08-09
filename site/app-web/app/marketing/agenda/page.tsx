import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { AtividadesTabs } from "@/components/atividades-tabs";
import { formatDataHora } from "@/lib/format";
import { confirmarSolicitacaoAgendaAction, recusarSolicitacaoAgendaAction } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  recusada: "Recusada"
};

const STATUS_COR: Record<string, string> = {
  pendente: "bg-[#A9822E]/10 text-[#A9822E] border-[#A9822E]/30",
  confirmada: "bg-green-50 text-green-700 border-green-200",
  recusada: "bg-red-50 text-red-600 border-red-200"
};

// Pedidos que os corretores mandam pela Agenda do portal (app/portal/agenda)
// — confirmar já vira uma Ordem de Marketing sozinha; recusar só registra o
// motivo. Pedido do usuário em 09/08/2026.
export default async function MarketingAgendaPage() {
  const solicitacoes = await prisma.solicitacoes_agenda.findMany({
    where: { excluido: false },
    orderBy: [{ status: "asc" }, { created_at: "desc" }],
    include: {
      parceiros_solicitacoes_agenda_parceiro_idToparceiros: { select: { nome: true } },
      marketing_ordens: { select: { id: true, id_legado: true, titulo: true } }
    }
  });

  const pendentes = solicitacoes.filter((s) => s.status === "pendente");
  const respondidas = solicitacoes.filter((s) => s.status !== "pendente");

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Marketing · Pedidos da Agenda</div>
        <AtividadesTabs ativo="/marketing" />
      </div>

      <Link href="/marketing" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-4">
        ← Voltar para o quadro
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="text-sm font-bold text-gray-800 mb-3">
          Pendentes {pendentes.length > 0 && <span className="text-[#A9822E]">({pendentes.length})</span>}
        </div>
        <div className="flex flex-col gap-3">
          {pendentes.map((s) => (
            <div key={s.id} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <span className="text-sm font-semibold text-gray-800">{s.titulo}</span>
                <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${STATUS_COR[s.status]}`}>
                  {STATUS_LABEL[s.status]}
                </span>
              </div>
              <div className="text-xs text-gray-400 mb-2">
                Corretor: {s.parceiros_solicitacoes_agenda_parceiro_idToparceiros.nome}
                {s.tipo ? ` · ${s.tipo}` : ""} · Sugerido: {formatDataHora(s.data_hora_sugerida)}
              </div>
              {s.descricao && <p className="text-xs text-gray-600 mb-2">{s.descricao}</p>}

              <div className="grid md:grid-cols-2 gap-3 mt-2">
                <form action={confirmarSolicitacaoAgendaAction} className="flex flex-col gap-2 border border-green-100 bg-green-50/40 rounded-lg p-2.5">
                  <input type="hidden" name="solicitacaoId" value={s.id} />
                  <div className="text-[11px] font-semibold text-green-700">Confirmar</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      name="nova_data"
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1 outline-none focus:border-primary bg-white"
                      title="Deixe em branco pra manter a data sugerida"
                    />
                    <input
                      type="time"
                      name="nova_hora"
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1 outline-none focus:border-primary bg-white"
                    />
                  </div>
                  <input
                    name="resposta_texto"
                    placeholder="Observação pro corretor (opcional)"
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1 outline-none focus:border-primary bg-white"
                  />
                  <button type="submit" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold">
                    Confirmar e criar Ordem
                  </button>
                </form>

                <form action={recusarSolicitacaoAgendaAction} className="flex flex-col gap-2 border border-red-100 bg-red-50/40 rounded-lg p-2.5">
                  <input type="hidden" name="solicitacaoId" value={s.id} />
                  <div className="text-[11px] font-semibold text-red-600">Recusar</div>
                  <input
                    name="resposta_texto"
                    placeholder="Motivo (aparece pro corretor)"
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1 outline-none focus:border-primary bg-white"
                  />
                  <button type="submit" className="text-xs border border-red-300 text-red-600 rounded-lg px-3 py-1.5 font-semibold hover:bg-red-50">
                    Recusar pedido
                  </button>
                </form>
              </div>
            </div>
          ))}
          {pendentes.length === 0 && <p className="text-xs text-gray-400">Nenhum pedido pendente.</p>}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Respondidos</div>
        <div className="flex flex-col gap-2">
          {respondidas.map((s) => (
            <div key={s.id} className="border border-gray-100 rounded-lg px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-800 truncate">{s.titulo}</div>
                <div className="text-[11px] text-gray-400 truncate">
                  {s.parceiros_solicitacoes_agenda_parceiro_idToparceiros.nome}
                  {s.marketing_ordens ? ` · ${s.marketing_ordens.id_legado ?? "OM"}` : ""}
                  {s.resposta_texto ? ` · "${s.resposta_texto}"` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {s.marketing_ordens && (
                  <Link href={`/marketing/${s.marketing_ordens.id}`} className="text-[11px] text-primary font-semibold hover:underline">
                    Abrir OM →
                  </Link>
                )}
                <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${STATUS_COR[s.status]}`}>
                  {STATUS_LABEL[s.status]}
                </span>
              </div>
            </div>
          ))}
          {respondidas.length === 0 && <p className="text-xs text-gray-400">Nenhum pedido respondido ainda.</p>}
        </div>
      </div>
    </div>
  );
}
