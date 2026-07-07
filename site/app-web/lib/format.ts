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

// Lista fechada com todos os status reais já vistos em transacoes.status —
// usada no select de troca rápida de status dentro da Administração.
export const STATUS_TRANSACAO_TODOS = [...STATUS_ABERTA, ...STATUS_CONCLUIDA, ...STATUS_CANCELADA];

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

// Formata inscrição imobiliária (14 dígitos) como xx.xx.xxx.xxxx.xxx. Se não
// tiver exatamente 14 dígitos (ex.: texto livre tipo "sem inscrição" ou
// "Lote 30 quadra 4", vindos da planilha antiga), devolve o valor original
// sem mexer — não é todo registro que tem um código completo.
export function formatInscricao(valor: unknown): string {
  if (!valor) return "";
  const d = String(valor).replace(/\D/g, "");
  if (d.length !== 14) return String(valor);
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 7)}.${d.slice(7, 11)}.${d.slice(11, 14)}`;
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

// "Prazo restante" de uma locação, em meses cheios até hoje. Prefere a Data
// de vencimento real do contrato (data_vencimento) quando ela existir — é o
// valor que já vem certo da planilha antiga na maioria dos contratos
// importados, que não têm o campo "Tempo de contrato (meses)" preenchido.
// Só cai pro cálculo por Data de assinatura + meses quando não tiver
// vencimento cadastrado (ex.: contrato novo, ainda sem data calculada). Sem
// esse fallback, o "Prazo do contrato" ficava sempre em "—" no dashboard de
// Locação pra quase todo contrato importado, mesmo tendo vencimento certo.
export function calcularPrazoRestante(
  dataAssinatura: Date | string | null,
  prazoContratoMeses: number | null,
  dataVencimento?: Date | string | null
): string {
  let fim: Date | null = null;

  if (dataVencimento) {
    fim = new Date(dataVencimento);
  } else if (dataAssinatura && prazoContratoMeses) {
    fim = new Date(dataAssinatura);
    fim.setMonth(fim.getMonth() + prazoContratoMeses);
  }

  if (!fim || Number.isNaN(fim.getTime())) return "—";

  const hoje = new Date();
  const mesesRestantes =
    (fim.getFullYear() - hoje.getFullYear()) * 12 + (fim.getMonth() - hoje.getMonth());

  if (mesesRestantes <= 0) return "Vencido";
  if (mesesRestantes === 1) return "1 mês";
  return `${mesesRestantes} meses`;
}

// Soma meses a uma data no formato do <input type="date"> (yyyy-mm-dd) e
// devolve no mesmo formato — usado para calcular a Data de vencimento de uma
// locação a partir da Data de assinatura + Tempo de contrato (meses), sem
// depender de digitação manual.
export function somarMeses(dataYYYYMMDD: string, meses: number | null): string {
  if (!dataYYYYMMDD || !meses) return "";
  const d = new Date(dataYYYYMMDD + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

// Quantos dias faltam (ou já passaram, negativo) até a Data de vencimento
// real de uma locação — base pro destaque de contrato vencido/alerta no
// dashboard de Locação.
export function diasParaVencimento(dataVencimento: Date | string | null): number | null {
  if (!dataVencimento) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(dataVencimento);
  fim.setHours(0, 0, 0, 0);
  if (Number.isNaN(fim.getTime())) return null;
  return Math.round((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

// Situação do prazo de uma locação a partir da Data de vencimento real do
// contrato: "vencido" (já passou — linha vermelha no dashboard), "alerta"
// (90 dias ou menos pra vencer — precisa decidir renovar ou cancelar) ou
// "normal".
export type SituacaoContrato = "vencido" | "alerta" | "normal";

export function situacaoContratoLocacao(dataVencimento: Date | string | null): SituacaoContrato | null {
  const dias = diasParaVencimento(dataVencimento);
  if (dias === null) return null;
  if (dias < 0) return "vencido";
  if (dias <= 90) return "alerta";
  return "normal";
}

// Mesma ideia da Locação (vencido/alerta/normal), só que genérica — usada no
// Financeiro, onde a janela de alerta é de 15 dias (não 90) e só faz sentido
// olhar a data de vencimento enquanto a movimentação ainda não foi paga/
// recebida; depois de paga, não tem mais "situação" nenhuma (nem vencido).
export function situacaoVencimento(
  vencimento: Date | string | null,
  jaResolvido: boolean,
  diasAlerta: number
): SituacaoContrato | null {
  if (jaResolvido) return null;
  const dias = diasParaVencimento(vencimento);
  if (dias === null) return null;
  if (dias < 0) return "vencido";
  if (dias <= diasAlerta) return "alerta";
  return "normal";
}
