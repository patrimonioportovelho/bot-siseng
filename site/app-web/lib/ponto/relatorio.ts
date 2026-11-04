import { prisma } from "@/lib/prisma";
import { configDeLinha } from "@/lib/ponto/servidor";
import {
  PAPEIS_CONTROLADOS,
  PONTO_PADRAO,
  fimDaSemana,
  hhmmParaMin,
  inicioDaSemana,
  inicioDoDia,
  instanteDoDia,
  minutosEm,
  partesLocais,
  sobreposicaoMs,
  DIAS_UTEIS,
  type Intervalo,
  type PontoConfig
} from "@/lib/ponto/regras";

export type PessoaControlada = { id: string; nome: string; funcao: string; cfg: PontoConfig };

// Quem tem o uso controlado hoje: acesso Administrativo, Financeiro ou Recrutador, sem
// Diretor, e com o controle ligado.
export async function pessoasControladas(): Promise<PessoaControlada[]> {
  const [parceiros, configs] = await Promise.all([
    prisma.parceiros.findMany({
      where: { status_funcao: "Ativo", acesso_completo: false, acessos: { hasSome: [...PAPEIS_CONTROLADOS] }, NOT: { acessos: { has: "diretor" } } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, funcao: true }
    }),
    prisma.ponto_config.findMany()
  ]);
  const porId = new Map(configs.map((c) => [c.parceiro_id, configDeLinha(c)]));
  return parceiros.map((p) => ({ ...p, cfg: porId.get(p.id) ?? PONTO_PADRAO })).filter((p) => p.cfg.ativo);
}

export type ResumoSemana = PessoaControlada & { semanaMin: number; extraMin: number; almocoMin: number; diasComUso: number };

export async function resumoDaSemana(referencia: Date): Promise<ResumoSemana[]> {
  const pessoas = await pessoasControladas();
  if (pessoas.length === 0) return [];
  const ini = inicioDaSemana(referencia);
  const fim = fimDaSemana(referencia);
  const sessoes = await prisma.ponto_sessoes.findMany({
    where: {
      parceiro_id: { in: pessoas.map((p) => p.id) },
      anulada: false,
      inicio: { lt: fim },
      OR: [{ fim: null, ultimo_sinal: { gt: ini } }, { fim: { gt: ini } }]
    },
    select: { parceiro_id: true, inicio: true, ultimo_sinal: true, fim: true, segundos_extra: true }
  });
  return pessoas.map((p) => {
    const minhas = sessoes.filter((s) => s.parceiro_id === p.id);
    const intervalos: Intervalo[] = minhas.map((s) => ({ ini: s.inicio.getTime(), fim: (s.fim ?? s.ultimo_sinal).getTime() }));
    let almoco = 0;
    let diasComUso = 0;
    for (let k = 0; k < 7; k++) {
      const a = ini.getTime() + k * 86400000; // a semana começa na segunda: k 0 a 4 são os dias úteis
      if (minutosEm(intervalos, a, a + 86400000) > 0) diasComUso += 1;
      if (k < 5) almoco += minutosEm(intervalos, a + hhmmParaMin(p.cfg.almocoInicio) * 60000, a + hhmmParaMin(p.cfg.almocoFim) * 60000);
    }
    return {
      ...p,
      semanaMin: minutosEm(intervalos, ini.getTime(), fim.getTime()),
      extraMin: minhas.reduce((acc, s) => acc + s.segundos_extra, 0) / 60,
      almocoMin: almoco,
      diasComUso
    };
  });
}

export type PeriodoDoDia = { id: string; inicio: Date; fim: Date; aberto: boolean; origem: string; anulada: boolean; justificativa: string | null; extraMin: number; motivoFim: string | null };
export type DiaEspelho = {
  ymd: string;
  diaSemana: number;
  periodos: PeriodoDoDia[];
  totalMin: number;
  almocoMin: number;
  foraMin: number;
  extraMin: number;
};

// Espelho de ponto: dia a dia, com os períodos de uso, o total, o uso no almoço, o uso fora do expediente
// e o que foi feito com liberação da diretoria.
export async function espelhoDoPeriodo(parceiroId: string, cfg: PontoConfig, de: Date, ate: Date): Promise<DiaEspelho[]> {
  const sessoes = await prisma.ponto_sessoes.findMany({
    where: {
      parceiro_id: parceiroId,
      inicio: { lt: ate },
      OR: [{ fim: null, ultimo_sinal: { gt: de } }, { fim: { gt: de } }]
    },
    orderBy: { inicio: "asc" }
  });
  const dias: DiaEspelho[] = [];
  for (let t = inicioDoDia(de).getTime(); t < ate.getTime(); t += 86400000) {
    const d = new Date(t);
    const p = partesLocais(d);
    const a = instanteDoDia(p.ano, p.mes, p.dia).getTime();
    const b = a + 86400000;
    const doDia = sessoes.filter((s) => sobreposicaoMs(s.inicio.getTime(), (s.fim ?? s.ultimo_sinal).getTime(), a, b) > 0);
    const validos: Intervalo[] = doDia.filter((s) => !s.anulada).map((s) => ({ ini: s.inicio.getTime(), fim: (s.fim ?? s.ultimo_sinal).getTime() }));
    const total = minutosEm(validos, a, b);
    const util = DIAS_UTEIS.includes(p.diaSemana);
    const dentro = util ? minutosEm(validos, a + hhmmParaMin(cfg.entrada) * 60000, a + hhmmParaMin(cfg.saida) * 60000) : 0;
    dias.push({
      ymd: p.ymd,
      diaSemana: p.diaSemana,
      periodos: doDia.map((s) => ({
        id: s.id,
        inicio: s.inicio,
        fim: s.fim ?? s.ultimo_sinal,
        aberto: s.fim === null,
        origem: s.origem,
        anulada: s.anulada,
        justificativa: s.justificativa,
        extraMin: s.segundos_extra / 60,
        motivoFim: s.motivo_fim
      })),
      totalMin: total,
      almocoMin: util ? minutosEm(validos, a + hhmmParaMin(cfg.almocoInicio) * 60000, a + hhmmParaMin(cfg.almocoFim) * 60000) : 0,
      foraMin: Math.max(0, total - dentro),
      extraMin: doDia.filter((s) => !s.anulada).reduce((acc, s) => acc + s.segundos_extra, 0) / 60
    });
  }
  return dias;
}
