// Orçamento e pagamento da Manutenção. Tudo aqui é seguro para cliente e servidor.

export type GrupoOrcamento = "material" | "servico";

// Categorias de obra (as mesmas famílias dos tipos de serviço do quadro, mais
// as que a SINAPI traz). O catálogo importado usa estes nomes.
export const CATEGORIAS_OBRA = [
  "Elétrica",
  "Hidráulica",
  "Pintura",
  "Cobertura e telhado",
  "Esquadrias, portas e fechaduras",
  "Alvenaria e revestimentos",
  "Pisos",
  "Forro e gesso",
  "Impermeabilização",
  "Ar-condicionado",
  "Jardim e áreas externas",
  "Marcenaria e madeiras",
  "Louças e metais sanitários",
  "Limpeza e dedetização",
  "Ferragens e fixação",
  "Outros"
] as const;

// Unidades de medida dos materiais.
export const UNIDADES_MATERIAL = ["un", "m", "m²", "m³", "kg", "l", "cx", "sc", "pç", "rl", "lata", "par", "jg", "vb"];

// Como o serviço é cobrado (reforma e mão de obra).
export const MODALIDADES_SERVICO: { valor: string; rotulo: string }[] = [
  { valor: "m²", rotulo: "por m²" },
  { valor: "m", rotulo: "linear (por metro)" },
  { valor: "diária", rotulo: "diária" },
  { valor: "h", rotulo: "por hora" },
  { valor: "un", rotulo: "por unidade" },
  { valor: "ponto", rotulo: "por ponto" },
  { valor: "vb", rotulo: "empreitada (verba global)" }
];

export type ItemOrcamento = {
  id: string;
  grupo: GrupoOrcamento;
  categoria: string | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  fornecedor: string | null;
  precoRef: number | null;
};

export type ItemCatalogo = {
  id: string;
  descricao: string;
  unidade: string;
  categoria: string;
  precoRef: number | null;
  referencia: string | null;
};

export function subtotalItem(i: { quantidade: number; valorUnitario: number }): number {
  return Math.round(i.quantidade * i.valorUnitario * 100) / 100;
}

export function totaisOrcamento(itens: ItemOrcamento[]) {
  let material = 0;
  let servico = 0;
  for (const i of itens) {
    if (i.grupo === "material") material += subtotalItem(i);
    else servico += subtotalItem(i);
  }
  const arred = (n: number) => Math.round(n * 100) / 100;
  return { material: arred(material), servico: arred(servico), total: arred(material + servico) };
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function moeda(n: number): string {
  return brl.format(n);
}

export function quantidadeTexto(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

// Diferença entre o valor informado e o de referência (SINAPI), em %.
export function diferencaRef(valorUnitario: number, precoRef: number | null): number | null {
  if (!precoRef || precoRef <= 0 || !valorUnitario) return null;
  return Math.round(((valorUnitario - precoRef) / precoRef) * 100);
}

// Texto do orçamento para a mensagem ao proprietário.
export function resumoOrcamentoTexto(itens: ItemOrcamento[]): string {
  if (itens.length === 0) return "";
  const t = totaisOrcamento(itens);
  const linhas = (grupo: GrupoOrcamento, titulo: string) => {
    const lista = itens.filter((i) => i.grupo === grupo);
    if (lista.length === 0) return [];
    return [
      `*${titulo}*`,
      ...lista.map((i) => `• ${i.descricao} — ${quantidadeTexto(i.quantidade)} ${i.unidade} × ${moeda(i.valorUnitario)} = ${moeda(subtotalItem(i))}`)
    ];
  };
  const partes = [...linhas("material", "Materiais"), ...linhas("servico", "Reforma e mão de obra")];
  if (t.material > 0 && t.servico > 0) partes.push(`Materiais: ${moeda(t.material)} · Mão de obra: ${moeda(t.servico)}`);
  return partes.join("\n");
}

// ---------------------------------------------------------------- pagamento

export const QUEM_ARCA: { valor: string; rotulo: string }[] = [
  { valor: "proprietario", rotulo: "Proprietário" },
  { valor: "inquilino", rotulo: "Inquilino (dano causado por ele)" },
  { valor: "imobiliaria", rotulo: "Imobiliária (cortesia / garantia)" }
];

export const QUEM_PAGA: { valor: string; rotulo: string; dica: string }[] = [
  { valor: "imobiliaria_adianta", rotulo: "Imobiliária paga e cobra depois", dica: "A imobiliária paga o fornecedor agora e cobra de quem arca." },
  { valor: "direto", rotulo: "Quem arca paga direto ao fornecedor", dica: "O dinheiro não passa pela imobiliária." }
];

export const FORMAS_PAGAMENTO: { valor: string; rotulo: string }[] = [
  { valor: "caucao", rotulo: "Abater da caução" },
  { valor: "desconto_repasse", rotulo: "Descontar do repasse do aluguel" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "pix", rotulo: "PIX" },
  { valor: "cartao", rotulo: "Cartão" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "dinheiro", rotulo: "Dinheiro" }
];

export const FORMA_LABEL: Record<string, string> = Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f.valor, f.rotulo]));
export const QUEM_ARCA_LABEL: Record<string, string> = Object.fromEntries(QUEM_ARCA.map((f) => [f.valor, f.rotulo]));
export const QUEM_PAGA_LABEL: Record<string, string> = Object.fromEntries(QUEM_PAGA.map((f) => [f.valor, f.rotulo]));

export type LinhaPagamento = {
  id: string;
  descricao: string;
  forma: string;
  valor: number;
  vencimento: string | null; // yyyy-mm-dd
  pagoEm: string | null; // yyyy-mm-dd
};

export function totaisPagamento(linhas: LinhaPagamento[], totalOrcamento: number) {
  const planejado = Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const pago = Math.round(linhas.filter((l) => l.pagoEm).reduce((s, l) => s + l.valor, 0) * 100) / 100;
  return {
    planejado,
    pago,
    emAberto: Math.round((planejado - pago) * 100) / 100,
    faltaAlocar: Math.round((totalOrcamento - planejado) * 100) / 100
  };
}

function dataBr(iso: string | null): string {
  if (!iso) return "sem data";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// Texto da forma de pagamento para a mensagem.
export function resumoPagamentoTexto(p: { quemArca: string | null; quemPaga: string | null; linhas: LinhaPagamento[]; obs: string | null }): string {
  const partes: string[] = [];
  if (p.quemArca) partes.push(`Quem arca com o custo: ${QUEM_ARCA_LABEL[p.quemArca] ?? p.quemArca}.`);
  if (p.quemPaga) partes.push(`${QUEM_PAGA_LABEL[p.quemPaga] ?? p.quemPaga}.`);
  if (p.linhas.length > 0) {
    partes.push(...p.linhas.map((l) => `• ${l.descricao}: ${moeda(l.valor)} — ${FORMA_LABEL[l.forma] ?? l.forma}${l.vencimento ? `, vencimento ${dataBr(l.vencimento)}` : ""}`));
  }
  if (p.obs?.trim()) partes.push(`Obs.: ${p.obs.trim()}`);
  return partes.join("\n");
}

// Divide `total` em `n` parcelas mensais (a última absorve os centavos).
export function gerarParcelas(total: number, n: number, primeiroVencimento: string): { valor: number; vencimento: string }[] {
  const base = Math.floor((total / n) * 100) / 100;
  const [a, m, d] = primeiroVencimento.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(a, m - 1 + i, 1));
    const ultimo = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    dt.setUTCDate(Math.min(d, ultimo));
    const valor = i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base;
    return { valor, vencimento: dt.toISOString().slice(0, 10) };
  });
}
