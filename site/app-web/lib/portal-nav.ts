import type { NavItem } from "@/lib/nav";

// Menu lateral do Portal do Corretor — mesma ideia do lib/nav.ts (admin), só
// que escopado às ações que um corretor pode fazer por conta própria pelo
// portal. "Painel" é a home (mini dashboard das atividades dele como
// parceiro); os outros itens eram cards empilhados na tela principal antes
// de virar menu lateral (pedido do usuário: "menu lateral vertical igual do
// administrativo").
// Cada item aponta pro PAINEL do módulo (lista de cadastrados + rascunho),
// não direto pro formulário "novo" — pedido do usuário: salvar um rascunho e
// entrar em outra página fazia ele "sumir", porque não existia lugar nenhum
// pra ver o rascunho fora da tela exata de criação. Cada painel tem seu
// próprio botão "+ Novo" pra chegar no formulário.
export const PORTAL_NAV_ITEMS: NavItem[] = [
  { label: "Painel", href: "/portal" },
  { label: "Elaboração de Contrato de Gestão", href: "/portal/gestao" },
  { label: "Proposta de Compra e Venda", href: "/portal/proposta" },
  { label: "Elaboração de Compra e Venda", href: "/portal/compra-venda" },
  { label: "Avaliação de CPF", href: "/portal/avaliacao-cpf" },
  { label: "Elaboração de Contrato de Administração", href: "/portal/administracao" },
  { label: "Elaboração de Locação", href: "/portal/locacao" },
  { label: "Meus clientes", href: "/portal/clientes" }
];
