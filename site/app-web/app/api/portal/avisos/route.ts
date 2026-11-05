import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { TIPOS_AVISO } from "@/lib/avisos-equipe";

export const dynamic = "force-dynamic";

const JANELA_MAXIMA_MS = 30 * 60 * 1000;

// Avisos estilo MSN do portal do corretor (components/avisos-equipe-toasts.tsx): só os dirigidos a
// quem está logado, por exemplo "o administrativo passou um cliente para você". Quem não estava
// online perde o toast, mas o cliente continua no sino e no quadro até o primeiro movimento.
//   sem ?desde  -> só o relógio do servidor (ponto de partida)
//   com ?desde  -> avisos desde essa hora (no máximo 30 min atrás)
export async function GET(req: Request) {
  const sessao = await getPortalSession();
  const agora = new Date();
  if (!sessao) return NextResponse.json({ agora: agora.toISOString(), avisos: [] }, { status: 401 });

  const desdeParam = new URL(req.url).searchParams.get("desde");
  if (!desdeParam) return NextResponse.json({ agora: agora.toISOString(), avisos: [] });

  const pedido = new Date(desdeParam);
  const minimo = new Date(agora.getTime() - JANELA_MAXIMA_MS);
  const desde = new Date(Math.max((Number.isNaN(pedido.getTime()) ? agora.getTime() : pedido.getTime()) - 3000, minimo.getTime()));

  const linhas = await prisma.avisos_equipe.findMany({
    where: { created_at: { gt: desde }, para_parceiro_id: sessao.parceiroId },
    orderBy: { created_at: "asc" },
    take: 15,
    include: { parceiros: { select: { nome: true } } }
  });

  const avisos = linhas.map((a) => {
    const tipo = TIPOS_AVISO[a.tipo];
    const nome = a.parceiros?.nome?.trim().split(/\s+/).slice(0, 2).join(" ") ?? "O administrativo";
    return {
      id: a.id,
      tipo: a.tipo,
      icone: tipo?.icone ?? "🔔",
      titulo: tipo ? tipo.titulo(nome) : `${nome}: ${a.tipo}`,
      detalhe: a.detalhe,
      url: a.url,
      criadoEm: a.created_at.toISOString()
    };
  });
  return NextResponse.json({ agora: agora.toISOString(), avisos });
}
