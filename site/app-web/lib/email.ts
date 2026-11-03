import nodemailer from "nodemailer";

// ENVIO DE E-MAIL — dois caminhos (30/10/2026):
//  1) Resend (preferido), com remetente do domínio do SisEng: usado quando
//     RESEND_API_KEY está definida. Remetente em EMAIL_FROM (padrão:
//     "SisEng <avisos@sisengimob.com.br>"; o domínio precisa estar verificado no
//     Resend). Chamada direta à API REST, sem biblioteca nova.
//  2) Gmail SMTP (abaixo): continua sendo o caminho quando não há chave do
//     Resend e também o plano B se o Resend falhar (ex.: domínio ainda não
//     verificado) — assim nenhum e-mail de aviso se perde durante a migração.

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
// O endereço do remetente sempre é o de GMAIL_USER: o Gmail rejeita (ou
// marca como suspeito) emails enviados "de" um endereço diferente do
// autenticado, então não dá pra customizar o endereço livremente como no
// Resend. O NOME de exibição, esse sim dá pra trocar — é só o texto antes
// do "<endereço>" no header From, o Gmail não mexe nisso.

// Extraído numa função à parte (em vez de chamar nodemailer.createTransport
// direto dentro de client()) só pra ReturnType<typeof criarTransporter>
// inferir o mesmo overload usado na chamada de verdade — com `pool: true`
// nas options, o TypeScript do nodemailer resolve pra um tipo de retorno
// diferente do createTransport() sem argumentos, e ReturnType<typeof
// nodemailer.createTransport> (sem chamar a função) pega o overload errado.
// Bug só apareceu quando o @types/nodemailer passou a resolver de verdade
// (antes o módulo nem era encontrado no ambiente).
function criarTransporter(user: string, pass: string) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    // connectionTimeout/greetingTimeout curtos (15s) pegam rápido uma
    // conexão morta (bloqueio de saída SMTP, credencial travando no
    // handshake). socketTimeout maior (45s): o envio agora roda em after()
    // do Next (não trava mais o formulário do corretor), então um e-mail
    // legítimo com alguns MB de anexo tem folga pra terminar de subir sem
    // ser cortado — antes eram 20s e um e-mail com documento pesado batia
    // nesse teto e falhava. Ver ORCAMENTO_ANEXOS_BYTES nos actions do portal.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 45000,
    // Pool de conexões (12/08/2026): mantém no máximo `maxConnections`
    // conexões SMTP abertas em vez de uma nova por sendMail(). ATENÇÃO:
    // isto NÃO foi a causa do disparo de evento que só saiu ~12-13 de 31
    // — aquilo era limite de conexão simultânea, uma teoria que pareceu
    // razoável mas se provou errada ao checar a caixa de saída real do
    // Gmail (ver comentário grande em app/eventos/[id]/enviar-email/
    // route.ts): a causa de verdade é o filtro antispam do lado de quem
    // RECEBE (Gmail/Hotmail pessoal recusando mensagem em rajada vinda de
    // conta pessoal), o que pool nenhum resolve. Deixado mesmo assim como
    // proteção defensiva de baixo custo — evita abrir conexão demais se
    // algum chamador futuro mandar vários enviarEmail() em paralelo.
    pool: true,
    maxConnections: 3,
    maxMessages: 100
  });
}

let transporter: ReturnType<typeof criarTransporter> | null = null;

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
    transporter = criarTransporter(user, pass);
  }
  return transporter;
}

export type EmailAnexo = {
  filename: string;
  content: Buffer;
};

export type EnviarEmailResultado = { ok: true; via?: "resend" | "gmail" } | { ok: false; erro: string };

type ParametrosEmail = {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAnexo[];
  replyTo?: string;
};

const REMETENTE_PADRAO_RESEND = "SisEng <avisos@sisengimob.com.br>";
const ESPERA_ENTRE_TENTATIVAS_MS = [1100, 2500, 5000];
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resend: POST /emails. O plano grátis limita a poucas requisições por segundo
// (HTTP 429) — quando isso acontece, espera e tenta de novo, em vez de perder o
// e-mail (importante no disparo de convites de evento, que manda vários em fila).
async function enviarPeloResend(chave: string, params: ParametrosEmail): Promise<EnviarEmailResultado> {
  const corpo = JSON.stringify({
    from: process.env.EMAIL_FROM || REMETENTE_PADRAO_RESEND,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
    ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    ...(params.attachments?.length
      ? { attachments: params.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) }
      : {})
  });

  let ultimoErro = "";
  for (let tentativa = 0; tentativa <= ESPERA_ENTRE_TENTATIVAS_MS.length; tentativa++) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
        body: corpo
      });
      if (r.ok) return { ok: true, via: "resend" };
      const detalhe = await r.text().catch(() => "");
      ultimoErro = `Resend ${r.status}: ${detalhe.slice(0, 300)}`;
      // só vale tentar de novo quando é limite de velocidade (429) ou erro do servidor deles (5xx)
      if (r.status !== 429 && r.status < 500) break;
    } catch (e) {
      ultimoErro = `Resend: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (tentativa < ESPERA_ENTRE_TENTATIVAS_MS.length) await dormir(ESPERA_ENTRE_TENTATIVAS_MS[tentativa]);
  }
  return { ok: false, erro: ultimoErro || "Falha ao enviar pelo Resend." };
}

async function enviarPeloGmail(params: ParametrosEmail): Promise<EnviarEmailResultado> {
  const endereco = process.env.GMAIL_USER;
  if (!endereco) {
    return { ok: false, erro: "GMAIL_USER não configurado no .env — veja .env.example." };
  }
  const from = `"SisEng" <${endereco}>`;

  try {
    await client().sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
      attachments: params.attachments?.map((a) => ({ filename: a.filename, content: a.content }))
    });
    return { ok: true, via: "gmail" };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

export async function enviarEmail(params: ParametrosEmail): Promise<EnviarEmailResultado> {
  const chaveResend = process.env.RESEND_API_KEY;
  if (!chaveResend) return enviarPeloGmail(params);

  const r = await enviarPeloResend(chaveResend, params);
  if (r.ok) return r;
  // Plano B: se o Resend recusou (domínio não verificado, chave errada...) e o Gmail está
  // configurado, entrega por ele e deixa o motivo no log do servidor.
  console.warn(`[email] ${r.erro} — usando o Gmail como plano B.`);
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const g = await enviarPeloGmail(params);
    if (g.ok) return g;
    return { ok: false, erro: `${r.erro} | Gmail: ${g.erro}` };
  }
  return r;
}

// ---------------------------------------------------------------------------
// Disparo em massa (Documentos > Disparo de e-mail) — 03/11/2026.
// Só pelo Resend (nunca pelo Gmail: conta pessoal em rajada é bloqueada). Usa o
// envio em lote do Resend (até 100 e-mails por chamada).
// ---------------------------------------------------------------------------

export type MensagemLote = { to: string; subject: string; html: string; replyTo?: string; headers?: Record<string, string> };

export type ResultadoLote =
  | { ok: true; resultados: ({ ok: true } | { ok: false; erro: string })[] }
  // cota_diaria / cota_mensal: o limite do plano acabou — o disparo pausa e continua depois.
  | { ok: false; erro: string; codigo: "cota_diaria" | "cota_mensal" | "sem_chave" | "outro" };

// "SisEng <avisos@sisengimob.com.br>" -> avisos@sisengimob.com.br
export function enderecoRemetente(): string {
  const bruto = process.env.EMAIL_FROM || REMETENTE_PADRAO_RESEND;
  return /<([^>]+)>/.exec(bruto)?.[1]?.trim() || bruto.trim();
}

function remetenteComNome(nome: string): string {
  const limpo = nome.replace(/["<>\r\n]/g, "").trim() || "SisEng";
  return `${limpo} <${enderecoRemetente()}>`;
}

function classificarErroResend(status: number, detalhe: string): "cota_diaria" | "cota_mensal" | "limite_taxa" | "outro" {
  const t = detalhe.toLowerCase();
  if (t.includes("daily_quota") || (t.includes("daily") && t.includes("quota"))) return "cota_diaria";
  if (t.includes("monthly_quota") || (t.includes("monthly") && t.includes("quota"))) return "cota_mensal";
  if (status === 429) return "limite_taxa";
  return "outro";
}

// Um e-mail pelo Resend, sem plano B (usado no teste do disparo e quando o lote é recusado).
export async function enviarUmPeloResend(params: ParametrosEmail & { nomeRemetente?: string }): Promise<EnviarEmailResultado> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) return { ok: false, erro: "RESEND_API_KEY não configurada." };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: remetenteComNome(params.nomeRemetente ?? "SisEng"),
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      ...(params.replyTo ? { reply_to: params.replyTo } : {})
    })
  }).catch((e: unknown) => e as Error);
  if (r instanceof Error) return { ok: false, erro: `Resend: ${r.message}` };
  if (r.ok) return { ok: true, via: "resend" };
  return { ok: false, erro: `Resend ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}` };
}

export async function enviarLoteResend(
  mensagens: MensagemLote[],
  opcoes: { nomeRemetente: string; idempotencyKey: string }
): Promise<ResultadoLote> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) return { ok: false, erro: "RESEND_API_KEY não configurada.", codigo: "sem_chave" };

  const corpo = JSON.stringify(
    mensagens.map((m) => ({
      from: remetenteComNome(opcoes.nomeRemetente),
      to: [m.to],
      subject: m.subject,
      html: m.html,
      ...(m.replyTo ? { reply_to: m.replyTo } : {}),
      ...(m.headers ? { headers: m.headers } : {})
    }))
  );

  let ultimoErro = "";
  for (let tentativa = 0; tentativa <= ESPERA_ENTRE_TENTATIVAS_MS.length; tentativa++) {
    try {
      const r = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${chave}`,
          "Content-Type": "application/json",
          "Idempotency-Key": opcoes.idempotencyKey,
          // endereço inválido derruba só aquele e-mail, não o lote inteiro
          "x-batch-validation": "permissive"
        },
        body: corpo
      });
      const texto = await r.text().catch(() => "");
      if (r.ok) {
        let erros: { index: number; message?: string }[] = [];
        try {
          erros = (JSON.parse(texto) as { errors?: { index: number; message?: string }[] }).errors ?? [];
        } catch {
          // resposta sem JSON legível: trata como enviado
        }
        const porIndice = new Map(erros.map((e) => [e.index, e.message ?? "Endereço recusado pelo Resend."]));
        return {
          ok: true,
          resultados: mensagens.map((_, i) => (porIndice.has(i) ? { ok: false as const, erro: porIndice.get(i) as string } : { ok: true as const }))
        };
      }
      ultimoErro = `Resend ${r.status}: ${texto.slice(0, 300)}`;
      const tipo = classificarErroResend(r.status, texto);
      if (tipo === "cota_diaria" || tipo === "cota_mensal") return { ok: false, erro: ultimoErro, codigo: tipo };
      if (tipo !== "limite_taxa" && r.status < 500) break;
    } catch (e) {
      ultimoErro = `Resend: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (tentativa < ESPERA_ENTRE_TENTATIVAS_MS.length) await dormir(ESPERA_ENTRE_TENTATIVAS_MS[tentativa]);
  }
  return { ok: false, erro: ultimoErro || "Falha ao enviar o lote pelo Resend.", codigo: "outro" };
}
