import { prisma } from "@/lib/prisma";

// Id sequencial (EV-0001, EV-0002, ...) gerado pra todo Evento novo — mesmo
// padrão de CL-/ADM-/CV-/LOC-/AVL-/OM- no resto do sistema.
//
// Usa $queryRaw (mesmo motivo de lib/avaliacoes/id-legado.ts): soma o maior
// número direto no banco, mais seguro contra corrida do que trazer tudo pra
// JS e calcular por lá.
export async function gerarProximoIdEvento(): Promise<string> {
  const resultado = await prisma.$queryRaw<{ maior: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(id_legado FROM 4) AS INTEGER)) AS maior
    FROM eventos
    WHERE id_legado LIKE 'EV-%' AND id_legado ~ '^EV-[0-9]+$'
  `;
  const maior = Number(resultado[0]?.maior ?? 0);
  return `EV-${String(maior + 1).padStart(4, "0")}`;
}
