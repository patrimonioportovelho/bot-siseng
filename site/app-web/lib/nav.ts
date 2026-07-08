export type NavItem = {
  label: string;
  href: string;
};

// Ordem espelha a navegação real do AppSheet (Parceiro, Clientes, Imóveis,
// Avaliações/Andamento/Lançamento, Administrações, Transações Locação/Compra
// e Venda, Honorários, Movimentações, Relatórios). Locação e Compra e Venda
// voltaram a ser dois itens separados no menu (como no AppSheet original) —
// misturado numa página só ficava difícil de bater o olho.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Atividades", href: "/manutencao" },
  { label: "Parceiros", href: "/parceiros" },
  { label: "Clientes", href: "/clientes" },
  { label: "Imóveis", href: "/imoveis" },
  { label: "Administrações", href: "/administracoes" },
  { label: "Locação", href: "/transacoes/locacao" },
  { label: "Compra e Venda", href: "/transacoes/venda" },
  { label: "Financiamento", href: "/financiamento" },
  { label: "Financeiro", href: "/financeiro" },
  { label: "Metas", href: "/metas" },
  { label: "Relatórios", href: "/relatorios" },
  { label: "Documentos", href: "/documentos" },
  { label: "Configurações", href: "/configuracoes" }
];
