import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, logAlteracao } from "@/lib/auth";
import { acessosDaSessao, nivelEmModulos } from "@/lib/acessos";
import { enviarLoteResend, enviarUmPeloResend } from "@/lib/email";

// Hobby: 60 s por chamada. Cada chamada manda o que couber (em lotes de 50, que é
// bem mais rápido do que um por vez) e devolve o que falta; a tela chama de novo
// até acabar. Se a tela fechar no meio, o disparo fica "enviando" e continua de
// onde parou pelo botão "Continuar envio".
export const maxDuration = 60;

const TAMANHO_LOTE = 50;
const ORCAMENTO_MS = 40_000;
const PAUSA_ENTRE_LOTES_MS = 250;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST /documentos/disparo-email/lote   Body: { disparoId }
export async function POST(request: NextRequest) {
  const sessao = await getAdminSession();
  if (!sessao) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  if (nivelEmModulos(acessosDaSessao(sessao), ["documentos"]) !== "editar") {
    return NextResponse.json({ erro: "Sem permissão para disparar e-mails." }, { status: 403 });
  }

  const { disparoId } = (await request.json().catch(() => ({}))) as { disparoId?: string };
  if (!disparoId) return NextResponse.json({ erro: "Disparo não informado." }, { status: 400 });

  const disparo = await prisma.disparos_email.findUnique({ where: { id: disparoId } });
  if (!disparo) return NextResponse.json({ erro: "Disparo não encontrado." }, { status: 404 });

  const cabecalhos: Record<string, string> | undefined = disparo.responder_para
    ? { "List-Unsubscribe": `<mailto:${disparo.responder_para}?subject=Remover%20da%20lista>` }
    : undefined;

  const inicio = Date.now();
  let pausa: string | null = null;

  while (Date.now() - inicio < ORCAMENTO_MS) {
    const lote = await prisma.disparos_email_destinatarios.findMany({
      where: { disparo_id: disparoId, status: "pendente" },
      orderBy: { id: "asc" },
      take: TAMANHO_LOTE
    });
    if (lote.length === 0) break;

    const mensagens = lote.map((d) => ({
      to: d.email,
      subject: disparo.assunto,
      html: disparo.html,
      replyTo: disparo.responder_para ?? undefined,
      headers: cabecalhos
    }));
    // mesma chave para o mesmo lote: se a chamada for repetida (queda de conexão), o Resend não manda duas vezes
    const r = await enviarLoteResend(mensagens, {
      nomeRemetente: disparo.remetente_nome,
      idempotencyKey: `disparo-${disparoId}-${lote[0].id}-${lote.length}`
    });

    const agora = new Date();
    if (r.ok) {
      const ok = lote.filter((_, i) => r.resultados[i]?.ok).map((d) => d.id);
      if (ok.length > 0) {
        await prisma.disparos_email_destinatarios.updateMany({ where: { id: { in: ok } }, data: { status: "enviado", enviado_em: agora, erro: null } });
      }
      await Promise.all(
        lote.map((d, i) => {
          const res = r.resultados[i];
          return res && !res.ok
            ? prisma.disparos_email_destinatarios.update({ where: { id: d.id }, data: { status: "falhou", erro: res.erro.slice(0, 300) } })
            : null;
        })
      );
    } else if (r.codigo === "cota_diaria" || r.codigo === "cota_mensal") {
      pausa =
        r.codigo === "cota_diaria"
          ? "O limite diário de envios do Resend foi atingido. Os e-mails que faltam continuam amanhã, em “Continuar envio”."
          : "O limite mensal de envios do Resend foi atingido. Para continuar, aumente o plano do Resend ou aguarde o próximo mês.";
      break;
    } else if (r.codigo === "sem_chave") {
      pausa = "A chave do Resend (RESEND_API_KEY) não está configurada no servidor.";
      break;
    } else {
      // lote recusado por inteiro (ex.: erro de validação): tenta um por um para achar o que falhou
      for (const d of lote) {
        const um = await enviarUmPeloResend({
          to: d.email,
          subject: disparo.assunto,
          html: disparo.html,
          replyTo: disparo.responder_para ?? undefined,
          nomeRemetente: disparo.remetente_nome
        });
        await prisma.disparos_email_destinatarios.update({
          where: { id: d.id },
          data: um.ok ? { status: "enviado", enviado_em: new Date(), erro: null } : { status: "falhou", erro: um.erro.slice(0, 300) }
        });
        if (!um.ok && /quota/i.test(um.erro)) {
          pausa = "O limite de envios do Resend foi atingido. Os e-mails que faltam continuam depois, em “Continuar envio”.";
          break;
        }
        await dormir(150);
      }
      if (pausa) break;
    }
    await dormir(PAUSA_ENTRE_LOTES_MS);
  }

  const grupos = await prisma.disparos_email_destinatarios.groupBy({ by: ["status"], where: { disparo_id: disparoId }, _count: { _all: true } });
  const contagem = (s: string) => grupos.find((g) => g.status === s)?._count._all ?? 0;
  const enviados = contagem("enviado");
  const falhas = contagem("falhou");
  const pendentes = contagem("pendente");
  const status = pendentes === 0 ? "concluido" : pausa ? "pausado" : "enviando";

  await prisma.disparos_email.update({
    where: { id: disparoId },
    data: {
      enviados,
      falhas,
      status,
      motivo_pausa: pausa,
      concluido_em: status === "concluido" ? new Date() : null
    }
  });

  if (status === "concluido" && disparo.status !== "concluido") {
    await logAlteracao({
      entidadeTipo: "disparos_email",
      entidadeId: disparoId,
      acao: "concluir_disparo_email",
      dadosDepois: { assunto: disparo.assunto, enviados, falhas }
    }).catch(() => undefined);
  }

  return NextResponse.json({ enviados, falhas, pendentes, total: enviados + falhas + pendentes, status, motivoPausa: pausa });
}
