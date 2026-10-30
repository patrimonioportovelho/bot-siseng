import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TIPOS_AVISO } from "@/lib/avisos-equipe";

export const dynamic = "force-dynamic";

const JANELA_MAXIMA_MS = 30 * 60 * 1000;

// Consultado de poucos em poucos segundos pelas telas do administrativo
// (components/avisos-equipe-toasts.tsx). Só quem está logado no administrativo
// recebe — o /api/ fica fora do middleware, então a sessão é checada aqui.
//   sem ?desde  -> devolve só o relógio do servidor (ponto de partida; não mostra histórico)
//   com ?desde  -> avisos criados desde essa hora (no máximo 30 min atrás)
export async function GET(req: Request) {
  const sessao = await getAdminSession();
  const agora = new Date();
  if (!sessao) return NextResponse.json({ agora: agora.toISOString(), avisos: [] }, { status: 401 });

  const desdeParam = new URL(req.url).searchParams.get("desde");
  if (!desdeParam) return NextResponse.json({ agora: agora.toISOString(), avisos: [] });

  const pedido = new Date(desdeParam);
  const minimo = new Date(agora.getTime() - JANELA_MAXIMA_MS);
  // 3 s de sobreposição para não perder um aviso gravado quase junto da consulta anterior
  // (o navegador descarta o que já mostrou, pelo id).
  const desde = new Date(Math.max((Number.isNaN(pedido.getTime()) ? agora.getTime() : pedido.getTime()) - 3000, minimo.getTime()));

  const linhas = await prisma.avisos_equipe.findMany({
    where: { created_at: { gt: desde } },
    orderBy: { created_at: "asc" },
    take: 15,
    include: { parceiros: { select: { nome: true } } }
  });

  const avisos = linhas.map((a) => {
    const tipo = TIPOS_AVISO[a.tipo];
    const nome = a.parceiros?.nome?.trim().split(/\s+/).slice(0, 2).join(" ") ?? "Um corretor";
    return {
      id: a.id,
      icone: tipo?.icone ?? "🔔",
      titulo: tipo ? tipo.titulo(nome) : `${nome}: ${a.tipo}`,
      detalhe: a.detalhe,
      url: a.url,
      criadoEm: a.created_at.toISOString()
    };
  });
  return NextResponse.json({ agora: agora.toISOString(), avisos });
}
