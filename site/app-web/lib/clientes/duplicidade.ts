import { prisma } from "@/lib/prisma";

export type ClienteDuplicado = {
  id: string;
  nome: string;
  parceiroNome: string | null;
};

// Verifica se já existe, em QUALQUER corretor, um cliente cadastrado com o
// mesmo nome (comparação sem diferenciar maiúsculas/minúsculas) ou o mesmo
// CPF/CNPJ do que está sendo digitado agora num formulário do portal.
//
// Motivo: nos formulários do portal (Elaboração de Contrato de Gestão,
// Proposta de Compra e Venda), a lista de "cliente já cadastrado" só mostra
// os clientes do PRÓPRIO corretor — de propósito, pra não vazar cadastro de
// cliente de outro corretor. Só que isso significa que, se o corretor A já
// cadastrou "João da Silva" e o corretor B também atende o mesmo João sem
// saber, B não vê o cadastro do A na lista e digitaria tudo de novo,
// criando um cliente duplicado no banco. Esta função pega esse caso antes
// de criar: se achar duplicata, quem chama deve bloquear o cadastro e pedir
// pro corretor avisar o administrativo (só o ADM decide se transfere o
// cliente existente pro corretor novo — não é uma decisão que o corretor
// pode tomar sozinho digitando um cadastro por cima).
export async function buscarClienteDuplicado(params: {
  nome: string;
  cpfCnpj?: string | null;
  ignorarIds?: string[];
}): Promise<ClienteDuplicado | null> {
  const nome = params.nome.trim();
  const doc = params.cpfCnpj ? params.cpfCnpj.replace(/\D/g, "") : "";
  if (!nome && !doc) return null;

  const condicoesOr: Array<Record<string, unknown>> = [];
  if (nome) condicoesOr.push({ nome: { equals: nome, mode: "insensitive" } });
  if (doc) {
    condicoesOr.push({ cpf: doc });
    condicoesOr.push({ cnpj: doc });
  }
  if (condicoesOr.length === 0) return null;

  const encontrado = await prisma.clientes.findFirst({
    where: {
      OR: condicoesOr,
      ...(params.ignorarIds && params.ignorarIds.length > 0 ? { id: { notIn: params.ignorarIds } } : {})
    },
    include: { parceiros: { select: { nome: true } } },
    orderBy: { created_at: "asc" }
  });

  if (!encontrado) return null;
  return { id: encontrado.id, nome: encontrado.nome, parceiroNome: encontrado.parceiros?.nome ?? null };
}

// Mensagem padrão de bloqueio, reaproveitada nos formulários do portal.
export function mensagemClienteDuplicado(d: ClienteDuplicado): string {
  const dono = d.parceiroNome ? ` (cadastrado no nome de ${d.parceiroNome})` : "";
  return `Já existe um cliente chamado "${d.nome}"${dono} no banco de dados. Não é possível cadastrar de novo — avise o administrativo para transferir o cliente para o seu nome, se for o caso.`;
}
