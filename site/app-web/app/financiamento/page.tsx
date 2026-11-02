import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { hojeInputDate } from "@/lib/format";
import { lojasSelecionadas, whereLojaFiltroParceiro } from "@/lib/lojas/filtro";
import { FinanciamentoKanban } from "@/components/financiamento-kanban";
import { definirResponsavelColunaFinAction, garantirEpisodiosFinanciamento, moverCardFinanciamentoAction } from "./quadro-actions";
import { DIAS_ALERTA_VALIDADE } from "@/lib/financiamento/quadro";
import { carregarCardsFinanciamento } from "@/lib/financiamento/cards-quadro";

export const dynamic = "force-dynamic";

// Financiamento em Kanban (30/10/2026): do crédito (Consulta de CPF → Montagem
// → Aprovado) ao processo (Documentação → Engenharia → Conformidade → Comitê →
// Contrato → Registro) até Concluído. Cada mudança de etapa vira uma atividade
// com tempo (ver /financiamento/relatorio). A lista antiga continua em
// /financiamento/lista.
export default async function FinanciamentoQuadroPage() {
  await requireAdminSession();
  await garantirEpisodiosFinanciamento();
  const lojasFiltro = await lojasSelecionadas();

  const [cards, etapas, responsaveis] = await Promise.all([
    carregarCardsFinanciamento(whereLojaFiltroParceiro(lojasFiltro)),
    prisma.financiamento_etapas.findMany({ select: { coluna: true, responsavel_id: true } }),
    prisma.parceiros.findMany({
      where: { funcao: { in: ["Administrativo", "Corretor"] }, status_funcao: "Ativo" },
      orderBy: [{ funcao: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true }
    })
  ]);

  const responsavelPorColuna: Record<string, string | null> = {};
  for (const e of etapas) responsavelPorColuna[e.coluna] = e.responsavel_id;

  const bancos = [...new Set(cards.map((c) => c.banco).filter((b): b is string => !!b))].sort((x, y) => x.localeCompare(y, "pt-BR"));
  const parceirosMap = new Map<string, string>();
  for (const c of cards) if (c.parceiroId && c.parceiroNome) parceirosMap.set(c.parceiroId, c.parceiroNome);
  const parceiros = [...parceirosMap.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-sm font-bold text-gray-800">Financiamento</div>
          <div className="text-[11px] text-gray-400">
            Arraste o card para mudar de etapa. Cada mudança é registrada com o tempo gasto em cada etapa.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/financiamento/relatorio"
            className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold text-gray-600 whitespace-nowrap"
          >
            Relatório
          </Link>
          <Link
            href="/financiamento/lista"
            className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 font-semibold text-gray-600 whitespace-nowrap"
          >
            Ver em lista
          </Link>
          <Link href="/financiamento/novo" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap">
            + Nova avaliação
          </Link>
        </div>
      </div>

      <FinanciamentoKanban
        cards={cards}
        hoje={hojeInputDate()}
        diasAlertaValidade={DIAS_ALERTA_VALIDADE}
        responsaveis={responsaveis}
        bancos={bancos}
        parceiros={parceiros}
        responsavelPorColuna={responsavelPorColuna}
        moverCard={moverCardFinanciamentoAction}
        definirResponsavelColuna={definirResponsavelColunaFinAction}
      />
    </div>
  );
}
