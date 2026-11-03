// Disparo de e-mail em massa (Documentos > Disparo de e-mail). Arquivo puro (sem
// banco): o formulário usa para a prévia e o servidor para montar o e-mail final,
// então o que aparece na prévia é exatamente o que sai.

// Proporções de imagem. A imagem é recortada (centro, ou o ponto de foco escolhido)
// e redimensionada no navegador antes do envio, então todo e-mail sai com a mesma
// largura e a altura da proporção marcada. Tamanhos em pixels pensados para telas
// de alta densidade (o e-mail mostra a imagem com 600 px de largura).
export type ProporcaoImagem = { id: string; rotulo: string; largura: number; altura: number };

export const PROPORCOES_IMAGEM: ProporcaoImagem[] = [
  { id: "1:1", rotulo: "Quadrado 1:1", largura: 1080, altura: 1080 },
  { id: "4:5", rotulo: "Retrato 4:5", largura: 1080, altura: 1350 },
  { id: "3:2", rotulo: "Paisagem 3:2", largura: 1200, altura: 800 },
  { id: "16:9", rotulo: "Paisagem 16:9", largura: 1200, altura: 675 },
  { id: "2:1", rotulo: "Faixa 2:1", largura: 1200, altura: 600 },
  { id: "3:1", rotulo: "Banner 3:1", largura: 1200, altura: 400 },
  // 0 = mantém a proporção da imagem (só reduz se passar de 1200 px de largura)
  { id: "original", rotulo: "Original (sem recorte)", largura: 0, altura: 0 }
];

export const LARGURA_MAXIMA_ORIGINAL = 1200;

const COR_MARCA = "#04075c";

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Aceita "meusite.com.br/pagina" (sem http) e só deixa passar http/https.
export function normalizarLink(bruto: string): string | null {
  const t = bruto.trim();
  if (!t) return null;
  const comEsquema = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(comEsquema);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export type ConteudoDisparo = {
  titulo: string;
  mensagem: string;
  imagemUrl: string | null;
  linkUrl: string | null;
  linkTexto: string;
};

// Parágrafos separados por linha em branco; quebra simples vira <br>.
function mensagemEmHtml(mensagem: string): string {
  return mensagem
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#374151;text-align:center;">${escaparHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

// E-mail em tabelas com estilos inline (único jeito que funciona em todos os
// leitores), sempre centralizado e com 600 px de largura.
export function montarHtmlDisparo(c: ConteudoDisparo, assunto: string): string {
  const link = c.linkUrl ? normalizarLink(c.linkUrl) : null;
  const textoBotao = escaparHtml(c.linkTexto.trim() || "Acessar");

  const imagem = c.imagemUrl
    ? `<tr><td align="center" style="padding:0;font-size:0;line-height:0;"><img src="${escaparHtml(c.imagemUrl)}" alt="${escaparHtml(assunto)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;"/></td></tr>`
    : "";
  const titulo = c.titulo.trim()
    ? `<h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;color:${COR_MARCA};text-align:center;font-family:Arial,Helvetica,sans-serif;">${escaparHtml(c.titulo.trim())}</h1>`
    : "";
  const botao = link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 0 auto;"><tr><td align="center" bgcolor="${COR_MARCA}" style="border-radius:8px;"><a href="${escaparHtml(link)}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">${textoBotao}</a></td></tr></table>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escaparHtml(assunto)}</title></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
${imagem}
<tr><td align="center" style="padding:28px 32px 32px 32px;font-family:Arial,Helvetica,sans-serif;text-align:center;">
${titulo}${mensagemEmHtml(c.mensagem)}${botao}
</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;"><tr><td align="center" style="padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center;">
Você recebeu este e-mail por fazer parte do nosso cadastro. Para deixar de receber, responda esta mensagem pedindo a remoção.
</td></tr></table>
</td></tr></table>
</body></html>`;
}
