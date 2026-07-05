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
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatData(data: unknown) {
  if (!data) return "—";
  return new Date(data as string).toLocaleDateString("pt-BR");
}

// Formata CPF (qualquer string com 11 dígitos) como 000.000.000-00.
// Alguns registros foram importados de planilha e ficaram com sufixo ".0"
// (ex.: "884264752720" após tirar o ponto) — removemos esse resto de float
// antes de validar o tamanho.
export function formatCpf(cpf: unknown): string {
  if (!cpf) return "";
  const semSufixoFloat = String(cpf).replace(/\.0$/, "");
  const d = semSufixoFloat.replace(/\D/g, "");
  if (d.length !== 11) return String(cpf);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Formata CNPJ (14 dígitos) como 00.000.000/0000-00.
export function formatCnpj(cnpj: unknown): string {
  if (!cnpj) return "";
  const d = String(cnpj).replace(/\D/g, "");
  if (d.length !== 14) return String(cnpj);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// Formata telefone (10 ou 11 dígitos) como (xx) xxxxx-xxxx ou (xx) xxxx-xxxx.
export function formatTelefone(tel: unknown): string {
  if (!tel) return "";
  const d = String(tel).replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(tel);
}

// Converte fração decimal (0.225) para texto de percentual no padrão
// brasileiro (22,5) — usado nos campos de comissionamento do formulário.
export function formatPercentual(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const n = Number(valor) * 100;
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

// Caminho inverso: texto digitado pelo usuário ("22,5" ou "22.5") -> fração
// decimal (0.225) para gravar no banco no mesmo formato já usado.
export function percentualParaDecimal(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n / 100 : null;
}

// Formata um valor decimal (ex.: 2500) como texto de input no padrão
// brasileiro "2.500,00" — usado no campo de renda bruta do formulário.
export function formatValorEditavel(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Caminho inverso: texto digitado pelo usuário ("2.500,00") -> número
// (2500) para gravar no banco. Remove separador de milhar (.) antes de
// trocar a vírgula decimal por ponto — diferente de um replace ingênuo,
// que quebraria com múltiplos pontos de milhar.
export function valorEditavelParaDecimal(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
