import { prisma } from "@/lib/prisma";

// Concatena o endereço de Pessoa Física a partir dos campos divididos
// (CEP/logradouro/número/complemento/bairro/cidade/estado) — mesmo padrão
// de app/imoveis/actions.ts#montarEndereco e app/clientes/actions.ts.
// Compartilhado entre a Central de Clientes do admin e todos os
// formulários do portal do corretor que cadastram cliente na hora, pra não
// duplicar (e desalinhar) essa lógica em 7 lugares diferentes.
export async function montarEnderecoPF(params: {
  rua: string | null;
  nPredial: string | null;
  complemento: string | null;
  bairro: string | null;
  cidadeId: string | null;
  estadoId: string | null;
}): Promise<string | null> {
  const { rua, nPredial, complemento, bairro, cidadeId, estadoId } = params;
  if (!rua && !nPredial && !complemento && !bairro && !cidadeId && !estadoId) return null;

  const [cidade, estado] = await Promise.all([
    cidadeId ? prisma.cidades.findUnique({ where: { id: cidadeId } }) : Promise.resolve(null),
    estadoId ? prisma.estados.findUnique({ where: { id: estadoId } }) : Promise.resolve(null)
  ]);

  const partes = [
    [rua, nPredial].filter(Boolean).join(", ") || null,
    complemento,
    bairro,
    cidade?.nome ?? null,
    estado?.nome ?? null
  ].filter((p): p is string => Boolean(p));

  return partes.length > 0 ? partes.join(" - ") : null;
}
