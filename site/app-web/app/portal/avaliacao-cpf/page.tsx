import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalRascunhoAviso } from "@/components/portal-rascunho-aviso";
import { PortalAvaliacaoCpfQuadro } from "@/components/portal-avaliacao-cpf-quadro";
import { hojeInputDate } from "@/lib/format";
import { DIAS_ALERTA_VALIDADE } from "@/lib/financiamento/quadro";
import { carregarCardsFinanciamento } from "@/lib/financiamento/cards-quadro";

export const dynamic = "force-dynamic";

// Painel do corretor para Avaliação de CPF: o mesmo quadro (kanban) do
// Financiamento do administrativo, só com as avaliações dele. O status muda aqui
// conforme o administrativo avança o processo. O corretor move uma coisa: a
// Consulta de CPF para "Montagem de processo", o que abre o formulário completo
// da Avaliação de crédito (cadastro, 3 perguntas e documentos).
export default async function PortalAvaliacaoCpfPage() {
  const session = await requirePortalSession();
  const cards = await carregarCardsFinanciamento({ parceiro_id: session.parceiroId });
  const bancos = [...new Set(cards.map((c) => c.banco).filter((b): b is string => !!b))].sort((x, y) => x.localeCompare(y, "pt-BR"));

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="px-4 py-6 max-w-[1800px] mx-auto">
        <Link href="/portal" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar
        </Link>

        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <div className="text-lg font-bold text-gray-900">Avaliação de CPF</div>
          <Link
            href="/portal/avaliacao-cpf/novo"
            className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold hover:opacity-90"
          >
            + Nova avaliação
          </Link>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Suas avaliações em um quadro igual ao do administrativo: o card muda de etapa aqui conforme o processo avança. Para
          transformar uma <strong>Consulta de CPF</strong> em Avaliação de crédito, arraste o card para{" "}
          <strong>Montagem de processo</strong> (ou use o botão do card) e complete o formulário.
        </p>

        <div className="mb-4">
          <PortalRascunhoAviso chave="sis_rascunho_avaliacao_cpf" href="/portal/avaliacao-cpf/novo" label="avaliação de CPF" />
        </div>

        <PortalAvaliacaoCpfQuadro cards={cards} hoje={hojeInputDate()} diasAlertaValidade={DIAS_ALERTA_VALIDADE} bancos={bancos} />
      </div>
    </div>
  );
}
