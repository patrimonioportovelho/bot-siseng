import type { NavItem } from "@/lib/nav";

// Menu lateral do Portal do Corretor — mesma ideia do lib/nav.ts (admin), só
// que escopado às ações que um corretor pode fazer por conta própria pelo
// portal. "Painel" é a home (mini dashboard das atividades dele como
// parceiro); os outros itens eram cards empilhados na tela principal antes
// de virar menu lateral (pedido do usuário: "menu lateral vertical igual do
// administrativo").
export const PORTAL_NAV_ITEMS: NavItem[] = [
  { label: "Painel", href: "/portal" },
  { label: "Elaboração de Contrato de Gestão", href: "/portal/gestao/novo" },
  { label: "Proposta de Compra e Venda", href: "/portal/proposta/novo" },
  { label: "Elaboração de Compra e Venda", href: "/portal/compra-venda/novo" },
  { label: "Avaliação de CPF", href: "/portal/avaliacao-cpf/novo" },
  { label: "Elaboração de Contrato de Administração", href: "/portal/administracao/novo" },
  { label: "Meus clientes", href: "/portal/clientes" }
];
