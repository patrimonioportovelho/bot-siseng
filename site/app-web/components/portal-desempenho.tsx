import Link from "next/link";
import type { ReactNode } from "react";
import { GraficoBarras } from "@/components/grafico-barras";
import { formatMoeda } from "@/lib/format";
import { labelColuna } from "@/lib/gestoes/opcoes";
import { PRESETS_PERIODO, type Comparativo, type DesempenhoCorretor } from "@/lib/portal/desempenho";

// R$ 1,29 mi / R$ 220 mil / R$ 850 — curto para caber nos cartões.
function moedaCompacta(v: number): string {
  const n = Math.abs(v);
  if (n >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (n >= 10_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return formatMoeda(v).replace(",00", "");
}

const numero = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function PosicaoPill({ c }: { c: Comparativo }) {
  if (c.posicao === null) return <span className="text-[10px] text-gray-400">sem posição no período</span>;
  const primeiro = c.posicao === 1;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold rounded-full border px-2 py-0.5 ${
        primeiro ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-50 text-gray-600 border-gray-200"
      }`}
    >
      {primeiro ? "🏆" : "#"} {c.posicao}º entre {c.total}
    </span>
  );
}

function Tile({
  label,
  valor,
  sub,
  posicao,
  destaque
}: {
  label: string;
  valor: string;
  sub?: ReactNode;
  posicao?: Comparativo;
  destaque?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3.5 flex flex-col gap-1 ${destaque ? "bg-primary/5 border-primary/20" : "bg-white border-gray-200"}`}>
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-gray-900 leading-tight">{valor}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
      {posicao && <div className="mt-1">{<PosicaoPill c={posicao} />}</div>}
    </div>
  );
}

function Bloco({ titulo, sub, children, className = "" }: { titulo: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-gray-200 rounded-xl p-4 ${className}`}>
      <div className="text-sm font-bold text-gray-800">{titulo}</div>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// Uma linha do comparativo: sua barra x a média da equipe, com o valor e a posição.
function LinhaComparativo({ rotulo, c, formatar }: { rotulo: string; c: Comparativo; formatar: (v: number) => string }) {
  const maior = Math.max(c.voce, c.media, 1);
  const larg = (v: number) => `${v > 0 ? Math.max(2, (v / maior) * 100) : 0}%`;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      <div className="text-xs font-semibold text-gray-700">{rotulo}</div>
      <PosicaoPill c={c} />
      <div className="col-span-2 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: larg(c.voce) }} />
          </div>
          <span className="w-24 text-right text-[11px] font-bold text-gray-800">{formatar(c.voce)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gray-400" style={{ width: larg(c.media) }} />
          </div>
          <span className="w-24 text-right text-[11px] text-gray-500">{formatar(c.media)}</span>
        </div>
      </div>
    </div>
  );
}

export function PortalDesempenho({ d }: { d: DesempenhoCorretor }) {
  const { periodo: p, producao: pr, carteira: c } = d;
  const desde = d.corretor.desde ? new Date(d.corretor.desde).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null;
  const temLeads = d.leadsPorMes.some((m) => m.leads > 0);
  const maiorEtapa = Math.max(1, ...c.porEtapa.map((e) => e.qtd));

  return (
    <div className="flex flex-col gap-4 mb-4">
      {/* Cabeçalho + filtro de período */}
      <div className="rounded-2xl bg-primary text-white p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-widest opacity-70">Desempenho</div>
            <div className="text-lg md:text-xl font-bold leading-tight">{d.corretor.nome}</div>
            <div className="text-xs opacity-80 mt-0.5">
              {d.corretor.funcao ?? "Corretor"}
              {d.corretor.creci ? ` · CRECI ${d.corretor.creci}` : ""}
              {desde ? ` · Na imobiliária desde ${desde}` : ""}
            </div>
          </div>
          <div className="md:text-right">
            <div className="text-[11px] uppercase tracking-widest opacity-70">Período</div>
            <div className="text-sm font-semibold">{p.rotulo}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {PRESETS_PERIODO.map((x) => (
            <Link
              key={x.id}
              href={`/portal?periodo=${x.id}`}
              scroll={false}
              className={`text-[11px] rounded-full px-3 py-1 font-semibold border transition-colors ${
                p.preset === x.id ? "bg-white text-primary border-white" : "bg-white/10 border-white/30 text-white hover:bg-white/20"
              }`}
            >
              {x.rotulo}
            </Link>
          ))}
        </div>
        <form method="get" className="mt-2.5 flex flex-wrap items-end gap-2">
          <input type="hidden" name="periodo" value="personalizado" />
          <label className="text-[10px] uppercase tracking-wide opacity-80">
            De
            <input
              type="date"
              name="de"
              defaultValue={p.de}
              required
              className="block mt-0.5 text-xs rounded-lg px-2 py-1 text-gray-800 bg-white border border-white/40 outline-none"
            />
          </label>
          <label className="text-[10px] uppercase tracking-wide opacity-80">
            Até
            <input
              type="date"
              name="ate"
              defaultValue={p.ate}
              required
              className="block mt-0.5 text-xs rounded-lg px-2 py-1 text-gray-800 bg-white border border-white/40 outline-none"
            />
          </label>
          <button
            type="submit"
            className={`text-[11px] rounded-lg px-3 py-1.5 font-semibold border ${
              p.preset === "personalizado" ? "bg-white text-primary border-white" : "bg-white/10 border-white/30 hover:bg-white/20"
            }`}
          >
            Filtrar período
          </button>
        </form>
        {p.aviso && <p className="text-[11px] mt-2 bg-white/10 rounded-lg px-3 py-1.5">{p.aviso}</p>}
      </div>

      {/* Produção no período */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Produção no período</div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Tile
            destaque
            label="Captações"
            valor={String(pr.captacoes.voce)}
            sub={`${pr.captacoes.comExclusividade} com exclusividade · ${pr.captacoes.semExclusividade} sem`}
            posicao={pr.captacoes}
          />
          <Tile
            destaque
            label="Vendas concluídas"
            valor={String(pr.vendasConcluidas.voce)}
            sub={`Valor vendido: ${moedaCompacta(pr.vendasConcluidas.vgv.voce)}`}
            posicao={pr.vendasConcluidas}
          />
          <Tile
            label="Vendas acordadas"
            valor={String(pr.vendasAcordadas.voce)}
            sub={`Em andamento · ${moedaCompacta(pr.vendasAcordadas.valor)}`}
            posicao={pr.vendasAcordadas}
          />
          <Tile label="Locações" valor={String(pr.locacoes.voce)} sub={`Aluguéis: ${moedaCompacta(pr.locacoes.valor)}`} posicao={pr.locacoes} />
          <Tile label="Honorários recebidos" valor={moedaCompacta(pr.honorarios.voce)} sub="Repasses pagos no período" posicao={pr.honorarios} />
          <Tile label="Leads recebidos" valor={String(pr.leads.voce)} sub="Clientes cadastrados no seu nome" posicao={pr.leads} />
        </div>
      </div>

      {/* Leads por mês + comparativo */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Bloco titulo="Leads por mês" sub="Clientes cadastrados no seu nome, mês a mês, dentro do período.">
          <GraficoBarras
            dados={d.leadsPorMes}
            series={[{ chave: "leads", cor: "#04075c", nome: "Leads" }]}
            formatarValor={(v) => String(v)}
            mensagemVazia="Sem leads no período."
          />
          {!temLeads && <p className="text-[11px] text-gray-400 mt-2">Nenhum cliente cadastrado no seu nome neste período.</p>}
        </Bloco>

        <Bloco
          titulo="Comparativo com a equipe"
          sub="Barra azul: você. Barra cinza: média dos corretores com atividade no período. Você vê só a sua posição, sem os números dos colegas."
        >
          <div className="flex flex-col gap-4">
            <LinhaComparativo rotulo="Captações" c={pr.captacoes} formatar={numero} />
            <LinhaComparativo rotulo="Vendas concluídas" c={pr.vendasConcluidas} formatar={numero} />
            <LinhaComparativo rotulo="Valor vendido" c={pr.vendasConcluidas.vgv} formatar={moedaCompacta} />
            <LinhaComparativo rotulo="Vendas acordadas" c={pr.vendasAcordadas} formatar={numero} />
            <LinhaComparativo rotulo="Honorários recebidos" c={pr.honorarios} formatar={moedaCompacta} />
            <LinhaComparativo rotulo="Leads recebidos" c={pr.leads} formatar={numero} />
          </div>
        </Bloco>
      </div>

      {/* Carteira atual */}
      <Bloco titulo="Carteira atual" sub="Situação de hoje: não muda com o filtro de período.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Imóveis na carteira" valor={String(c.imoveis)} sub={`${c.anunciados} anunciado${c.anunciados === 1 ? "" : "s"} no site`} />
          <Tile label="Com exclusividade" valor={String(c.comExclusividade)} sub={`Sem exclusividade: ${c.semExclusividade}`} />
          <Tile
            label="Dias médios na carteira"
            valor={c.diasMedios === null ? "—" : String(c.diasMedios)}
            sub={c.diasMediosEscritorio === null ? undefined : `Média do escritório: ${c.diasMediosEscritorio}`}
          />
          <Tile
            label="Preço médio da carteira"
            valor={c.precoMedio === null ? "—" : moedaCompacta(c.precoMedio)}
            sub={c.precoMedioEscritorio === null ? undefined : `Média do escritório: ${moedaCompacta(c.precoMedioEscritorio)}`}
          />
        </div>

        {c.porEtapa.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Seus imóveis por etapa</div>
            <div className="flex flex-col gap-1.5">
              {c.porEtapa
                .sort((a, b) => b.qtd - a.qtd)
                .map((e) => (
                  <div key={e.coluna} className="flex items-center gap-2">
                    <span className="w-44 shrink-0 text-[11px] text-gray-600 truncate">{labelColuna(e.coluna)}</span>
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${(e.qtd / maiorEtapa) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right text-[11px] font-bold text-gray-800">{e.qtd}</span>
                  </div>
                ))}
            </div>
            <Link href="/portal/captacao" className="text-[11px] text-primary font-semibold hover:underline inline-block mt-3">
              Abrir o quadro da Ficha de Captação →
            </Link>
          </div>
        )}
      </Bloco>

      <p className="text-[10px] text-gray-400">
        Dados do SisEng. Vendas e locações contam pela data de assinatura; vendas acordadas, pelo cadastro da transação; honorários, pelo repasse pago.
        A posição é entre os corretores do sistema com atividade no período.
      </p>
    </div>
  );
}
