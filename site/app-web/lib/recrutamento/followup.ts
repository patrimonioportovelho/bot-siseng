import { CADENCIA_FOLLOWUP, type PassoFollowup } from "@/lib/recrutamento/opcoes";

// Cadência de follow-up de quem ainda não decidiu (D+1, D+3, D+7, D+15, D+30).
// A data de referência é a da última reunião REALIZADA (2ª, senão a 1ª): a
// partir dela cada passo vence em D+n. Nada é cobrado antes de haver uma
// reunião realizada.
export type EstadoFollowups = Record<string, { feito: boolean; data?: string }>;

export type PassoCalculado = PassoFollowup & {
  vence: string; // yyyy-mm-dd
  feito: boolean;
  atrasoDias: number; // > 0 quando vencido e não feito
};

const DIA_MS = 86400000;

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return new Date(d.getTime() + dias * DIA_MS).toISOString().slice(0, 10);
}

export function dataReferenciaFollowup(r: {
  reuniao1_data: Date | null;
  reuniao1_status: string | null;
  reuniao2_data: Date | null;
  reuniao2_status: string | null;
}): string | null {
  if (r.reuniao2_data && r.reuniao2_status === "Realizada") return r.reuniao2_data.toISOString().slice(0, 10);
  if (r.reuniao1_data && r.reuniao1_status === "Realizada") return r.reuniao1_data.toISOString().slice(0, 10);
  return null;
}

export function calcularFollowups(referencia: string | null, estado: EstadoFollowups | null | undefined, hoje: string): PassoCalculado[] {
  if (!referencia) return [];
  const e = estado ?? {};
  return CADENCIA_FOLLOWUP.map((p) => {
    const vence = somarDias(referencia, p.dias);
    const feito = !!e[p.chave]?.feito;
    const atrasoDias = !feito && vence < hoje ? Math.round((new Date(`${hoje}T00:00:00Z`).getTime() - new Date(`${vence}T00:00:00Z`).getTime()) / DIA_MS) : 0;
    return { ...p, vence, feito, atrasoDias };
  });
}

// Primeiro passo vencido e não feito (alerta no card), ou null.
export function followupVencido(passos: PassoCalculado[]): PassoCalculado | null {
  return passos.find((p) => !p.feito && p.atrasoDias > 0) ?? null;
}
