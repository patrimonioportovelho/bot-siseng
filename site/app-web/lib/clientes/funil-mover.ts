import { prisma } from "@/lib/prisma";
import { etapaDoCliente } from "@/lib/clientes/funil-servidor";
import { ETAPA_FUNIL_POR_ID, type EtapaFunilId } from "@/lib/clientes/funil";

// Movimento livre no Kanban de Clientes: qualquer coluna. "auto" (ou soltar na coluna em que o sistema já colocaria o
// cliente) volta a acompanhar o sistema. Só mexe na posição no quadro: contrato, comissão e corretor não mudam.
export async function moverCliente(atorId: string, id: string, destino: EtapaFunilId | "auto"): Promise<{ ok: true; antes: EtapaFunilId } | { ok: false; erro: string }> {
  if (destino !== "auto" && !ETAPA_FUNIL_POR_ID.has(destino)) return { ok: false, erro: "Coluna inválida." };
  const atual = await etapaDoCliente(id);
  if (!atual) return { ok: false, erro: "Cliente não encontrado." };
  const antes = atual.derivacao.etapa;
  if (destino === antes) return { ok: true, antes };

  const agora = new Date();
  const semMarca = { funil_coluna: null, funil_coluna_em: null, funil_coluna_por: null };
  const marca = destino === "auto" ? semMarca : { funil_coluna: destino, funil_coluna_em: agora, funil_coluna_por: atorId };
  // a marcação "Em atendimento" acompanha a coluna escolhida
  const atendimento =
    destino === "auto" ? {} : destino === "atendimento" ? { atendimento_desde: atual.atendimentoDesde ?? agora, atendimento_por: atorId } : { atendimento_desde: null, atendimento_por: null };
  await prisma.clientes.update({ where: { id }, data: { ...marca, ...atendimento } });

  // soltou onde o sistema já colocaria: não precisa ficar preso à escolha
  if (destino !== "auto") {
    const depois = await etapaDoCliente(id);
    if (depois?.derivacao.etapaAutomatica === destino) await prisma.clientes.update({ where: { id }, data: semMarca });
  }
  return { ok: true, antes };
}
