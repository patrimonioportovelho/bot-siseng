// Helper compartilhado pro selo "Novo" que aparece nas listagens
// (Administrações, Parceiros, Clientes, Locação, Compra e Venda,
// Financiamento) — pedido do usuário em 06/08/2026: destacar cadastro
// recente pra não passar despercebido, especialmente o que vem do portal
// do corretor sem o administrativo ter batido o olho ainda.
//
// Não precisa de nenhum campo "visualizado" no banco: é só a diferença
// entre agora e created_at, com uma janela fixa de alguns dias — depois
// disso o destaque some sozinho.
const DIAS_PARA_CONSIDERAR_NOVO = 3;

export function ehNovo(criadoEm: Date | string | null | undefined): boolean {
  if (!criadoEm) return false;
  const diffMs = Date.now() - new Date(criadoEm).getTime();
  return diffMs >= 0 && diffMs < DIAS_PARA_CONSIDERAR_NOVO * 24 * 60 * 60 * 1000;
}

// Classes do selo "Novo" e do destaque de linha — mesmo visual em toda
// listagem que usa esse selo.
export const SELO_NOVO_CLASSES =
  "text-[10px] font-bold uppercase text-white bg-primary rounded-full px-1.5 py-0.5 shrink-0";
export const LINHA_NOVA_CLASSES = "bg-primary/5 hover:bg-primary/10";
