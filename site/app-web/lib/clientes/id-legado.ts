import { prisma } from "@/lib/prisma";

// Id sequencial (CL-0001, CL-0002, ...) gerado para todo cliente novo,
// seja cadastrado pelo admin (app/clientes/actions.ts) ou criado "no meio
// do caminho" quando um corretor registra um negócio no portal com um
// cliente que ainda não existe (Compra e Venda, Locação, Administração,
// Gestão, Avaliação de CPF) — mesmo padrão do ADM- em administrações e do
// CV-/LOC- em transações. Pedido do usuário em 05/08/2026: o uuid interno
// (cliente.id) é grande demais pra reconhecer no dia a dia.
//
// Usa $queryRaw (em vez de findMany + loop em JS) pelo mesmo motivo do
// gerarProximoIdCV/gerarProximoIdLocacao em app/portal/*/actions.ts:
// cliente pode ser criado a qualquer momento por várias telas do portal ao
// mesmo tempo, então soma o maior número direto no banco fica mais seguro
// contra corrida do que trazer tudo pra JS. Registros antigos importados da
// planilha (id_legado fora do padrão "CL-<número>") são ignorados no MAX,
// não travam o cálculo.
export async function gerarProximoIdCliente(): Promise<string> {
  const resultado = await prisma.$queryRaw<{ maior: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(id_legado FROM 4) AS INTEGER)) AS maior
    FROM clientes
    WHERE id_legado LIKE 'CL-%' AND id_legado ~ '^CL-[0-9]+$'
  `;
  const maior = Number(resultado[0]?.maior ?? 0);
  return `CL-${String(maior + 1).padStart(4, "0")}`;
}

// Cria vários clientes novos UM DE CADA VEZ (nunca em paralelo) — usado nas
// telas do portal que aceitam mais de um cliente novo na mesma submissão
// (ex.: compradores/vendedores em Compra e Venda, locatários/proprietários
// em Locação, proprietários em Gestão/Administração). Bug evitado aqui:
// gerarProximoIdCliente lê o maior número atual e só o INSERT seguinte
// grava o próximo — se dois clientes novos fossem criados em paralelo
// (Promise.all), os dois calculariam o mesmo "próximo número" antes de
// qualquer um terminar de gravar, e o segundo INSERT quebraria com erro de
// chave duplicada (id_legado é @unique). Em sequência, cada criação só
// começa depois que a anterior já gravou, então o próximo cálculo sempre
// vê o número certo.
export async function criarClientesEmSequencia<T, R>(itens: T[], criar: (item: T) => Promise<R>): Promise<R[]> {
  const resultado: R[] = [];
  for (const item of itens) {
    resultado.push(await criar(item));
  }
  return resultado;
}
