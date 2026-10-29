import { prisma } from "@/lib/prisma";
import { FUNCOES_NO_QUADRO } from "@/lib/recrutamento/opcoes";

// Cria a linha de acompanhamento (recrutamento) de todo parceiro que entra no
// quadro e ainda não tem — Recrutados nascem em "Lead", Corretor/Estagiário/
// ex-equipe ganham a linha só pra poder receber notas, responsável e
// treinamentos. Idempotente (ON CONFLICT DO NOTHING).
export async function garantirLinhasRecrutamento(): Promise<void> {
  const funcoes = FUNCOES_NO_QUADRO.map((f) => `'${f.replace(/'/g, "''")}'`).join(",");
  await prisma.$executeRawUnsafe(`
    insert into recrutamento (parceiro_id)
    select p.id from parceiros p
    where p.funcao in (${funcoes}) and p.status_funcao <> 'Excluído'
    on conflict (parceiro_id) do nothing
  `);
}
