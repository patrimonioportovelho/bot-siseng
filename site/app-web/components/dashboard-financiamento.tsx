import Link from "next/link";
import { GraficoBarras } from "@/components/grafico-barras";
import { GraficoPizza } from "@/components/grafico-pizza";
import { formatMoeda } from "@/lib/format";
import type { DashboardFinanciamento as Dados } from "@/lib/financiamento/dashboard";

const LIMITE_LINHAS = 12;
// Etapas de crédito paradas costumam ser as que mais esfriam: abrem já expandidas.
const ABRE_EXPANDIDA = new Set(["standbye", "restricao", "condicionado", "aprovado"]);

function Kpi({ rotulo, valor, sub, tom }: { rotulo: string; valor: string; sub?: string; tom?: "vermelho" | "ambar" | "verde" }) {
  const cls =
    tom === "vermelho"
      ? "bg-red-50 border-red-100 text-red-700"
      : tom === "ambar"
      ? "bg-amber-50 border-amber-100 text-amber-700"
      : tom === "verde"
      ? "bg-green-50 border-green-100 text-[#3C7A57]"
      : "bg-gray-50 border-gray-100 text-gray-900";
  return (
    <div className={`border rounded-xl p-3 ${cls}`}>
      <div className="text-xs opacity-70">{rotulo}</div>
      <div className="text-lg font-bold mt-1">{valor}</div>
      {sub && <div className="text-[11px] opacity-70">{sub}</div>}
    </div>
  );
}

// Financiamento no Dashboard geral: carteira de hoje por etapa (não some quando
// vira o mês), movimentação do período e quem precisa de contato (sem nenhuma
// movimentação dentro do período selecionado).
export function DashboardFinanciamento({
  dados,
  periodoTexto,
  dadosGraficoAvaliacoesMes
}: {
  dados: Dados;
  periodoTexto: string;
  dadosGraficoAvaliacoesMes: { label: string; avaliacoes: number }[];
}) {
  const comPendencia = dados.carteira.filter((l) => l.semMovimentacao > 0);
  const pizza = dados.carteira.filter((l) => l.total > 0).map((l) => ({ label: l.label, valor: l.total }));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Financiamento</div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/financiamento/relatorio" className="text-xs text-primary font-semibold hover:underline">
            Relatório de tempo e conformidade →
          </Link>
          <Link href="/financiamento" className="text-xs text-primary font-semibold hover:underline">
            Ver quadro completo →
          </Link>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        A <strong>carteira</strong> mostra tudo que está em andamento hoje, sem depender da data da avaliação — o que está em Standbye,
        por exemplo, continua aqui quando vira o mês. A movimentação e os que <strong>precisam de contato</strong> seguem o período
        selecionado ({periodoTexto}).
      </p>

      {/* Carteira de hoje */}
      <div className="text-xs font-semibold text-gray-600 mb-2">
        Carteira hoje — {dados.totalCarteira} em andamento
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
        {dados.carteira.map((l) => (
          <Link key={l.coluna} href="/financiamento" className={`border rounded-lg px-3 py-2 hover:shadow-sm transition-shadow ${l.cor}`}>
            <div className="text-[11px] leading-tight font-semibold">{l.label}</div>
            <div className="text-lg font-bold">{l.total}</div>
            {l.semMovimentacao > 0 && <div className="text-[10px] opacity-80">{l.semMovimentacao} sem movimentação</div>}
          </Link>
        ))}
      </div>

      {/* Movimentação do período */}
      <div className="text-xs font-semibold text-gray-600 mb-2">Movimentação no período</div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
        <Kpi rotulo="Novas avaliações" valor={String(dados.novasAvaliacoes)} sub="pela data da avaliação" />
        <Kpi rotulo="Entraram no processo" valor={String(dados.entraramNoProcesso)} sub="Documentação em diante" />
        <Kpi rotulo="Concluídos" valor={String(dados.concluidos)} tom="verde" />
        <Kpi rotulo="Encerrados" valor={String(dados.encerrados)} sub="reprovação, cancelada ou vencida" />
        <Kpi rotulo="Contatos registrados" valor={String(dados.contatosRegistrados)} sub="WhatsApp, ligação, etc." />
        <Kpi
          rotulo="Sem movimentação"
          valor={String(dados.totalSemMovimentacao)}
          sub="precisam de contato"
          tom={dados.totalSemMovimentacao > 0 ? "ambar" : undefined}
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Kpi rotulo="Acima da meta de tempo" valor={String(dados.acimaDaMeta)} sub="parados além da meta da etapa" tom={dados.acimaDaMeta > 0 ? "vermelho" : undefined} />
        <Kpi rotulo="Inconformidades abertas" valor={String(dados.inconformidadesAbertas)} tom={dados.inconformidadesAbertas > 0 ? "vermelho" : undefined} />
        <Kpi rotulo="Valor financiado (concluídos)" valor={formatMoeda(dados.valorFinanciadoConcluido)} sub="andamentos concluídos no período" />
        <Kpi
          rotulo="Tempo médio até conclusão"
          valor={dados.tempoMedioConclusaoDias !== null ? `${dados.tempoMedioConclusaoDias} dias` : "—"}
          sub="da data de avaliação à conclusão"
        />
      </div>

      {/* Precisam de contato */}
      <div className="text-xs font-semibold text-gray-600 mb-1">Precisam de contato — sem movimentação no período</div>
      <p className="text-[11px] text-gray-400 mb-2">
        Cards em andamento sem mudança de etapa, contato ou conformidade registrados entre as datas selecionadas. Os mais parados vêm primeiro.
      </p>
      {comPendencia.length === 0 ? (
        <div className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
          Tudo que está em andamento teve movimentação neste período.
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {comPendencia.map((l) => (
            <details key={l.coluna} className="border border-gray-200 rounded-lg" open={ABRE_EXPANDIDA.has(l.coluna)}>
              <summary className={`cursor-pointer px-3 py-2 text-xs font-semibold flex items-center justify-between gap-2 rounded-lg ${l.cor}`}>
                <span>{l.label}</span>
                <span className="font-normal opacity-80">
                  {l.semMovimentacao} de {l.total} sem movimentação
                </span>
              </summary>
              <div className="divide-y divide-gray-100">
                {l.cards.slice(0, LIMITE_LINHAS).map((c) => (
                  <Link
                    key={c.id}
                    href={`/financiamento/${c.id}/etiqueta`}
                    className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs hover:bg-gray-50"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-gray-800">{c.cliente}</span>
                      {c.banco && <span className="text-gray-400"> · {c.banco}</span>}
                      {c.corretor && <span className="text-gray-400"> · {c.corretor.split(" ")[0]}</span>}
                      {c.inconformidade && <span className="ml-1 text-red-600 font-semibold">inconforme</span>}
                      {c.validadeDias !== null && (
                        <span className={`ml-1 font-semibold ${c.validadeDias < 0 ? "text-red-600" : "text-amber-600"}`}>
                          {c.validadeDias < 0 ? `venceu há ${-c.validadeDias}d` : `vence em ${c.validadeDias}d`}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right text-[11px] text-gray-500">
                      <span className={c.acimaDaMeta ? "text-red-600 font-semibold" : ""}>
                        parado há {c.diasNaEtapa}d{c.estimado ? "*" : ""}
                      </span>
                      <span className="text-gray-400">
                        {" · "}
                        {c.ultimoContatoDias === null ? "sem contato registrado" : `contato há ${c.ultimoContatoDias}d`}
                      </span>
                    </span>
                  </Link>
                ))}
                {l.cards.length > LIMITE_LINHAS && (
                  <Link href="/financiamento" className="block px-3 py-1.5 text-[11px] text-primary hover:underline">
                    + {l.cards.length - LIMITE_LINHAS} no quadro de Financiamento →
                  </Link>
                )}
              </div>
            </details>
          ))}
          <div className="text-[10px] text-gray-400">* início estimado pelas datas cadastradas (antes do uso do quadro).</div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-2">Avaliações levantadas, mês a mês</div>
          <GraficoBarras
            dados={dadosGraficoAvaliacoesMes}
            series={[{ chave: "avaliacoes", cor: "#33587F", nome: "Avaliações" }]}
            formatarValor={(v) => String(v)}
            mensagemVazia="Sem avaliações levantadas nesse período."
          />
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-2">Carteira hoje, por etapa</div>
          <GraficoPizza dados={pizza} formatarValor={(v) => String(v)} mensagemVazia="Nada em andamento." />
        </div>
      </div>
    </div>
  );
}
