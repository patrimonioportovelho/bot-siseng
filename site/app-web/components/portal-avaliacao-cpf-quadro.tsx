"use client";

import { FinanciamentoKanban, type CardFinanciamento } from "@/components/financiamento-kanban";
import { PortalCreditoModal } from "@/components/portal-credito-modal";

// Quadro "Avaliação de CPF" do painel do corretor: o mesmo quadro do
// Financiamento do administrativo, só com os cards dele. Arrastar uma Consulta
// de CPF para "Montagem de processo" abre a janela com a Avaliação de crédito
// completa (ver portal-credito-modal.tsx).
export function PortalAvaliacaoCpfQuadro({
  cards,
  hoje,
  diasAlertaValidade,
  bancos
}: {
  cards: CardFinanciamento[];
  hoje: string;
  diasAlertaValidade: number;
  bancos: string[];
}) {
  return (
    <FinanciamentoKanban
      cards={cards}
      hoje={hoje}
      diasAlertaValidade={diasAlertaValidade}
      responsaveis={[]}
      bancos={bancos}
      parceiros={[]}
      responsavelPorColuna={{}}
      modoCorretor={{
        renderMontagem: ({ card, fechar, concluir }) => (
          <PortalCreditoModal key={card.id} avaliacaoId={card.id} clienteNome={card.cliente} fechar={fechar} concluir={concluir} />
        )
      }}
    />
  );
}
