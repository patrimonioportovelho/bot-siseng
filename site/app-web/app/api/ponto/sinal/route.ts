import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pessoaTemPonto } from "@/lib/ponto/regras";
import { registrarSinal } from "@/lib/ponto/servidor";

// POST /api/ponto/sinal   Body: { acao: "sinal" | "saida" }
// "sinal": a tela manda a cada minuto enquanto a pessoa está usando o sistema; devolve
// o status (horas da semana, aviso, bloqueio). "saida": a aba foi fechada (navigator.sendBeacon).
export async function POST(request: NextRequest) {
  const sessao = await getAdminSession();
  if (!sessao) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  if (!pessoaTemPonto(sessao)) return NextResponse.json({ controlado: false });

  const corpo = (await request.json().catch(() => ({}))) as { acao?: string };
  const status = await registrarSinal(sessao.parceiroId, corpo.acao === "saida");
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
