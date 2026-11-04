// Controle de ponto do administrativo (04/11/2026). Arquivo puro (sem banco): as
// regras de horário e de semana valem igual no servidor, na tela e no relatório.
// Horário de Porto Velho (UTC-4, sem horário de verão).

// Quem tem o uso controlado: acesso Administrativo, Financeiro ou Recrutador, sem ser
// Diretor (a diretoria libera e consulta; ela mesma não é controlada).
export const PAPEIS_CONTROLADOS = ["administrativo", "financeiro", "recrutador"] as const;

export function pessoaTemPonto(p: { acessos?: readonly string[] | null; isAdm?: boolean }): boolean {
  if (p.isAdm) return false;
  const lista = p.acessos ?? [];
  if (lista.includes("diretor")) return false;
  return PAPEIS_CONTROLADOS.some((papel) => lista.includes(papel));
}

export type PontoConfig = {
  ativo: boolean;
  cargaMin: number; // teto semanal em minutos
  entrada: string; // "HH:MM"
  saida: string;
  almocoInicio: string;
  almocoFim: string;
};

// 08h-18h com 2h de almoço = 8h por dia = 40h por semana.
export const PONTO_PADRAO: PontoConfig = {
  ativo: true,
  cargaMin: 40 * 60,
  entrada: "08:00",
  saida: "18:00",
  almocoInicio: "12:00",
  almocoFim: "14:00"
};

export const DIAS_UTEIS = [1, 2, 3, 4, 5]; // segunda a sexta

// Tempos do monitor (cliente e servidor precisam combinar).
export const INTERVALO_SINAL_S = 60;
export const INTERVALO_SINAL_BLOQUEADO_S = 15;
export const LIMITE_SEM_SINAL_S = 180; // sem sinal por mais que isso: o período anterior acabou no último sinal
export const INATIVIDADE_MIN = 10; // sem mexer: a sessão encerra e o tempo ocioso não conta
export const AVISO_FIM_EXPEDIENTE_MIN = 10;
export const AVISO_TETO_MIN = 60;

const OFFSET_MS = 4 * 3600 * 1000; // UTC = local + 4h

export type PartesLocais = { ano: number; mes: number; dia: number; hora: number; minuto: number; diaSemana: number; ymd: string };

// diaSemana: 1 = segunda ... 7 = domingo
export function partesLocais(d: Date): PartesLocais {
  const l = new Date(d.getTime() - OFFSET_MS);
  const ano = l.getUTCFullYear();
  const mes = l.getUTCMonth() + 1;
  const dia = l.getUTCDate();
  const dow = l.getUTCDay();
  return {
    ano,
    mes,
    dia,
    hora: l.getUTCHours(),
    minuto: l.getUTCMinutes(),
    diaSemana: dow === 0 ? 7 : dow,
    ymd: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
  };
}

// Instante em que o dia local (ano, mes, dia) começa.
export function instanteDoDia(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia) + OFFSET_MS);
}

export function inicioDoDia(d: Date): Date {
  const p = partesLocais(d);
  return instanteDoDia(p.ano, p.mes, p.dia);
}

// Semana de segunda 00:00 a domingo 24:00.
export function inicioDaSemana(d: Date): Date {
  const p = partesLocais(d);
  return instanteDoDia(p.ano, p.mes, p.dia - (p.diaSemana - 1));
}

export function fimDaSemana(d: Date): Date {
  return new Date(inicioDaSemana(d).getTime() + 7 * 86400000);
}

export function hhmmParaMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutoDoDia(d: Date): number {
  const p = partesLocais(d);
  return p.hora * 60 + p.minuto;
}

export function emExpediente(d: Date, cfg: PontoConfig): boolean {
  const p = partesLocais(d);
  if (!DIAS_UTEIS.includes(p.diaSemana)) return false;
  const m = p.hora * 60 + p.minuto;
  return m >= hhmmParaMin(cfg.entrada) && m < hhmmParaMin(cfg.saida);
}

export function noAlmoco(d: Date, cfg: PontoConfig): boolean {
  const p = partesLocais(d);
  if (!DIAS_UTEIS.includes(p.diaSemana)) return false;
  const m = p.hora * 60 + p.minuto;
  return m >= hhmmParaMin(cfg.almocoInicio) && m < hhmmParaMin(cfg.almocoFim);
}

export function minutosAteFimDoExpediente(d: Date, cfg: PontoConfig): number {
  return hhmmParaMin(cfg.saida) - minutoDoDia(d);
}

export function sobreposicaoMs(aIni: number, aFim: number, bIni: number, bFim: number): number {
  return Math.max(0, Math.min(aFim, bFim) - Math.max(aIni, bIni));
}

// 32h10 / 6h05 / 0h40
export function formatarMin(min: number): string {
  const total = Math.max(0, Math.round(min));
  return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, "0")}`;
}

export const NOMES_DIA = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

export type Intervalo = { ini: number; fim: number };

// Junta períodos que se sobrepõem (duas abas abertas ao mesmo tempo contam uma vez só).
export function unirIntervalos(lista: Intervalo[]): Intervalo[] {
  const ordenados = lista.filter((i) => i.fim > i.ini).sort((a, b) => a.ini - b.ini);
  const uniao: Intervalo[] = [];
  for (const i of ordenados) {
    const ultimo = uniao[uniao.length - 1];
    if (ultimo && i.ini <= ultimo.fim) ultimo.fim = Math.max(ultimo.fim, i.fim);
    else uniao.push({ ...i });
  }
  return uniao;
}

// Minutos (com fração) de uso dentro de [de, ate).
export function minutosEm(lista: Intervalo[], de: number, ate: number): number {
  let ms = 0;
  for (const i of unirIntervalos(lista)) ms += sobreposicaoMs(i.ini, i.fim, de, ate);
  return ms / 60000;
}
