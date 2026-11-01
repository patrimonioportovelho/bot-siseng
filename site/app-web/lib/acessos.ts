// Acessos (papéis) do administrativo. Cada pessoa pode ter mais de um (ex.: um
// administrativo que também é corretor) e vale a soma do que cada papel permite.
// Este arquivo é puro (sem banco) para poder rodar também no middleware.

export const ACESSOS = [
  {
    id: "diretor",
    rotulo: "Diretor",
    descricao: "Acesso a tudo e pode alterar tudo, inclusive as Configurações."
  },
  {
    id: "financeiro",
    rotulo: "Financeiro",
    descricao: "Dashboard, Atividades, Locação e Compra e Venda; edita o Financeiro e tudo que envolve valores nas transações."
  },
  {
    id: "administrativo",
    rotulo: "Administrativo",
    descricao: "Atividades, Marketing, Parceiros, Clientes, Imóveis, Administrações, Dashboard, Locação, Compra e Venda, Financiamento e Documentos (edita); Financeiro só para consultar."
  },
  {
    id: "recrutador",
    rotulo: "Recrutador",
    descricao: "Parceiros, Recrutamento e Dashboard, com edição completa."
  },
  {
    id: "corretor",
    rotulo: "Corretor",
    descricao: "Portal do corretor completo e o Dashboard do administrativo (só consulta)."
  }
] as const;

export type AcessoId = (typeof ACESSOS)[number]["id"];
// "legado" não é um acesso que se escolhe: é quem ainda não recebeu nenhum e
// continua com o que sempre teve (tudo, menos Configurações) até o Diretor definir.
export type AcessoEfetivo = AcessoId | "legado";

export type ModuloId =
  | "dashboard"
  | "atividades"
  | "marketing"
  | "parceiros"
  | "recrutamento"
  | "clientes"
  | "imoveis"
  | "administracoes"
  | "locacao"
  | "compra_venda"
  | "financiamento"
  | "financeiro"
  | "metas"
  | "eventos"
  | "relatorios"
  | "documentos"
  | "configuracoes";

export type Nivel = "ver" | "editar";

const TODOS_MODULOS: ModuloId[] = [
  "dashboard", "atividades", "marketing", "parceiros", "recrutamento", "clientes", "imoveis", "administracoes",
  "locacao", "compra_venda", "financiamento", "financeiro", "metas", "eventos", "relatorios", "documentos", "configuracoes"
];

const IDS_VALIDOS = new Set<string>(ACESSOS.map((a) => a.id));

// O que cada papel pode em cada módulo. Módulo que nenhum papel lista (Metas,
// Eventos, Relatórios) fica só com o Diretor.
const MATRIZ: Record<AcessoEfetivo, Partial<Record<ModuloId, Nivel>>> = {
  legado: Object.fromEntries(TODOS_MODULOS.filter((m) => m !== "configuracoes").map((m) => [m, "editar" as Nivel])),
  diretor: Object.fromEntries(TODOS_MODULOS.map((m) => [m, "editar" as Nivel])),
  financeiro: {
    dashboard: "ver",
    atividades: "ver",
    // valores/honorários/repasses são editados dentro das transações
    locacao: "editar",
    compra_venda: "editar",
    financeiro: "editar"
  },
  administrativo: {
    atividades: "editar",
    marketing: "editar",
    parceiros: "editar",
    clientes: "editar",
    imoveis: "editar",
    administracoes: "editar",
    dashboard: "editar",
    locacao: "editar",
    compra_venda: "editar",
    financiamento: "editar",
    documentos: "editar",
    financeiro: "ver"
  },
  recrutador: {
    parceiros: "editar",
    recrutamento: "editar",
    dashboard: "editar"
  },
  corretor: {
    dashboard: "ver"
  }
};

export function acessoValido(id: string): id is AcessoId {
  return IDS_VALIDOS.has(id);
}

// Papéis efetivos de uma sessão. Quem ainda não recebeu nenhum papel (cadastros
// anteriores a esta tela) continua com o acesso de antes ("legado") para ninguém
// ficar trancado de fora até o Diretor configurar.
export function acessosDaSessao(s: { isAdm?: boolean; acessos?: string[] | null }): AcessoEfetivo[] {
  const lista: AcessoEfetivo[] = (s.acessos ?? []).filter(acessoValido);
  if (s.isAdm && !lista.includes("diretor")) lista.push("diretor");
  return lista.length > 0 ? lista : ["legado"];
}

export function nivelNoModulo(acessos: readonly AcessoEfetivo[], modulo: ModuloId): Nivel | null {
  let nivel: Nivel | null = null;
  for (const a of acessos) {
    const n = MATRIZ[a]?.[modulo];
    if (n === "editar") return "editar";
    if (n === "ver") nivel = "ver";
  }
  return nivel;
}

// Vários módulos "ou": vale o melhor nível entre eles (ex.: as telas de
// transação servem Locação e Compra e Venda).
export function nivelEmModulos(acessos: readonly AcessoEfetivo[], modulos: readonly ModuloId[]): Nivel | null {
  let melhor: Nivel | null = null;
  for (const m of modulos) {
    const n = nivelNoModulo(acessos, m);
    if (n === "editar") return "editar";
    if (n === "ver") melhor = "ver";
  }
  return melhor;
}

// Rota -> módulo(s). Mais específico primeiro. Rota fora desta lista (login,
// portal, notícias, API...) não é controlada por aqui.
const ROTAS: [string, ModuloId[]][] = [
  ["/dashboard", ["dashboard"]],
  ["/manutencao", ["atividades"]],
  ["/gestoes", ["atividades"]],
  ["/marketing", ["marketing"]],
  ["/parceiros", ["parceiros"]],
  ["/recrutamento", ["recrutamento"]],
  ["/clientes", ["clientes"]],
  ["/imoveis", ["imoveis"]],
  ["/administracoes", ["administracoes"]],
  ["/transacoes/locacao", ["locacao"]],
  ["/transacoes/venda", ["compra_venda"]],
  ["/transacoes", ["locacao", "compra_venda"]],
  ["/financiamento", ["financiamento"]],
  ["/financeiro", ["financeiro"]],
  ["/metas", ["metas"]],
  ["/eventos", ["eventos"]],
  ["/relatorios", ["relatorios"]],
  ["/documentos", ["documentos"]],
  ["/configuracoes", ["configuracoes"]]
];

export function modulosDaRota(pathname: string): ModuloId[] | null {
  for (const [prefixo, modulos] of ROTAS) {
    if (pathname === prefixo || pathname.startsWith(prefixo + "/")) return modulos;
  }
  return null;
}

// Fichas de Cliente/Imóvel abrem em painel lateral (?embed=1) dentro de uma
// transação, administração ou financiamento: quem enxerga essas telas pode ver
// a ficha ali dentro, mesmo sem o módulo Clientes/Imóveis no menu.
const MODULOS_DO_PAINEL: ModuloId[] = ["locacao", "compra_venda", "administracoes", "financiamento"];

export function nivelNaRota(acessos: readonly AcessoEfetivo[], pathname: string, embutido = false): Nivel | null {
  const modulos = modulosDaRota(pathname);
  if (!modulos) return "editar"; // rota não controlada
  const nivel = nivelEmModulos(acessos, modulos);
  if (nivel) return nivel;
  if (embutido && (modulos[0] === "clientes" || modulos[0] === "imoveis")) {
    return nivelEmModulos(acessos, MODULOS_DO_PAINEL) ? "ver" : null;
  }
  return null;
}

// Itens do menu lateral que a pessoa pode abrir.
export function podeVerRotaDoMenu(acessos: readonly AcessoEfetivo[], href: string): boolean {
  return nivelNaRota(acessos, href) !== null;
}
