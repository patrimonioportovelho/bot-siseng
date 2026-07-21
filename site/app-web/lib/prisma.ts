import { PrismaClient } from "@prisma/client";
import { normalizarNomeProprio } from "./clientes/normalizar-nome";

// Padroniza a capitalização do nome do Cliente automaticamente em todo
// prisma.clientes.create/update, não importa de qual Server Action venha
// (admin, portal do corretor, consulta de CPF etc.) — pedido do usuário
// depois de achar cadastros salvos em CAIXA ALTA, tudo minúsculo ou mistura
// errada, o que também saía errado nos documentos gerados (que usam
// cliente.nome direto). Não mexe em Pessoa Jurídica (razão social costuma
// ter sigla tipo LTDA/ME/S.A. que não pode virar minúscula).
function criarPrismaClient() {
  const base = new PrismaClient();

  return base.$extends({
    name: "normalizar-nome-cliente",
    query: {
      clientes: {
        async create({ args, query }) {
          const data = args.data as { nome?: unknown; tipo_cliente?: unknown };
          if (typeof data.nome === "string" && data.tipo_cliente !== "Pessoa Jurídica") {
            data.nome = normalizarNomeProprio(data.nome);
          }
          return query(args);
        },
        async update({ args, query }) {
          const data = args.data as { nome?: unknown; set?: unknown; tipo_cliente?: unknown };
          if (typeof data.nome === "string") {
            let ehPessoaJuridica = data.tipo_cliente === "Pessoa Jurídica";
            // Update parcial que não manda tipo_cliente junto (ex.: só
            // trocando o nome) — confere o tipo já salvo antes de decidir,
            // pra não mexer em razão social de Pessoa Jurídica.
            if (typeof data.tipo_cliente === "undefined") {
              const atual = await base.clientes.findUnique({
                where: args.where,
                select: { tipo_cliente: true }
              });
              ehPessoaJuridica = atual?.tipo_cliente === "Pessoa Jurídica";
            }
            if (!ehPessoaJuridica) {
              data.nome = normalizarNomeProprio(data.nome);
            }
          }
          return query(args);
        }
      }
    }
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof criarPrismaClient> };

export const prisma = globalForPrisma.prisma ?? criarPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
