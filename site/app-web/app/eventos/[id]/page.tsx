import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { EventoForm } from "@/components/evento-form";
import { listarParceirosAdministrativos } from "@/lib/parceiros/administrativos";
import { FUNCOES_EQUIPE } from "@/lib/parceiros/opcoes";
import { funcoesPermitidas } from "@/lib/eventos/opcoes";
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

  // Resumo de presença/ausência — só faz sentido pra evento aberto no portal
  // (portal_corretor); os demais nem aparecem lá pro corretor confirmar.
  // "Pendente" não é uma linha salva (ver app/portal/eventos/actions.ts):
  // é calculado aqui, por diferença entre quem É elegível (pela visibilidade)
  // e quem já respondeu.
  let confirmacoes: { id: string; status: string; respondido_em: Date | null; parceiro_id: string; nome: string }[] = [];
  let pendentes: { id: string; nome: string }[] = [];
  if (evento.portal_corretor) {
    const funcoes = funcoesPermitidas(evento.visibilidade) ?? FUNCOES_EQUIPE;
    const [confirmacoesEvento, elegiveis] = await Promise.all([
      prisma.eventos_confirmacoes.findMany({
        where: { evento_id: id },
        select: { id: true, status: true, respondido_em: true, parceiro_id: true, parceiros: { select: { nome: true } } },
        orderBy: { respondido_em: "desc" }
      }),
      prisma.parceiros.findMany({
        where: { funcao: { in: funcoes }, status_funcao: "Ativo" },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true }
      })
    ]);
    confirmacoes = confirmacoesEvento.map((c) => ({
      id: c.id,
      status: c.status,
      respondido_em: c.respondido_em,
      parceiro_id: c.parceiro_id,
      nome: c.parceiros.nome
    }));
    const responderamIds = new Set(confirmacoesEvento.map((c) => c.parceiro_id));
    pendentes = elegiveis.filter((p) => !responderamIds.has(p.id));
  }
  const confirmados = confirmacoes.filter((c) => c.status === "Confirmado");
  const recusados = confirmacoes.filter((c) => c.status === "Recusado");

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

      {evento.portal_corretor && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <div className="text-sm font-bold text-gray-800 mb-1">Presença/ausência</div>
          <p className="text-xs text-gray-500 mb-3">
            Respostas de quem viu este evento no Portal do Corretor. Quem ainda não abriu o Portal ou não respondeu
            conta como "não respondeu".
          </p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-green-50 border border-green-100 rounded-lg p-2.5 text-center">
              <div className="text-base font-bold text-green-700">{confirmados.length}</div>
              <div className="text-[11px] text-green-700">Confirmaram</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 text-center">
              <div className="text-base font-bold text-red-600">{recusados.length}</div>
              <div className="text-[11px] text-red-600">Não vão</div>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-center">
              <div className="text-base font-bold text-gray-600">{pendentes.length}</div>
              <div className="text-[11px] text-gray-500">Não responderam</div>
            </div>
          </div>
          {confirmacoes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {confirmacoes.map((c) => (
                <span
                  key={c.id}
                  className={`text-[11px] rounded-full px-2 py-0.5 border ${
                    c.status === "Confirmado"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-red-50 text-red-600 border-red-200"
                  }`}
                >
                  {c.nome}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <EventoForm evento={evento} organizadores={organizadores} action={atualizarEventoAction} />
    </div>
  );
}
