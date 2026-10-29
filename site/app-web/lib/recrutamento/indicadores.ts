import { prisma } from "@/lib/prisma";
import { CHAVES_PRESENCA, type EstadoTreinamentos } from "@/lib/recrutamento/treinamentos";

// Indicadores do Recrutamento (painel mensal / relatório semanal de sexta),
// conforme o processo da Engimob. Tudo calculado a partir dos campos que o
// time preenche na etiqueta (datas e situação das reuniões, contrato assinado,
// acolhida, turma e presenças, motivos).
export type Periodo = {
  tipo: "semana" | "mes";
  inicio: string; // yyyy-mm-dd
  fim: string; // yyyy-mm-dd
  rotulo: string;
  anterior: string; // referência do período anterior
  proximo: string; // referência do próximo período
};

const DIA_MS = 86400000;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function somarDias(iso: string, dias: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + dias * DIA_MS).toISOString().slice(0, 10);
}

function br(iso: string) {
  return iso.split("-").reverse().join("/");
}

export function resolverPeriodoRecrutamento(tipo: "semana" | "mes", ref: string): Periodo {
  const d = new Date(`${ref}T00:00:00Z`);
  if (tipo === "mes") {
    const inicio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    return {
      tipo,
      inicio,
      fim,
      rotulo: `${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`,
      anterior: somarDias(inicio, -1),
      proximo: somarDias(fim, 1)
    };
  }
  // Semana de segunda a domingo.
  const dow = (d.getUTCDay() + 6) % 7; // segunda = 0
  const inicio = somarDias(ref, -dow);
  const fim = somarDias(inicio, 6);
  return {
    tipo,
    inicio,
    fim,
    rotulo: `semana de ${br(inicio)} a ${br(fim)}`,
    anterior: somarDias(inicio, -1),
    proximo: somarDias(fim, 1)
  };
}

export type Indicadores = {
  prospectados: number;
  prospectadosPorCanal: Record<string, number>;
  reunioes1Agendadas: number;
  reunioes1Realizadas: number;
  positivas: number;
  reunioes2Realizadas: number;
  recrutados: number;
  acolhidos: number;
  prazoMedioAcolhida: number | null;
  prazoMaximoAcolhida: number | null;
  trilha: { total: number; completos: number };
  faltasDesistencias: { total: number; comMotivo: number };
  comparecimento: number | null; // 0..1
  motivos: Record<string, number>;
};

function diaLocal(d: Date): string {
  // Dia em Porto Velho (UTC-4) — o cadastro do lead guarda hora.
  return new Date(d.getTime() - 4 * 3600000).toISOString().slice(0, 10);
}

export async function calcularIndicadoresRecrutamento(inicio: string, fim: string): Promise<Indicadores> {
  const rows = await prisma.recrutamento.findMany({
    select: {
      canal: true,
      reuniao1_data: true,
      reuniao1_status: true,
      reuniao2_data: true,
      reuniao2_status: true,
      interesse: true,
      motivo_desistencia: true,
      contrato_assinado_em: true,
      acolhida_em: true,
      treinamentos: true,
      etapa_atualizada_em: true,
      turma: { select: { inicio: true, especificos_b: true } },
      parceiros: { select: { funcao: true, status_funcao: true, created_at: true } }
    }
  });

  const dentro = (iso: string | null | undefined) => !!iso && iso >= inicio && iso <= fim;
  const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

  const ind: Indicadores = {
    prospectados: 0,
    prospectadosPorCanal: {},
    reunioes1Agendadas: 0,
    reunioes1Realizadas: 0,
    positivas: 0,
    reunioes2Realizadas: 0,
    recrutados: 0,
    acolhidos: 0,
    prazoMedioAcolhida: null,
    prazoMaximoAcolhida: null,
    trilha: { total: 0, completos: 0 },
    faltasDesistencias: { total: 0, comMotivo: 0 },
    comparecimento: null,
    motivos: {}
  };
  const prazos: number[] = [];

  for (const r of rows) {
    const p = r.parceiros;
    if (p.status_funcao === "Excluído") continue;

    if (dentro(diaLocal(p.created_at)) && (r.canal || p.funcao === "Recrutados")) {
      ind.prospectados += 1;
      const c = r.canal ?? "Não informado";
      ind.prospectadosPorCanal[c] = (ind.prospectadosPorCanal[c] ?? 0) + 1;
    }

    const r1 = dia(r.reuniao1_data);
    const r2 = dia(r.reuniao2_data);
    if (dentro(r1)) {
      ind.reunioes1Agendadas += 1;
      if (r.reuniao1_status === "Realizada") {
        ind.reunioes1Realizadas += 1;
        if (r.interesse === "Tem interesse" || r.reuniao2_data) ind.positivas += 1;
      }
    }
    if (dentro(r2) && r.reuniao2_status === "Realizada") ind.reunioes2Realizadas += 1;

    if (dentro(dia(r.contrato_assinado_em))) ind.recrutados += 1;
    const acolhida = dia(r.acolhida_em);
    if (dentro(acolhida)) {
      ind.acolhidos += 1;
      if (r.turma && acolhida) {
        prazos.push(Math.round((new Date(`${acolhida}T00:00:00Z`).getTime() - r.turma.inicio.getTime()) / DIA_MS));
      }
    }

    // Conclusão da trilha: turmas cujos específicos B caíram no período.
    if (r.turma && dentro(dia(r.turma.especificos_b))) {
      ind.trilha.total += 1;
      const e = (r.treinamentos as EstadoTreinamentos | null) ?? {};
      if (CHAVES_PRESENCA.every((c) => e[c]?.feito)) ind.trilha.completos += 1;
    }

    // Faltas (reunião com "Não compareceu" no período) e desistências.
    const faltou =
      (dentro(r1) && r.reuniao1_status === "Não compareceu") || (dentro(r2) && r.reuniao2_status === "Não compareceu");
    const desistiu = p.funcao === "Recrutados" && p.status_funcao === "Inativo" && dentro(diaLocal(r.etapa_atualizada_em));
    if (faltou || desistiu) {
      ind.faltasDesistencias.total += 1;
      if (r.motivo_desistencia) {
        ind.faltasDesistencias.comMotivo += 1;
        ind.motivos[r.motivo_desistencia] = (ind.motivos[r.motivo_desistencia] ?? 0) + 1;
      }
    }
  }

  if (prazos.length > 0) {
    ind.prazoMedioAcolhida = Math.round(prazos.reduce((s, x) => s + x, 0) / prazos.length);
    ind.prazoMaximoAcolhida = Math.max(...prazos);
  }
  if (ind.reunioes1Agendadas > 0) ind.comparecimento = ind.reunioes1Realizadas / ind.reunioes1Agendadas;
  return ind;
}
