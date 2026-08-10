import { PortalHeader } from "@/components/portal-header";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { podeVerEvento, recorrenciaLabel } from "@/lib/eventos/opcoes";
import { proximaOcorrencia } from "@/lib/eventos/ocorrencias";
import { confirmarPresencaEventoAction, recusarPresencaEventoAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  Pendente: "Ainda não respondeu",
  Confirmado: "Presença confirmada",
  Recusado: "Ausência avisada"
};

const STATUS_COR: Record<string, string> = {
  Pendente: "bg-gray-50 text-gray-500 border-gray-200",
  Confirmado: "bg-green-50 text-green-700 border-green-200",
  Recusado: "bg-red-50 text-red-600 border-red-200"
};

function formatData(data: Date) {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Porto_Velho" });
}

// Eventos abertos a este corretor (portal_corretor marcado + visibilidade
// bate com a função dele) — com botão de confirmar/recusar presença
// (eventos_confirmacoes, criada só quando ele responde, ver ./actions.ts).
export default async function PortalEventosPage() {
  const session = await requirePortalSession();
  const agora = new Date();

  const [parceiro, eventosBrutos] = await Promise.all([
    prisma.parceiros.findUnique({ where: { id: session.parceiroId }, select: { funcao: true } }),
    prisma.eventos.findMany({
      where: { excluido: false, ativo: true, portal_corretor: true, publicado_em: { lte: agora } },
      orderBy: { data_inicio: "asc" },
      include: {
        parceiros: true,
        eventos_confirmacoes: { where: { parceiro_id: session.parceiroId } }
      }
    })
  ]);

  const eventos = eventosBrutos
    .filter((ev) => podeVerEvento(ev.visibilidade, parceiro?.funcao ?? null))
    .map((ev) => ({
      ev,
      proxima: proximaOcorrencia(ev.data_inicio, ev.recorrencia, ev.recorrencia_ate, agora),
      status: ev.eventos_confirmacoes[0]?.status ?? "Pendente"
    }))
    .filter((x) => x.proxima !== null)
    .sort((a, b) => a.proxima!.getTime() - b.proxima!.getTime());

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="text-lg font-bold text-gray-900 mb-1">Eventos</div>
        <p className="text-xs text-gray-500 mb-6">
          Reuniões, treinamentos e outros eventos abertos pra você. Confirme presença ou avise que não vai — ajuda o
          escritório a se organizar.
        </p>

        {eventos.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
            Nenhum evento aberto pra você no momento.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {eventos.map(({ ev, proxima, status }) => (
            <div key={ev.id} className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3">
              {ev.imagem_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ev.imagem_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <div className="text-sm font-bold text-gray-800">{ev.nome}</div>
                  <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border shrink-0 ${STATUS_COR[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mb-2 flex items-center gap-1.5 flex-wrap">
                  <span>{formatData(proxima!)}</span>
                  {(ev.horario_inicio || ev.horario_fim) && (
                    <span>
                      · {ev.horario_inicio ?? "—"}
                      {ev.horario_fim ? ` às ${ev.horario_fim}` : ""}
                    </span>
                  )}
                  {ev.local && <span>· {ev.local}</span>}
                  {ev.recorrencia !== "Nenhuma" && <span>· {recorrenciaLabel(ev.recorrencia)}</span>}
                </div>
                {ev.descricao && <p className="text-xs text-gray-600 mb-2 whitespace-pre-line">{ev.descricao}</p>}
                <div className="flex gap-1.5">
                  <form action={confirmarPresencaEventoAction}>
                    <input type="hidden" name="eventoId" value={ev.id} />
                    <button
                      type="submit"
                      disabled={status === "Confirmado"}
                      className="text-xs border border-green-200 text-green-700 rounded-lg px-2 py-1 disabled:opacity-50"
                    >
                      Confirmar presença
                    </button>
                  </form>
                  <form action={recusarPresencaEventoAction}>
                    <input type="hidden" name="eventoId" value={ev.id} />
                    <button
                      type="submit"
                      disabled={status === "Recusado"}
                      className="text-xs border border-red-200 text-red-600 rounded-lg px-2 py-1 disabled:opacity-50"
                    >
                      Não vou poder ir
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
