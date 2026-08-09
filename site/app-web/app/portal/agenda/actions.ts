"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { registrarEJogarErro } from "@/lib/erros";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// Pedido do corretor pela Agenda — ele não agenda direto (só o setor pode
// confirmar um horário de verdade), aqui ele só sugere data/horário e
// espera resposta. Setor fixo "marketing" por enquanto (campo já genérico
// no banco pra outros setores depois, sem mudar o schema — ver
// prisma/schema.prisma solicitacoes_agenda).
export async function criarSolicitacaoAgendaAction(formData: FormData) {
  const session = await requirePortalSession();

  const titulo = texto(formData, "titulo");
  const dataSugerida = texto(formData, "data_sugerida");
  const horarioSugerido = texto(formData, "horario_sugerido");
  if (!titulo || !dataSugerida) throw new Error("Título e data sugerida são obrigatórios.");

  const dataHora = new Date(`${dataSugerida}T${horarioSugerido || "09:00"}:00`);
  if (Number.isNaN(dataHora.getTime())) throw new Error("Data sugerida inválida.");

  const criada = await prisma.solicitacoes_agenda
    .create({
      data: {
        parceiro_id: session.parceiroId,
        setor: "marketing",
        titulo,
        descricao: texto(formData, "descricao"),
        tipo: texto(formData, "tipo"),
        data_hora_sugerida: dataHora,
        status: "pendente"
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "solicitacoes_agenda", acao: "criar", erro }));

  await logAlteracaoPortal({
    parceiroId: session.parceiroId,
    entidadeTipo: "solicitacoes_agenda",
    entidadeId: criada.id,
    acao: "criar",
    dadosDepois: criada
  });

  revalidatePath("/portal/agenda");
}
