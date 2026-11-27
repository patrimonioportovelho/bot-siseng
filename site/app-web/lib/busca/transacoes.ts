import { prisma } from "@/lib/prisma";

// Busca única das transações (Compra e Venda, Locação e "Transações do período"): o mesmo texto acha o contrato pelo
// imóvel, pelo Id, por qualquer cliente envolvido ou por qualquer corretor/parceiro que participa dele.
// Vale o corretor GRAVADO NA TRANSAÇÃO (é o que fecha a conta), não o corretor atual do cadastro do cliente.
export function buscaDeTransacoes(termo: string) {
  const t = { contains: termo, mode: "insensitive" as const };
  const nome = { nome: t };
  return {
    OR: [
      { id_legado: t },
      { imoveis: { endereco: t } },
      { imoveis: { inscricao: t } },
      // clientes: proprietário/vendedor, interessado/comprador (principal e adicionais) e donos do imóvel
      { clientes_transacoes_cliente_idToclientes: nome },
      { clientes_transacoes_cliente_contraparte_idToclientes: nome },
      { transacoes_contrapartes: { some: { clientes: nome } } },
      { imoveis: { imoveis_proprietarios: { some: { clientes: nome } } } },
      // corretores e parceiros: dos dois lados, parceria externa, comissão extra e quem captou (gestão)
      { parceiros_transacoes_corretor_proprietario_idToparceiros: nome },
      { parceiros_transacoes_corretor_contraparte_idToparceiros: nome },
      { parceiros_transacoes_parceiro_externo_idToparceiros: nome },
      { transacoes_comissao_extra: { some: { parceiros: nome } } },
      { gestoes: { parceiros: nome } }
    ]
  };
}

export const ehId = (v: string | undefined | null): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v);

// Todas as transações em que a pessoa participa (filtro "Corretor").
export function transacoesDoCorretor(parceiroId: string) {
  return {
    OR: [
      { corretor_proprietario_id: parceiroId },
      { corretor_contraparte_id: parceiroId },
      { parceiro_externo_id: parceiroId },
      { transacoes_comissao_extra: { some: { parceiro_id: parceiroId } } },
      { gestoes: { parceiro_id: parceiroId } }
    ]
  };
}

// Quem aparece como corretor em alguma transação (inclui externos e desligados, para o relatório fechar).
export async function corretoresComTransacao(tipo?: string): Promise<{ id: string; nome: string }[]> {
  const doTipo = { excluido: false, ...(tipo ? { tipo } : {}) };
  return prisma.parceiros.findMany({
    where: {
      OR: [
        { transacoes_transacoes_corretor_proprietario_idToparceiros: { some: doTipo } },
        { transacoes_transacoes_corretor_contraparte_idToparceiros: { some: doTipo } },
        { transacoes_transacoes_parceiro_externo_idToparceiros: { some: doTipo } },
        { transacoes_comissao_extra: { some: { transacoes: doTipo } } },
        { gestoes: { some: { transacoes: { some: doTipo } } } }
      ]
    },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true }
  });
}
