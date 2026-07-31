import { prisma } from "@/lib/prisma";

export type ParceiroDuplicado = {
  id: string;
  nome: string;
  funcao: string;
  statusFuncao: string;
};

// Diferente de lib/clientes/duplicidade.ts (que bloqueia se o nome OU o
// documento já baterem — dois parceiros podem legitimamente ter o mesmo
// nome, homônimos são comuns), aqui o pedido foi específico: só é duplicata
// de verdade quando NOME e CPF batem os DOIS ao mesmo tempo. Cadastro
// "Excluído" (soft-delete) não conta — depois de apagar um parceiro, dá pra
// recadastrar a mesma pessoa sem ficar preso ao registro antigo.
export async function buscarParceiroDuplicado(params: {
  nome: string;
  cpf?: string | null;
  ignorarIds?: string[];
}): Promise<ParceiroDuplicado | null> {
  const nome = params.nome.trim();
  const cpf = params.cpf ? params.cpf.replace(/\D/g, "") : "";
  if (!nome || !cpf) return null;

  const encontrado = await prisma.parceiros.findFirst({
    where: {
      nome: { equals: nome, mode: "insensitive" },
      cpf,
      status_funcao: { not: "Excluído" },
      ...(params.ignorarIds && params.ignorarIds.length > 0 ? { id: { notIn: params.ignorarIds } } : {})
    },
    orderBy: { created_at: "asc" }
  });

  if (!encontrado) return null;
  return { id: encontrado.id, nome: encontrado.nome, funcao: encontrado.funcao, statusFuncao: encontrado.status_funcao };
}

// Mensagem padrão de bloqueio, reaproveitada no formulário.
export function mensagemParceiroDuplicado(d: ParceiroDuplicado): string {
  return `Já existe um parceiro chamado "${d.nome}" com esse mesmo CPF (${d.funcao} · ${d.statusFuncao}) — confira se não é a mesma pessoa antes de cadastrar de novo.`;
}
