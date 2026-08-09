import { prisma } from "@/lib/prisma";

// Lista de Parceiros elegíveis a aparecer como "responsável" por uma
// atividade — usada hoje só no módulo de Marketing (responsável atual da
// Ordem, quem responde uma Solicitação de Agenda), mas escrita como helper
// reutilizável porque o pedido do usuário vale pra "qualquer dropdown de
// responsáveis e qualquer relatório futuro": só função "Administrativo" e
// status_funcao "Ativo" (mensagem de 09/08/2026 — antes de existir um
// sistema de níveis/setores, essa é a única trava que ele pediu desde já).
export async function listarParceirosAdministrativos() {
  return prisma.parceiros.findMany({
    where: { funcao: "Administrativo", status_funcao: "Ativo" },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true }
  });
}
