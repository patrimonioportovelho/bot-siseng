export type NavItem = {
  label: string;
  href: string;
};

// Ordem espelha a navegação real do AppSheet (Parceiro, Clientes, Imóveis,
// Avaliações/Andamento/Lançamento, Administrações, Transações Locação/Compra
// e Venda, Honorários, Movimentações, Relatórios), agrupando o que no
// AppSheet eram views separadas ("Nova Transação", "Locações", "Compra e
// venda" etc.) em uma única página por módulo, com abas internas.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Parceiros", href: "/parceiros" },
  { label: "Clientes", href: "/clientes" },
  { label: "Imóveis", href: "/imoveis" },
  { label: "Administrações", href: "/administracoes" },
  { label: "Transações", href: "/transacoes" },
  { label: "Financiamento", href: "/financiamento" },
  { label: "Financeiro", href: "/financeiro" },
  { label: "Metas", href: "/metas" },
  { label: "Relatórios", href: "/relatorios" },
  { label: "Configurações", href: "/configuracoes" }
];
