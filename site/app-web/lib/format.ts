// Status reais encontrados em transacoes.status (ver levantamento no Supabase).
const STATUS_CONCLUIDA = ["Transação Finalizada"];
const STATUS_CANCELADA = ["Distrato", "Locação cancelada"];
const STATUS_ABERTA = [
  "Imóvel em Locação",
  "Imóvel em locação sem administração",
  "Elaboração do Contrato de Compra e Venda",
  "Elaboração de Contrato de Locação"
];

export type Tone = "ativa" | "concluida" | "pendente" | "cancelada";

export function statusTone(status: string | null): Tone {
  if (!status) return "pendente";
  if (STATUS_CONCLUIDA.includes(status)) return "concluida";
  if (STATUS_CANCELADA.includes(status)) return "cancelada";
  if (STATUS_ABERTA.includes(status)) return "ativa";
  return "pendente";
}

export const STATUS_TRANSACAO_EM_ABERTO = { notIn: [...STATUS_CONCLUIDA, ...STATUS_CANCELADA] };

export function formatMoeda(valor: unknown) {
  const n = Number(valor ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function formatData(data: unknown) {
  if (!data) return "—";
  return new Date(data as string).toLocaleDateString("pt-BR");
}
