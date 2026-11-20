// Dias úteis (como a Caixa conta prazo): sem sábados, domingos e feriados bancários nacionais. Usado para medir etapas
// com prazo em dias úteis (ex.: Garantia Habitacional, 5 dias úteis). O dia vale pelo calendário de Porto Velho (UTC-4).
//
// Feriados considerados: os nacionais fixos (1/1, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11, 25/12) e os que dependem
// da Páscoa e fecham os bancos (segunda e terça de Carnaval, Sexta-feira Santa e Corpus Christi). Feriado estadual ou
// municipal e ponto facultativo avulso não entram.

const DIA_MS = 86_400_000;
const FUSO_PORTO_VELHO_MS = 4 * 3_600_000;

const FERIADOS_FIXOS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), como data de calendário UTC.
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const cache = new Map<number, Set<string>>();

function feriadosDoAno(ano: number): Set<string> {
  let s = cache.get(ano);
  if (s) return s;
  s = new Set(FERIADOS_FIXOS.map((md) => `${ano}-${md}`));
  const p = pascoa(ano);
  for (const delta of [-48, -47, -2, 60]) s.add(new Date(p.getTime() + delta * DIA_MS).toISOString().slice(0, 10));
  cache.set(ano, s);
  return s;
}

// `dia` = data de calendário (meia-noite UTC do dia).
export function ehDiaUtil(dia: Date): boolean {
  const semana = dia.getUTCDay();
  if (semana === 0 || semana === 6) return false;
  return !feriadosDoAno(dia.getUTCFullYear()).has(dia.toISOString().slice(0, 10));
}

// Dias úteis decorridos entre dois instantes, em fração (6 horas de um dia útil = 0,25). Parte de um sábado, domingo ou
// feriado não conta.
export function diasUteisDecorridos(inicio: Date | number, fim: Date | number): number {
  const ini = typeof inicio === "number" ? inicio : inicio.getTime();
  const end = typeof fim === "number" ? fim : fim.getTime();
  if (!(end > ini)) return 0;
  const local = new Date(ini - FUSO_PORTO_VELHO_MS);
  let diaUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  let total = 0;
  // limite de segurança: ~10 anos
  for (let n = 0; n < 3700; n++) {
    const comeco = diaUtc + FUSO_PORTO_VELHO_MS;
    if (comeco >= end) break;
    if (ehDiaUtil(new Date(diaUtc))) {
      const sobra = Math.min(end, comeco + DIA_MS) - Math.max(ini, comeco);
      if (sobra > 0) total += sobra / DIA_MS;
    }
    diaUtc += DIA_MS;
  }
  return total;
}
