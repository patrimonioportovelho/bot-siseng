import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { espelhoDoPeriodo } from "@/lib/ponto/relatorio";
import { obterConfigPonto } from "@/lib/ponto/servidor";
import { NOMES_DIA, instanteDoDia, partesLocais } from "@/lib/ponto/regras";

const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Porto_Velho" });
const campo = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

function lerYmd(v: string | null): Date | null {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  return m ? instanteDoDia(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

// GET /configuracoes/ponto/[id]/csv?de=AAAA-MM-DD&ate=AAAA-MM-DD — só a diretoria.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await getAdminSession();
  if (!sessao?.isAdm) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  const pessoa = await prisma.parceiros.findUnique({ where: { id }, select: { nome: true } });
  if (!pessoa) return NextResponse.json({ erro: "Pessoa não encontrada." }, { status: 404 });

  const de = lerYmd(request.nextUrl.searchParams.get("de"));
  const ateIncl = lerYmd(request.nextUrl.searchParams.get("ate"));
  if (!de || !ateIncl) return NextResponse.json({ erro: "Informe o período (de e ate)." }, { status: 400 });
  const ate = new Date(Math.min(ateIncl.getTime() + 86400000, de.getTime() + 62 * 86400000));

  const cfg = await obterConfigPonto(id);
  const dias = await espelhoDoPeriodo(id, cfg, de, ate);

  const linhas: string[] = [["Data", "Dia", "Entrada", "Saída", "Minutos", "Origem", "Anulado", "Justificativa", "Total do dia (min)", "Almoço (min)", "Fora do expediente (min)", "Extra autorizada (min)"].map(campo).join(";")];
  for (const d of dias) {
    if (d.periodos.length === 0) {
      if (d.diaSemana <= 5) linhas.push([d.ymd, NOMES_DIA[d.diaSemana], "", "", 0, "", "", "", 0, 0, 0, 0].map(campo).join(";"));
      continue;
    }
    d.periodos.forEach((s, i) => {
      linhas.push(
        [
          d.ymd,
          NOMES_DIA[d.diaSemana],
          hora(s.inicio),
          s.aberto ? "em aberto" : hora(s.fim),
          Math.round((s.fim.getTime() - s.inicio.getTime()) / 60000),
          s.origem === "ajuste_manual" ? "ajuste manual" : "automático",
          s.anulada ? "sim" : "",
          s.justificativa ?? "",
          i === 0 ? Math.round(d.totalMin) : "",
          i === 0 ? Math.round(d.almocoMin) : "",
          i === 0 ? Math.round(d.foraMin) : "",
          i === 0 ? Math.round(d.extraMin) : ""
        ]
          .map(campo)
          .join(";")
      );
    });
  }
  const nomeArquivo = `ponto-${pessoa.nome.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase()}-${partesLocais(de).ymd}.csv`;
  // BOM para o Excel abrir os acentos
  return new NextResponse("﻿" + linhas.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nomeArquivo}"`, "Cache-Control": "no-store" }
  });
}
