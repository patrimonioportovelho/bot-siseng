import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { gerarAtaReuniaoDocx, type SecaoAta } from "@/lib/eventos/ata";

// POST /eventos/[id]/ata
// Body: { presentes, observacao, secoes: [{ titulo, itens: string[] }] }
// Gera o .docx da Ata de Reunião na hora (não fica salvo em disco/storage,
// só baixado direto — pedido explícito do usuário, 10/08/2026) e devolve
// como download. Registra em eventos_atas_geradas só QUE foi gerada
// (quem/quando), sem guardar o conteúdo preenchido.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await getAdminSession();
  if (!sessao) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const evento = await prisma.eventos.findUnique({ where: { id } });
  if (!evento || evento.excluido) {
    return NextResponse.json({ erro: "Evento não encontrado." }, { status: 404 });
  }

  const body = (await request.json()) as {
    presentes?: string;
    observacao?: string;
    secoes?: SecaoAta[];
  };

  try {
    const buffer = await gerarAtaReuniaoDocx({
      nomeEvento: evento.nome,
      data: evento.data_inicio.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
      local: evento.local ?? "",
      presentes: body.presentes ?? "",
      observacao: body.observacao ?? "",
      secoes: Array.isArray(body.secoes) ? body.secoes : []
    });

    await prisma.eventos_atas_geradas.create({
      data: { evento_id: id, gerado_por_parceiro_id: sessao.parceiroId }
    });

    const nomeArquivo = `Ata - ${evento.nome} - ${evento.data_inicio.toLocaleDateString("pt-BR", { timeZone: "UTC" }).replace(/\//g, "-")}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(nomeArquivo)}"`
      }
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao gerar a ata.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
