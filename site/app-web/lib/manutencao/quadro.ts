import { COLUNAS_KANBAN } from "@/lib/manutencao/opcoes";

// Metas de tempo por etapa do quadro de Manutenção (dias parado na mesma coluna
// antes de ficar "acima da meta"). A urgência encurta a meta: um ticket
// emergencial não pode esperar o mesmo que um de baixa urgência.
export const META_DIAS_COLUNA: Record<string, number | null> = {
  solicitado: 2, // levantar o problema e pedir orçamento
  orcamento: 5, // prestador visitar e mandar o valor / proprietário autorizar
  aprovado: 3, // contratar o prestador
  contratado: 5, // prestador iniciar
  em_execucao: 15, // executar o serviço
  concluido: 5, // conferir e pagar
  pago: null // encerrado
};

const FATOR_URGENCIA: Record<string, number> = { baixa: 1.5, media: 1, alta: 0.67, emergencial: 0.34 };

export function metaDiasTicket(coluna: string, urgencia: string): number | null {
  const base = META_DIAS_COLUNA[coluna] ?? null;
  if (base === null) return null;
  return Math.max(1, Math.round(base * (FATOR_URGENCIA[urgencia] ?? 1)));
}

const DIA_MS = 86400000;

export function diasParado(desde: Date | string | null | undefined, agoraMs: number): number {
  if (!desde) return 0;
  const t = new Date(desde).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((agoraMs - t) / DIA_MS));
}

export type SituacaoSlaMan = "ok" | "alerta" | "atrasado" | "sem_meta";

export function situacaoSlaMan(coluna: string, urgencia: string, dias: number): SituacaoSlaMan {
  const meta = metaDiasTicket(coluna, urgencia);
  if (meta === null) return "sem_meta";
  if (dias > meta) return "atrasado";
  if (dias >= Math.ceil(meta * 0.7)) return "alerta";
  return "ok";
}

export const COR_SLA_MAN: Record<SituacaoSlaMan, string> = {
  ok: "text-gray-400",
  sem_meta: "text-gray-400",
  alerta: "text-amber-600",
  atrasado: "text-red-600"
};

// Colunas em que o ticket já deveria ter um prestador definido.
export const COLUNAS_PEDEM_PRESTADOR = new Set(["contratado", "em_execucao", "concluido"]);

// Colunas "abertas" (ainda sem pagamento/encerramento).
export const COLUNAS_ABERTAS = new Set(COLUNAS_KANBAN.map((c) => c.id).filter((id) => id !== "pago"));

export function textoMeta(coluna: string, urgencia: string): string {
  const meta = metaDiasTicket(coluna, urgencia);
  return meta === null ? "sem meta" : `meta ${meta} dia${meta === 1 ? "" : "s"}`;
}
