"use server";

import { requireEdicao } from "@/lib/auth";
import { agendarAtividade, concluirAtividade, definirOptOut, registrarSemProximaAtividade, removerAtividade, salvarCanais, type Ator } from "@/lib/crm/servidor";

// CRM do cliente no administrativo: agendar a próxima atividade, concluir, canais (Instagram, Facebook) e opt-out.
// A regra de cada ação fica em lib/crm/servidor.ts (a mesma do portal do corretor).
async function ator(): Promise<Ator> {
  const a = await requireEdicao("clientes");
  return { parceiroId: a.parceiroId, nome: a.nome ?? "", portal: false };
}

export async function agendarAtividadeAction(clienteId: string, d: Parameters<typeof agendarAtividade>[2]) {
  return agendarAtividade(await ator(), clienteId, d);
}
export async function concluirAtividadeAction(atividadeId: string, d: { resultado?: string | null; nota?: string | null }) {
  return concluirAtividade(await ator(), atividadeId, d);
}
export async function removerAtividadeAction(atividadeId: string) {
  return removerAtividade(await ator(), atividadeId);
}
export async function semProximaAtividadeAction(clienteId: string, motivo: string, observacao?: string | null) {
  return registrarSemProximaAtividade(await ator(), clienteId, motivo, observacao);
}
export async function salvarCanaisAction(clienteId: string, d: Parameters<typeof salvarCanais>[2]) {
  return salvarCanais(await ator(), clienteId, d);
}
export async function optOutAction(clienteId: string, optOut: boolean, motivo: string | null) {
  return definirOptOut(await ator(), clienteId, optOut, motivo);
}
