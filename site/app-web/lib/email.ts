import { Resend } from "resend";

// Envio de email transacional via Resend — usado hoje só pela "Elaboração
// de Compra e Venda" do portal do corretor (lib/erros.ts registra falha
// técnica igual o resto do sistema, mas o envio de email nunca derruba a
// ação principal: se o email falhar, a transação já foi salva do mesmo
// jeito, só o email que não saiu).
//
// RESEND_API_KEY e EMAIL_REMETENTE precisam estar no .env (ver .env.example).
// O remetente precisa ser de um domínio verificado no painel do Resend
// (Domains → Add Domain → registros SPF/DKIM no DNS) — sem isso o envio
// falha com erro de domínio não verificado.

let resendClient: Resend | null = null;

function client(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY não configurado no .env — veja .env.example.");
  }
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

export type EmailAnexo = {
  filename: string;
  content: Buffer;
};

export type EnviarEmailResultado = { ok: true } | { ok: false; erro: string };

export async function enviarEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAnexo[];
  replyTo?: string;
}): Promise<EnviarEmailResultado> {
  const from = process.env.EMAIL_REMETENTE;
  if (!from) {
    return { ok: false, erro: "EMAIL_REMETENTE não configurado no .env — veja .env.example." };
  }

  try {
    const { error } = await client().emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
      attachments: params.attachments?.map((a) => ({ filename: a.filename, content: a.content }))
    });

    if (error) {
      return { ok: false, erro: error.message ?? "Falha ao enviar email (Resend)." };
    }
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}
