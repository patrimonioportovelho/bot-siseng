export type NavItem = {
  label: string;
  href: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Clientes", href: "/clientes" },
  { label: "Imóveis", href: "/imoveis" },
  { label: "Transações", href: "/transacoes" },
  { label: "Financiamento", href: "/financiamento" },
  { label: "Financeiro", href: "/financeiro" },
  { label: "Parceiros", href: "/parceiros" },
  { label: "Configurações", href: "/configuracoes" }
];
