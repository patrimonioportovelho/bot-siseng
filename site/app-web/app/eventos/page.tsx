import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { formatDataCalendario } from "@/lib/format";
import { recorrenciaLabel, visibilidadeLabel } from "@/lib/eventos/opcoes";
import { alternarAtivoEventoAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EventosPage({
  searchParams
}: {
  searchParams: Promise<{ salvo?: string; excluido?: string; erro?: string }>;
}) {
  const { salvo, excluido, erro } = await searchParams;

  const eventos = await prisma.eventos.findMany({
    where: { excluido: false },
    orderBy: { data_inicio: "desc" },
    take: 200,
    include: { parceiros: true }
  });

  return (
    <div>
      <Topbar />

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Evento salvo com sucesso.
        </div>
      )}
      {excluido === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Evento apagado com sucesso.
        </div>
      )}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">{erro}</div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-bold text-gray-800">Eventos ({eventos.length})</div>
          <p className="text-xs text-gray-500 mt-0.5">
            Eventos publicados — reuniões, treinamentos, confraternizações e outros. Controle quem enxerga cada um
            pela visibilidade.
          </p>
        </div>
        <Link
          href="/eventos/novo"
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold hover:opacity-90 whitespace-nowrap"
        >
          + Novo evento
        </Link>
      </div>

      {eventos.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
          Nenhum evento cadastrado ainda.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {eventos.map((ev) => (
          <div
            key={ev.id}
            className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3 hover:border-primary/40 transition-colors"
          >
            {ev.imagem_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ev.imagem_url}
                alt=""
                className="w-16 h-16 rounded-lg object-cover border border-gray-200 shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <Link href={`/eventos/${ev.id}`} className="block">
                <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                  <div className="text-sm font-bold text-gray-800 truncate">{ev.nome}</div>
                  <span
                    className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border shrink-0 ${
                      ev.ativo
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-gray-50 text-gray-500 border-gray-200"
                    }`}
                  >
                    {ev.ativo ? "Publicado" : "Rascunho"}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5 flex-wrap">
                  <span>{formatDataCalendario(ev.data_inicio)}</span>
                  {(ev.horario_inicio || ev.horario_fim) && (
                    <span>
                      · {ev.horario_inicio ?? "—"}
                      {ev.horario_fim ? ` às ${ev.horario_fim}` : ""}
                    </span>
                  )}
                  {ev.local && <span>· {ev.local}</span>}
                  {ev.parceiros?.nome && <span>· Organiza: {ev.parceiros.nome}</span>}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {ev.tipo && (
                    <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border shrink-0 bg-gray-50 text-gray-600 border-gray-200">
                      {ev.tipo}
                    </span>
                  )}
                  <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border shrink-0 bg-blue-50 text-blue-700 border-blue-200">
                    {visibilidadeLabel(ev.visibilidade)}
                  </span>
                  {ev.recorrencia !== "Nenhuma" && (
                    <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border shrink-0 bg-purple-50 text-purple-700 border-purple-200">
                      {recorrenciaLabel(ev.recorrencia)}
                    </span>
                  )}
                  {ev.portal_corretor && (
                    <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border shrink-0 bg-amber-50 text-amber-700 border-amber-200">
                      Portal do corretor
                    </span>
                  )}
                  {ev.pago && (
                    <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border shrink-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                      Pago
                    </span>
                  )}
                </div>
              </Link>
            </div>
            <form action={alternarAtivoEventoAction} className="shrink-0">
              <input type="hidden" name="eventoId" value={ev.id} />
              <button type="submit" className="text-xs border border-gray-300 text-gray-600 rounded-lg px-2 py-1">
                {ev.ativo ? "Despublicar" : "Publicar"}
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
