import { prisma } from "@/lib/prisma";

// Id sequencial (OM-0001, OM-0002, ...) gerado pra toda Ordem de Marketing
// nova — mesmo padrão do AVL- em Avaliação de CPF (lib/avaliacoes/id-legado.ts),
// CL- em clientes, ADM- em administrações e CV-/LOC- em transações.
export async function gerarProximoIdOrdemMarketing(): Promise<string> {
  const resultado = await prisma.$queryRaw<{ maior: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(id_legado FROM 4) AS INTEGER)) AS maior
    FROM marketing_ordens
    WHERE id_legado LIKE 'OM-%' AND id_legado ~ '^OM-[0-9]+$'
  `;
  const maior = Number(resultado[0]?.maior ?? 0);
  return `OM-${String(maior + 1).padStart(4, "0")}`;
}
