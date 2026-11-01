export type NavItem = {
  label: string;
  href: string;
  // rotas que também deixam este item destacado no menu (além do próprio href)
  ativoEm?: string[];
};

// Ordem espelha a navegação real do AppSheet (Parceiro, Clientes, Imóveis,
// Avaliações/Andamento/Lançamento, Administrações, Transações Locação/Compra
// e Venda, Honorários, Movimentações, Relatórios). Locação e Compra e Venda
// voltaram a ser dois itens separados no menu (como no AppSheet original) —
// misturado numa página só ficava difícil de bater o olho.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  // Atividades abre no Calendário; os quadros (Manutenção, Gestões) e o Painel ficam dentro dela.
  { label: "Atividades", href: "/manutencao/calendario", ativoEm: ["/manutencao", "/gestoes"] },
  { label: "Marketing", href: "/marketing" },
  { label: "Parceiros", href: "/parceiros" },
  { label: "Recrutamento", href: "/recrutamento" },
  { label: "Clientes", href: "/clientes" },
  { label: "Imóveis", href: "/imoveis" },
  { label: "Administrações", href: "/administracoes" },
  { label: "Locação", href: "/transacoes/locacao" },
  { label: "Compra e Venda", href: "/transacoes/venda" },
  { label: "Financiamento", href: "/financiamento" },
  { label: "Financeiro", href: "/financeiro" },
  { label: "Metas", href: "/metas" },
  { label: "Eventos", href: "/eventos" },
  { label: "Relatórios", href: "/relatorios" },
  { label: "Documentos", href: "/documentos" },
  { label: "Configurações", href: "/configuracoes" }
];
