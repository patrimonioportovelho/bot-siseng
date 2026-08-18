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

// Cancelamento pelo lado do corretor — pedido do usuário 16/08/2026 ("se
// for cancelado tanto pelo corretor quanto pelo marketing precisamos
// informar o porque foi cancelado"). Só cabe num pedido já CONFIRMADO (tem
// compromisso de verdade marcado) e o corretor só pode cancelar o próprio
// pedido. Motivo obrigatório, igual ao lado do marketing.
export async function cancelarSolicitacaoAgendaCorretorAction(formData: FormData) {
  const session = await requirePortalSession();

  const id = texto(formData, "solicitacaoId");
  const motivo = texto(formData, "motivo");
  if (!id) throw new Error("Solicitação inválida.");
  if (!motivo) throw new Error("Informe o motivo do cancelamento.");

  const solicitacao = await prisma.solicitacoes_agenda.findUnique({ where: { id } });
  if (!solicitacao) throw new Error("Solicitação não encontrada.");
  if (solicitacao.parceiro_id !== session.parceiroId) throw new Error("Esse pedido não é seu.");
  if (solicitacao.status !== "confirmada") throw new Error("Só dá pra cancelar um agendamento já confirmado.");

  await prisma.$transaction(async (tx) => {
    await tx.solicitacoes_agenda.update({
      where: { id },
      data: {
        status: "cancelada",
        cancelado_motivo: motivo,
        cancelado_por_tipo: "corretor",
        cancelado_em: new Date()
      }
    });

    if (solicitacao.marketing_ordem_id) {
      const atividade = await tx.marketing_atividades.findFirst({
        where: { marketing_ordem_id: solicitacao.marketing_ordem_id, tipo: "captacao" },
        orderBy: { created_at: "desc" }
      });
      if (atividade) {
        await tx.marketing_atividades.update({
          where: { id: atividade.id },
          data: { cancelado: true, cancelado_motivo: motivo, cancelado_por_tipo: "corretor", cancelado_em: new Date() }
        });
      }
    }
  });

  await logAlteracaoPortal({
    parceiroId: session.parceiroId,
    entidadeTipo: "solicitacoes_agenda",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { status: solicitacao.status },
    dadosDepois: { status: "cancelada", cancelado_por_tipo: "corretor", cancelado_motivo: motivo }
  });

  revalidatePath("/portal/agenda");
  revalidatePath("/marketing/agenda");
  revalidatePath("/marketing");
  if (solicitacao.marketing_ordem_id) revalidatePath(`/marketing/${solicitacao.marketing_ordem_id}`);
  revalidatePath("/manutencao/calendario");
  revalidatePath("/manutencao/painel");
}

// Reagendamento pelo lado do corretor — ele só PROPÕE um novo horário (quem
// confirma de vez é o marketing, mesma assimetria do pedido original), então
// isso volta o status pra "pendente" de novo e atualiza a data/hora
// sugerida — não mexe em data_hora_confirmada nem na Ordem/atividade
// (confirmarSolicitacaoAgendaAction cuida disso quando o marketing
// reconfirmar, reaproveitando a OM existente em vez de duplicar).
export async function reagendarSolicitacaoAgendaCorretorAction(formData: FormData) {
  const session = await requirePortalSession();

  const id = texto(formData, "solicitacaoId");
  const novaData = texto(formData, "nova_data");
  const novoHorario = texto(formData, "novo_horario");
  if (!id) throw new Error("Solicitação inválida.");
  if (!novaData) throw new Error("Informe a nova data.");

  const solicitacao = await prisma.solicitacoes_agenda.findUnique({ where: { id } });
  if (!solicitacao) throw new Error("Solicitação não encontrada.");
  if (solicitacao.parceiro_id !== session.parceiroId) throw new Error("Esse pedido não é seu.");
  if (solicitacao.status !== "cancelada") throw new Error("Só dá pra reagendar um pedido cancelado.");

  const novaDataHora = dataHoraPortoVelho(novaData, novoHorario ?? "09:00");
  if (Number.isNaN(novaDataHora.getTime())) throw new Error("Data inválida.");

  await prisma.solicitacoes_agenda.update({
    where: { id },
    data: {
      status: "pendente",
      data_hora_sugerida: novaDataHora,
      cancelado_motivo: null,
      cancelado_por_tipo: null,
      cancelado_em: null,
      visto_pelo_corretor: true
    }
  });

  await logAlteracaoPortal({
    parceiroId: session.parceiroId,
    entidadeTipo: "solicitacoes_agenda",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { status: solicitacao.status },
    dadosDepois: { status: "pendente", data_hora_sugerida: novaDataHora }
  });

  revalidatePath("/portal/agenda");
  revalidatePath("/marketing/agenda");
  revalidatePath("/marketing");
}
