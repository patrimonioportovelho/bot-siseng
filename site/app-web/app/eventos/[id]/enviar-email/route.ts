import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, logAlteracao } from "@/lib/auth";
import { enviarEmail } from "@/lib/email";
import { FUNCOES_EQUIPE } from "@/lib/parceiros/opcoes";

const CATEGORIAS_EMAIL_EVENTO = [...FUNCOES_EQUIPE, "Todos"];

// Quantos e-mails em paralelo por vez. O transporter (lib/email.ts) já
// limita a 3 conexões simultâneas com o Gmail (pool), então manda em lotes
// desse mesmo tamanho — não adianta preparar mais que isso de uma vez, só
// ia ficar esperando o pool liberar conexão mesmo.
const TAMANHO_LOTE = 3;

// POST /eventos/[id]/enviar-email
// Body: { categoria }
// Substitui a antiga Server Action enviarEmailEventoAction (12/08/2026) —
// aquela mandava todo mundo de uma vez com Promise.all, o que estourava o
// limite de conexões simultâneas do Gmail e derrubava parte do disparo
// silenciosamente (um disparo real de 31 destinatários só saiu ~12-13).
// Essa rota manda em lotes pequenos e devolve o progresso em streaming (uma
// linha JSON por lote concluído) pra tela mostrar "X de Y" em vez de ficar
// travada sem feedback até o fim.
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

  const body = (await request.json().catch(() => ({}))) as { categoria?: string };
  const categoria = body.categoria ?? "Todos";
  if (!CATEGORIAS_EMAIL_EVENTO.includes(categoria)) {
    return NextResponse.json({ erro: "Categoria inválida." }, { status: 400 });
  }

  const funcoes = categoria === "Todos" ? FUNCOES_EQUIPE : [categoria];
  const destinatarios = await prisma.parceiros.findMany({
    where: { funcao: { in: funcoes }, status_funcao: "Ativo", email: { not: null } },
    select: { nome: true, email: true }
  });

  if (destinatarios.length === 0) {
    return NextResponse.json(
      { erro: "Nenhum parceiro ativo com e-mail cadastrado nessa categoria." },
      { status: 400 }
    );
  }

  const dataTexto = evento.data_inicio.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const horarioTexto = [evento.horario_inicio, evento.horario_fim].filter(Boolean).join(" às ");

  const html = `
    <div style="font-family: sans-serif; font-size: 14px; color: #1f2937;">
      <p>Você foi convidado(a) para o evento <strong>${evento.nome}</strong>.</p>
      <p>
        <strong>Data:</strong> ${dataTexto}<br/>
        ${horarioTexto ? `<strong>Horário:</strong> ${horarioTexto}<br/>` : ""}
        ${evento.local ? `<strong>Local:</strong> ${evento.local}<br/>` : ""}
      </p>
      ${evento.descricao ? `<p>${evento.descricao}<\p>` : ""}
      <p style="color:#6b7280; font-size:13px;">Por favor, confirme sua presença no painel — acesse o Portal do Corretor e vá em "Eventos".</p>
    </div>
  `;

  const total = destinatarios.length;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let enviados = 0;
      let falharam = 0;

      // Um envio por destinatário (não um "to" único com todo mundo junto)
      // pra ninguém ver o e-mail dos colegas no cabeçalho — mesmo raciocínio
      // de privacidade de antes, só que agora em lotes de TAMANHO_LOTE em
      // vez de tudo de uma vez.
      for (let inicio = 0; inicio < destinatarios.length; inicio += TAMANHO_LOTE) {
        const lote = destinatarios.slice(inicio, inicio + TAMANHO_LOTE);
        const resultados = await Promise.all(
          lote.map((p) => enviarEmail({ to: p.email as string, subject: `Convite: ${evento.nome}`, html }))
        );
        enviados += resultados.filter((r) => r.ok).length;
        falharam += resultados.length - resultados.filter((r) => r.ok).length;

        controller.enqueue(
          encoder.encode(
            JSON.stringify({ tipo: "progresso", feito: enviados + falharam, total, enviados, falharam }) + "\n"
          )
        );
      }

      await logAlteracao({
        entidadeTipo: "eventos",
        entidadeId: id,
        acao: "enviar_email",
        dadosDepois: { categoria, enviados, falharam, enviado_por: sessao.nome }
      });

      controller.enqueue(encoder.encode(JSON.stringify({ tipo: "concluido", enviados, falharam, total }) + "\n"));
      controller.close();
    }
  });

  return new NextResponse(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" }
  });
}
