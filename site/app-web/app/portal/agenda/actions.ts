"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { registrarEJogarErro } from "@/lib/erros";
import { dataHoraPortoVelho } from "@/lib/format";

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

  // dataHoraPortoVelho — não trocar por `new Date(...)` puro sem fuso: o
  // corretor está digitando no horário dele (Porto Velho), não no do
  // servidor (ver lib/format.ts pro bug que isso já causou).
  const dataHora = dataHoraPortoVelho(dataSugerida, horarioSugerido ?? "09:00");
  if (Number.isNaN(dataHora.getTime())) throw new Error("Data sugerida inválida.");

  // Imóvel próprio (opcional) — "cadastro inteligente" da OM, 09/08/2026: o
  // corretor escolhe entre os imóveis já vinculados a ele (parceiro_id),
  // sem precisar cadastrar de novo nem digitar endereço/valor à mão.
  const imovelId = texto(formData, "imovel_id");

  const criada = await prisma.solicitacoes_agenda
    .create({
      data: {
        parceiro_id: session.parceiroId,
        setor: "marketing",
        titulo,
        descricao: texto(formData, "descricao"),
        tipo: texto(formData, "tipo"),
        data_hora_sugerida: dataHora,
        imovel_id: imovelId,
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
  // Pro pedido novo já aparecer pro administrativo sem precisar de um
  // segundo carregamento — /marketing mostra o selo de pendentes no botão
  // "Pedidos da Agenda", /marketing/agenda lista o pedido em si.
  revalidatePath("/marketing/agenda");
  revalidatePath("/marketing");
}
