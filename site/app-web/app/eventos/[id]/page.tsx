import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { EventoForm } from "@/components/evento-form";
import { listarParceirosAdministrativos } from "@/lib/parceiros/administrativos";
import { atualizarEventoAction, apagarEventoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EventoDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; erro?: string }>;
}) {
  const { id } = await params;
  const { salvo, erro } = await searchParams;
  const session = await getAdminSession();

  const [evento, organizadores] = await Promise.all([
    prisma.eventos.findUnique({ where: { id } }),
    listarParceirosAdministrativos()
  ]);

  if (!evento || evento.excluido) notFound();

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3">
        <Link href="/eventos" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Eventos
        </Link>
        {session?.isAdm && (
          <form action={apagarEventoAction}>
            <input type="hidden" name="eventoId" value={evento.id} />
            <button
              type="submit"
              className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50"
            >
              Apagar evento
            </button>
          </form>
        )}
      </div>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Evento salvo com sucesso.
        </div>
      )}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">{erro}</div>
      )}

      <div className="text-sm font-bold text-gray-800 mb-1">{evento.nome}</div>
      {evento.id_legado && <div className="text-xs text-gray-400 mb-4">{evento.id_legado}</div>}

      <EventoForm evento={evento} organizadores={organizadores} action={atualizarEventoAction} />
    </div>
  );
}
