import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { EventoForm } from "@/components/evento-form";
import { listarParceirosAdministrativos } from "@/lib/parceiros/administrativos";
import { criarEventoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovoEventoPage({
  searchParams
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const organizadores = await listarParceirosAdministrativos();

  return (
    <div>
      <Topbar />

      <Link href="/eventos" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Eventos
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Novo evento</div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">{erro}</div>
      )}

      <EventoForm evento={null} organizadores={organizadores} action={criarEventoAction} />
    </div>
  );
}
