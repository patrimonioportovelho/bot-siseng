import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, logAlteracao } from "@/lib/auth";
import { enviarEmail } from "@/lib/email";
import { FUNCOES_EQUIPE } from "@/lib/parceiros/opcoes";

const CATEGORIAS_EMAIL_EVENTO = [...FUNCOES_EQUIPE, "Todos"];

// Pausa entre um envio e o próximo (ms). Não é sobre limite de conexão —
// é pra não ficar em rajada. Ver comentário completo abaixo.
const PAUSA_ENTRE_ENVIOS_MS = 700;

// POST /eventos/[id]/enviar-email
// Body: { categoria }
// Substitui a antiga Server Action enviarEmailEventoAction. Duas correções
// aconteceram aqui em 12/08/2026, uma em cima da outra:
//
// 1ª tentativa: achei que o problema era limite de conexão SMTP simultânea
// (a antiga mandava tudo com Promise.all) e troquei por lotes + pool no
// transporter. ERRADO — conferido depois na caixa de saída do Gmail
// (patrimonioportovelho@gmail.com): dos 20 convites de um disparo real, os
// 13 pra e-mail corporativo (@remax.com.br) foram todos entregues, e os 7
// pra Gmail/Hotmail pessoal voltaram TODOS com bounce do próprio Gmail —
// "Delivery Status Notification (Failure)", SMTP 5.7.1 "Message rejected".
//
// Causa real: é o filtro antispam do Gmail/Hotmail do LADO DE QUEM RECEBE.
// Uma conta pessoal (@gmail.com) mandando o mesmo texto de convite pra
// vários destinatários de uma vez tem cara de disparo em massa, e outros
// provedores de webmail recusam a mensagem na entrada — sem relação
// nenhuma com quantas conexões SMTP estavam abertas ao mesmo tempo.
// Domínio corporativo geralmente não aplica esse filtro tão forte, por
// isso passou 100% pro @remax.com.br.
//
// Não tem fix 100% garantido enquanto o remetente for uma conta pessoal do
// Gmail (a solução definitiva seria migrar pra um serviço de e-mail
// transacional com domínio próprio verificado — decisão que o usuário
// preferiu não tomar agora, 12/08/2026). Mitigação aplicada: manda UM POR
// VEZ (não em paralelo) com uma pausa entre cada envio, pra reduzir a cara
// de rajada — reduz o risco, não elimina. Continua devolvendo o progresso
// em streaming (uma linha JSON por envio) pra tela mostrar "X de Y", e o
// resultado final lista quem falhou pra dar pra avisar por outro canal
// (WhatsApp etc.) quem não recebeu o convite por e-mail.
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
      const falhas: { nome: string; email: string; erro: string }[] = [];

      // Um por vez, com pausa entre cada um — não é sobre conexão (ver
      // comentário no topo do arquivo), é pra não mandar em rajada.
      for (let i = 0; i < destinatarios.length; i++) {
        const p = destinatarios[i];
        const resultado = await enviarEmail({ to: p.email as string, subject: `Convite: ${evento.nome}`, html });
        if (resultado.ok) {
          enviados++;
        } else {
          falhas.push({ nome: p.nome, email: p.email as string, erro: resultado.erro });
        }

        controller.enqueue(
          encoder.encode(
            JSON.stringify({ tipo: "progresso", feito: i + 1, total, enviados, falharam: falhas.length }) + "\n"
          )
        );

        if (i < destinatarios.length - 1) {
          await new Promise((r) => setTimeout(r, PAUSA_ENTRE_ENVIOS_MS));
        }
      }

      await logAlteracao({
        entidadeTipo: "eventos",
        entidadeId: id,
        acao: "enviar_email",
        dadosDepois: { categoria, enviados, falharam: falhas.length, falhas, enviado_por: sessao.nome }
      });

      controller.enqueue(
        encoder.encode(
          JSON.stringify({ tipo: "concluido", enviados, falharam: falhas.length, total, falhas }) + "\n"
        )
      );
      controller.close();
    }
  });

  return new NextResponse(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" }
  });
}
