// Utilidades de mensagem de WhatsApp compartilhadas pelas etiquetas
// (Recrutamento e Financiamento).

// Troca {chave} pelo valor; sem valor, deixa [chave] pra quem envia completar
// na mão antes de abrir o WhatsApp.
export function preencherMensagem(texto: string, ctx: Record<string, string | null | undefined>): string {
  return texto.replace(/\{(\w+)\}/g, (_, chave: string) => {
    const v = ctx[chave];
    return v && v.trim() ? v : `[${chave.replace(/_/g, " ")}]`;
  });
}

export function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
}

// "no dia 05/11" a partir de yyyy-mm-dd (ou null).
export function diaMensagem(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [, m, d] = iso.split("-");
  return `no dia ${d}/${m}`;
}

export function dataCurta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// Número no formato do link do WhatsApp (código do país + DDD + número).
export function numeroWhatsapp(digitos: string | null | undefined): string | null {
  const d = (digitos ?? "").replace(/\D/g, "");
  if (!d) return null;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return null;
}

export function linkWhatsapp(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
