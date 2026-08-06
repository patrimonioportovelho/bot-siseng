import { prisma } from "@/lib/prisma";

// Id sequencial (AVL-0001, AVL-0002, ...) gerado pra toda Avaliação de CPF
// nova, seja cadastrada pelo admin (app/financiamento/actions.ts) ou pelo
// corretor via portal (app/portal/avaliacao-cpf/actions.ts) — mesmo padrão
// do CL- em clientes, ADM- em administrações e CV-/LOC- em transações.
// Antes disso o id_legado ficava sempre NULL nessa tabela, e as telas que
// mostram "id_legado ?? id" caíam pro uuid interno gigante (reportado pelo
// usuário em 06/08/2026 no aviso do Dashboard).
//
// Usa $queryRaw (mesmo motivo do gerarProximoIdCliente em
// lib/clientes/id-legado.ts): soma o maior número direto no banco, mais
// seguro contra corrida do que trazer tudo pra JS. Registros antigos sem
// esse padrão (id_legado NULL ou fora do formato "AVL-<número>") ficam de
// fora do MAX, não travam o cálculo.
export async function gerarProximoIdAvaliacao(): Promise<string> {
  const resultado = await prisma.$queryRaw<{ maior: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(id_legado FROM 5) AS INTEGER)) AS maior
    FROM avaliacoes
    WHERE id_legado LIKE 'AVL-%' AND id_legado ~ '^AVL-[0-9]+$'
  `;
  const maior = Number(resultado[0]?.maior ?? 0);
  return `AVL-${String(maior + 1).padStart(4, "0")}`;
}
