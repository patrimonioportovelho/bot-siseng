import nodemailer from "nodemailer";

// Envio de email transacional via Gmail SMTP — usado hoje só pela "Elaboração
// de Compra e Venda" do portal do corretor (lib/erros.ts registra falha
// técnica igual o resto do sistema, mas o envio de email nunca derruba a
// ação principal: se o email falhar, a transação já foi salva do mesmo
// jeito, só o email que não saiu).
//
// GMAIL_USER e GMAIL_APP_PASSWORD precisam estar no .env (ver .env.example).
// GMAIL_APP_PASSWORD é uma "Senha de app" gerada em
// myaccount.google.com/apppasswords (exige verificação em duas etapas
// ativada na conta GMAIL_USER) — não é a senha normal da conta Google.
//
// O remetente do email sempre é o endereço em GMAIL_USER: o Gmail rejeita
// (ou marca como suspeito) emails enviados "de" um endereço diferente do
// autenticado, então não dá pra customizar o "from" livremente como no
// Resend.

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function client() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user) {
    throw new Error("GMAIL_USER não configurado no .env — veja .env.example.");
  }
  if (!pass) {
    throw new Error("GMAIL_APP_PASSWORD não configurado no .env — veja .env.example.");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
      // Sem isso, um problema de rede/Gmail (ex.: bloqueio de saída SMTP,
      // credencial inválida travando no handshake) deixa o envio pendurado
      // até a função serverless do Vercel estourar o tempo máximo dela —
      // e a transação/contrato já cadastrado nem chega a responder pro
      // corretor (a tela fica parada, sem erro nenhum). Com os timeouts
      // abaixo, um problema de conexão vira um erro em ~20s no máximo, que
      // aí sim é capturado e devolvido pro formulário.
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  }
  return transporter;
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
  const from = process.env.GMAIL_USER;
  if (!from) {
    return { ok: false, erro: "GMAIL_USER não configurado no .env — veja .env.example." };
  }

  try {
    await client().sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
      attachments: params.attachments?.map((a) => ({ filename: a.filename, content: a.content }))
    });
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}
