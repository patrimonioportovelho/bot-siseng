// Anúncio do imóvel no site (remax.com.br): ID + link. Regras compartilhadas entre a janela de confirmação do quadro
// (cliente) e as Server Actions (servidor) — por isso este arquivo NÃO é "use server" nem "use client".
//
// Exemplo de ID: 721551039-63 · Exemplo de link:
// https://www.remax.com.br/pt-br/imoveis/chacara/-sitio/-fazenda/venda/porto-velho/s-n-br-364-km-8-balneario-do-baiano/721551039-63
// (o link termina com o próprio ID).

// Padrão "geralmente" usado (pedido do usuário): bloco longo de números, hífen e 1 a 4 números. Deixado um pouco
// largo de propósito para não barrar um ID legítimo fora do comum.
export const PADRAO_ID_ANUNCIO = /^\d{5,}-\d{1,4}$/;
export const EXEMPLO_ID_ANUNCIO = "721551039-63";

// Resposta da confirmação: "não foi anunciado" ou "foi, com este ID e este link".
export type AnuncioInformado = { anunciado: false } | { anunciado: true; id: string; url: string };

// Card em Comercialização que ainda não teve a pergunta "já foi anunciado no site?" respondida (e cujo imóvel não
// tem ID de anúncio cadastrado). Vale para os cards que já estavam em Comercialização antes da pergunta existir:
// ao abrir a ficha ou tentar mover, a confirmação aparece para não ficarem desatualizados.
export function anuncioPendente(
  g: { coluna: string; anuncio_confirmado_em?: Date | string | null },
  anuncioIdDoImovel: string | null | undefined
): boolean {
  return g.coluna === "comercializacao" && !g.anuncio_confirmado_em && !anuncioIdDoImovel;
}

// Devolve o ID que está no fim do link do anúncio (ou null se o link não termina num ID).
export function idDoLinkAnuncio(url: string): string | null {
  const m = url.trim().match(/(\d{5,}-\d{1,4})\/?(?:[?#].*)?$/);
  return m ? m[1] : null;
}

function linkValido(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Mensagem de erro (ou null se estiver tudo certo). O link é obrigatório junto com o ID.
export function validarIdELink(id: string, url: string): string | null {
  const i = id.trim();
  const u = url.trim();
  if (!i && !u) return null;
  if (!i) return "Informe o ID do anúncio.";
  if (!PADRAO_ID_ANUNCIO.test(i)) return `ID do anúncio inválido. Use o padrão ${EXEMPLO_ID_ANUNCIO}.`;
  if (!u) return "Com o ID do anúncio, o link do anúncio é obrigatório.";
  if (!linkValido(u)) return "Link do anúncio inválido. Cole o endereço completo (começa com https://).";
  return null;
}

export function validarAnuncio(a: AnuncioInformado | null | undefined): string | null {
  if (!a || typeof a !== "object") return "Confirme se o imóvel já foi anunciado no site.";
  if (!a.anunciado) return null;
  // vem do navegador: não confia no formato
  if (typeof a.id !== "string" || typeof a.url !== "string") return "Informe o ID e o link do anúncio.";
  if (!a.id.trim()) return "Informe o ID do anúncio.";
  return validarIdELink(a.id, a.url);
}
