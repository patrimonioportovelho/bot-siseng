"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { podeVerEvento } from "@/lib/eventos/opcoes";
import { proximaOcorrencia } from "@/lib/eventos/ocorrencias";

// Confirmação de presença/ausência — pedido do usuário (10/08/2026):
// "só filtrar pra ter um controle de presença e ausência". A linha em
// eventos_confirmacoes só existe pra quem de fato respondeu (criada aqui,
// sob demanda) — quem nunca abriu o evento simplesmente não tem linha, e
// conta como "ainda não respondeu" no resumo do admin (ver
// app/eventos/[id]/page.tsx).
//
// "Formulário interno" (Fase 3, pedido do usuário 10/08/2026) — quando o
// evento tem esse formulário ativo, "Confirmar presença" também manda
// leva_convidado/quantidade_pessoas/observacoes (campos extras só aparecem
// no Portal nesse caso, ver app/portal/eventos/page.tsx). Em "Não vou poder
// ir" esses campos não fazem sentido — sempre ficam null.
//
// Fase 5 (10/08/2026) — a confirmação é POR OCORRÊNCIA (ocorrencia_data),
// não mais uma só pra sempre por evento: evento recorrente (Semanal etc.)
// pede confirmação de novo a cada vez, senão "Confirmado" ficaria cravado
// pra sempre depois da primeira resposta. A ocorrência é sempre recalculada
// aqui no servidor (nunca confia no que vier do formulário) com a mesma
// proximaOcorrencia() usada pra decidir o que a tela mostra.
async function responder(formData: FormData, status: "Confirmado" | "Recusado") {
  const session = await requirePortalSession();
  const eventoId = String(formData.get("eventoId") ?? "");
  if (!eventoId) return;

  const [evento, parceiro] = await Promise.all([
    prisma.eventos.findUnique({ where: { id: eventoId } }),
    prisma.parceiros.findUnique({ where: { id: session.parceiroId }, select: { funcao: true } })
  ]);
  if (!evento || evento.excluido || !evento.ativo) return;
  // Não deixa responder um evento que nem deveria estar vendo (visibilidade
  // não bate com a função dele) — proteção contra alguém montar o form à
  // mão com um eventoId de outro setor.
  if (!podeVerEvento(evento.visibilidade, parceiro?.funcao ?? null)) return;

  // Sem ocorrência futura (evento já passou/encerrou a recorrência) não tem
  // o que confirmar — a tela nem deveria estar mostrando os botões nesse
  // caso, mas confere de novo aqui por segurança.
  const ocorrencia = proximaOcorrencia(evento.data_inicio, evento.recorrencia, evento.recorrencia_ate, new Date());
  if (!ocorrencia) return;

  let levaConvidado: boolean | null = null;
  let quantidadePessoas: number | null = null;
  let observacoes: string | null = null;
  if (status === "Confirmado" && evento.formulario_interno) {
    const levaConvidadoTexto = formData.get("leva_convidado");
    levaConvidado = levaConvidadoTexto === "sim" ? true : levaConvidadoTexto === "nao" ? false : null;
    const quantidadeTexto = formData.get("quantidade_pessoas");
    const quantidadeNumero = typeof quantidadeTexto === "string" ? Number(quantidadeTexto) : NaN;
    quantidadePessoas = levaConvidado && Number.isFinite(quantidadeNumero) && quantidadeNumero > 0 ? quantidadeNumero : null;
    const observacoesTexto = formData.get("observacoes");
    observacoes = typeof observacoesTexto === "string" && observacoesTexto.trim() ? observacoesTexto.trim() : null;
  }

  await prisma.eventos_confirmacoes.upsert({
    where: {
      evento_id_parceiro_id_ocorrencia_data: {
        evento_id: eventoId,
        parceiro_id: session.parceiroId,
        ocorrencia_data: ocorrencia
      }
    },
    create: {
      evento_id: eventoId,
      parceiro_id: session.parceiroId,
      ocorrencia_data: ocorrencia,
      status,
      respondido_em: new Date(),
      leva_convidado: levaConvidado,
      quantidade_pessoas: quantidadePessoas,
      observacoes
    },
    update: {
      status,
      respondido_em: new Date(),
      leva_convidado: levaConvidado,
      quantidade_pessoas: quantidadePessoas,
      observacoes
    }
  });

  revalidatePath("/portal/eventos");
  revalidatePath(`/eventos/${eventoId}`);
}

export async function confirmarPresencaEventoAction(formData: FormData) {
  await responder(formData, "Confirmado");
}

export async function recusarPresencaEventoAction(formData: FormData) {
  await responder(formData, "Recusado");
}
