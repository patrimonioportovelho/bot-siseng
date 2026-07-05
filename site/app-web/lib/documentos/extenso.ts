const UNIDADES = [
  "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"
];
const DEZ_A_DEZENOVE = [
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"
];
const DEZENAS = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"
];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos"
];

function tresDigitosPorExtenso(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (centena > 0) partes.push(CENTENAS[centena]);
  if (resto > 0) {
    if (resto < 10) partes.push(UNIDADES[resto]);
    else if (resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
    else {
      const dezena = Math.floor(resto / 10);
      const unidade = resto % 10;
      partes.push(unidade > 0 ? `${DEZENAS[dezena]} e ${UNIDADES[unidade]}` : DEZENAS[dezena]);
    }
  }
  return partes.join(" e ");
}

const ESCALAS = [
  { valor: 1_000_000_000, singular: "bilhão", plural: "bilhões" },
  { valor: 1_000_000, singular: "milhão", plural: "milhões" },
  { valor: 1_000, singular: "mil", plural: "mil" }
];

// Converte um inteiro (0 a 999.999.999.999) para texto por extenso em português.
export function inteiroPorExtenso(valor: number): string {
  if (valor === 0) return "zero";
  let restante = Math.floor(valor);
  const grupos: string[] = [];

  for (const escala of ESCALAS) {
    const quantidade = Math.floor(restante / escala.valor);
    if (quantidade > 0) {
      if (escala.valor === 1_000 && quantidade === 1) {
        grupos.push("mil");
      } else {
        const nomeGrupo = tresDigitosPorExtenso(quantidade);
        grupos.push(`${nomeGrupo} ${quantidade === 1 ? escala.singular : escala.plural}`);
      }
      restante %= escala.valor;
    }
  }

  if (restante > 0 || grupos.length === 0) {
    grupos.push(tresDigitosPorExtenso(restante));
  }

  return grupos.filter(Boolean).join(" e ");
}

// Converte um valor monetário para "X reais e Y centavos", no padrão exigido
// em contratos e recibos no Brasil. Ex.: valorPorExtenso(1850.5) =>
// "mil e oitocentos e cinquenta reais e cinquenta centavos".
export function valorPorExtenso(valor: number): string {
  const centavosTotal = Math.round(Math.abs(valor) * 100);
  const reais = Math.floor(centavosTotal / 100);
  const centavos = centavosTotal % 100;

  const parteReais = reais > 0
    ? `${inteiroPorExtenso(reais)} ${reais === 1 ? "real" : "reais"}`
    : "";
  const parteCentavos = centavos > 0
    ? `${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`
    : "";

  if (parteReais && parteCentavos) return `${parteReais} e ${parteCentavos}`;
  if (parteReais) return parteReais;
  if (parteCentavos) return parteCentavos;
  return "zero reais";
}

// Formata uma data (Date ou string ISO) por extenso, ex.: "3 de julho de 2026".
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

export function dataPorExtenso(data: Date | string): string {
  const d = typeof data === "string" ? new Date(data) : data;
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

// Mesma ideia, mas com o dia sempre em 2 dígitos (ex.: "05 de julho de 2026")
// — usado só na linha de local/data de assinatura dos contratos de corretor.
export function dataPorExtensoComZero(data: Date | string | null | undefined): string {
  if (!data) return "";
  const d = typeof data === "string" ? new Date(data) : data;
  return `${String(d.getDate()).padStart(2, "0")} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

// Formata CPF (11 dígitos) como 000.000.000-00. Aceita string só com números.
export function formatarCpf(cpf: string): string {
  const digitos = cpf.replace(/\D/g, "").padStart(11, "0");
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9, 11)}`;
}
