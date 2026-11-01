import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { acessosDaSessao, nivelEmModulos } from "@/lib/acessos";
import { lojasSelecionadas } from "@/lib/lojas/filtro";
import { itensDoMes } from "@/lib/calendario/atividades";

export const dynamic = "force-dynamic";

// Itens de um mês do calendário de Atividades, para a tela trocar de mês sem
// recarregar a página. /api/ fica fora do middleware, então sessão e permissão
// (módulo Atividades) são checadas aqui.
export async function GET(req: Request) {
  const sessao = await getAdminSession();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!nivelEmModulos(acessosDaSessao(sessao), ["atividades"])) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });

  const mes = new URL(req.url).searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });
  const [ano, m] = mes.split("-").map(Number);
  if (m < 1 || m > 12 || ano < 1990 || ano > 2100) return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });

  const itens = await itensDoMes({ ano, mesIndice: m - 1, lojas: await lojasSelecionadas() });
  return NextResponse.json({ mes, itens });
}
