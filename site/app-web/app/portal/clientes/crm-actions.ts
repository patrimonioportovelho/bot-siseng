"use server";

import { requirePortalSession } from "@/lib/portal-auth";
import { concluirAtendimento, descartarAtendimento, salvarAtendimento } from "@/lib/crm/atendimento-servidor";
import { adicionarGancho, removerGancho, salvarFicha } from "@/lib/crm/ficha-servidor";
import type { FichaDados } from "@/lib/crm/ficha";
import { agendarAtividade, concluirAtividade, definirOptOut, registrarSemProximaAtividade, removerAtividade, salvarCanais, type Ator } from "@/lib/crm/servidor";

// CRM do cliente no portal do corretor: só nos clientes que estão no nome dele (a conferência é feita em lib/crm/servidor.ts).
async function ator(): Promise<Ator> {
  const s = await requirePortalSession();
  return { parceiroId: s.parceiroId, nome: s.nome, portal: true };
}

export async function agendarAtividadePortalAction(clienteId: string, d: Parameters<typeof agendarAtividade>[2]) {
  return agendarAtividade(await ator(), clienteId, d);
}
export async function concluirAtividadePortalAction(atividadeId: string, d: { resultado?: string | null; nota?: string | null }) {
  return concluirAtividade(await ator(), atividadeId, d);
}
export async function removerAtividadePortalAction(atividadeId: string) {
  return removerAtividade(await ator(), atividadeId);
}
export async function semProximaAtividadePortalAction(clienteId: string, motivo: string, observacao?: string | null) {
  return registrarSemProximaAtividade(await ator(), clienteId, motivo, observacao);
}
export async function salvarCanaisPortalAction(clienteId: string, d: Parameters<typeof salvarCanais>[2]) {
  return salvarCanais(await ator(), clienteId, d);
}
export async function optOutPortalAction(clienteId: string, optOut: boolean, motivo: string | null) {
  return definirOptOut(await ator(), clienteId, optOut, motivo);
}

// Roteiro de atendimento guiado
export async function salvarAtendimentoPortalAction(clienteId: string, d: Parameters<typeof salvarAtendimento>[2]) {
  return salvarAtendimento(await ator(), clienteId, d);
}
export async function descartarAtendimentoPortalAction(clienteId: string, atendimentoId: string) {
  return descartarAtendimento(await ator(), clienteId, atendimentoId);
}
export async function concluirAtendimentoPortalAction(clienteId: string, d: Parameters<typeof concluirAtendimento>[2]) {
  return concluirAtendimento(await ator(), clienteId, d);
}

// Ficha de relacionamento e ganchos de conversa
export async function salvarFichaPortalAction(clienteId: string, dados: FichaDados) {
  return salvarFicha(await ator(), clienteId, dados);
}
export async function adicionarGanchoPortalAction(clienteId: string, texto: string, lembrarEm: string | null) {
  return adicionarGancho(await ator(), clienteId, texto, lembrarEm);
}
export async function removerGanchoPortalAction(ganchoId: string) {
  return removerGancho(await ator(), ganchoId);
}
