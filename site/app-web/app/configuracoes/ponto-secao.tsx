import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { decidirLiberacaoAction } from "@/lib/ponto/actions";
import { resumoDaSemana } from "@/lib/ponto/relatorio";
import { fimDaSemana, formatarMin, inicioDaSemana, instanteDoDia, partesLocais } from "@/lib/ponto/regras";

const quando = (d: Date) => d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Porto_Velho" });

function paraYmd(d: Date): string {
  return partesLocais(d).ymd;
}

function dataDoParametro(semana: string | undefined): Date {
  const m = semana ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(semana) : null;
  return m ? instanteDoDia(Number(m[1]), Number(m[2]), Number(m[3])) : new Date();
}

// Configurações > Controle de ponto: pedidos de liberação (a diretoria decide aqui) e o resumo
// da semana de cada pessoa controlada, com o caminho para o espelho de ponto detalhado.
export async function PontoSecao({ semana }: { semana?: string }) {
  const referencia = dataDoParametro(semana);
  const ini = inicioDaSemana(referencia);
  const fim = fimDaSemana(referencia);
  const domingo = new Date(fim.getTime() - 86400000);
  const anterior = paraYmd(new Date(ini.getTime() - 86400000 * 7));
  const proxima = paraYmd(new Date(ini.getTime() + 86400000 * 7));

  const [resumo, pendentes, decididos] = await Promise.all([
    resumoDaSemana(referencia),
    prisma.ponto_liberacoes.findMany({ where: { status: "pendente" }, orderBy: { solicitado_em: "asc" } }),
    prisma.ponto_liberacoes.findMany({ where: { status: { not: "pendente" } }, orderBy: { decidido_em: "desc" }, take: 8 })
  ]);
  const nomes = new Map(
    (
      await prisma.parceiros.findMany({
        where: { id: { in: [...new Set([...pendentes, ...decididos].flatMap((l) => [l.parceiro_id, l.decidido_por].filter((x): x is string => !!x)))] } },
        select: { id: true, nome: true }
      })
    ).map((p) => [p.id, p.nome])
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4" id="ponto">
      <div className="text-sm font-bold text-gray-800 mb-1">Controle de ponto</div>
      <p className="text-xs text-gray-500 mb-3">
        O uso do sistema de quem tem acesso Administrativo, Financeiro ou Recrutador é registrado como ponto (entrada no login, saída ao encerrar, fechar o
        navegador ou ficar 10 min sem usar). Passou do teto semanal ou fora do expediente, o acesso só continua com a sua liberação. A jornada de cada
        pessoa fica na caixa que abre ao marcar o acesso, em Acessos.
      </p>

      {pendentes.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-bold text-amber-700 mb-1.5">Pedidos aguardando você ({pendentes.length})</div>
          <div className="flex flex-col gap-2">
            {pendentes.map((l) => (
              <form key={l.id} action={decidirLiberacaoAction} className="border border-amber-200 bg-amber-50/60 rounded-lg p-3">
                <input type="hidden" name="id" value={l.id} />
                <div className="text-xs text-gray-800">
                  <strong>{nomes.get(l.parceiro_id) ?? "—"}</strong> pediu {formatarMin(l.minutos_solicitados)} <span className="text-gray-400">· {quando(l.solicitado_em)}</span>
                </div>
                <div className="text-xs text-gray-600 mt-0.5">“{l.motivo}”</div>
                <div className="mt-2 flex items-end gap-2 flex-wrap">
                  <label className="text-[11px] text-gray-600">
                    Liberar (minutos)
                    <input type="number" name="minutos" min={15} max={720} step={15} defaultValue={l.minutos_solicitados} className="block w-24 text-xs border border-gray-300 rounded-lg px-2 py-1 mt-0.5 bg-white" />
                  </label>
                  <label className="text-[11px] text-gray-600">
                    Vale até
                    <select name="validade" className="block text-xs border border-gray-300 rounded-lg px-2 py-1 mt-0.5 bg-white">
                      <option value="dia">o fim de hoje</option>
                      <option value="semana">o fim da semana</option>
                    </select>
                  </label>
                  <label className="text-[11px] text-gray-600 flex-1 min-w-40">
                    Observação (opcional)
                    <input name="observacao" className="block w-full text-xs border border-gray-300 rounded-lg px-2 py-1 mt-0.5 bg-white" />
                  </label>
                  <button type="submit" name="decisao" value="aprovar" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold">
                    Aprovar
                  </button>
                  <button type="submit" name="decisao" value="negar" className="text-xs border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5 font-semibold">
                    Negar
                  </button>
                </div>
              </form>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <div className="text-xs font-bold text-gray-700">
          Semana de {ini.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Porto_Velho" })} a{" "}
          {domingo.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Porto_Velho" })}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <Link href={`/configuracoes?semana=${anterior}#ponto`} className="border border-gray-300 rounded-lg px-2.5 py-1 text-gray-600 hover:bg-gray-50">
            ← Semana anterior
          </Link>
          <Link href="/configuracoes#ponto" className="border border-gray-300 rounded-lg px-2.5 py-1 text-gray-600 hover:bg-gray-50">
            Esta semana
          </Link>
          <Link href={`/configuracoes?semana=${proxima}#ponto`} className="border border-gray-300 rounded-lg px-2.5 py-1 text-gray-600 hover:bg-gray-50">
            Próxima →
          </Link>
        </div>
      </div>

      {resumo.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">Ninguém com o ponto ligado. Marque Administrativo, Financeiro ou Recrutador para alguém em Acessos.</p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {resumo.map((r) => {
            const pct = Math.min(100, Math.round((r.semanaMin / r.cfg.cargaMin) * 100));
            const estourou = r.semanaMin >= r.cfg.cargaMin;
            return (
              <div key={r.id} className="flex items-center gap-3 flex-wrap px-3 py-2">
                <div className="w-44 min-w-0">
                  <div className="text-xs font-medium text-gray-800 truncate">{r.nome}</div>
                  <div className="text-[10px] text-gray-400">
                    {r.cfg.entrada}–{r.cfg.saida}, almoço {r.cfg.almocoInicio}–{r.cfg.almocoFim}
                  </div>
                </div>
                <div className="flex-1 min-w-40">
                  <div className="flex items-center justify-between text-[11px] text-gray-600 mb-0.5">
                    <span>
                      <strong>{formatarMin(r.semanaMin)}</strong> de {formatarMin(r.cfg.cargaMin)}
                    </span>
                    <span>{r.diasComUso} dia{r.diasComUso === 1 ? "" : "s"} com uso</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div className={`h-full ${estourou ? "bg-red-500" : pct >= 90 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                  {r.extraMin >= 1 && <span className="rounded-full border border-red-200 bg-red-50 text-red-700 font-bold px-2 py-0.5">Extra autorizada {formatarMin(r.extraMin)}</span>}
                  {r.almocoMin >= 1 && <span className="rounded-full border border-amber-200 bg-amber-50 text-amber-700 font-bold px-2 py-0.5">{formatarMin(r.almocoMin)} no almoço</span>}
                </div>
                <Link
                  href={`/configuracoes/ponto/${r.id}?de=${paraYmd(ini)}&ate=${paraYmd(domingo)}`}
                  className="text-[11px] font-semibold text-primary border border-primary/40 rounded-lg px-2.5 py-1 hover:bg-primary/5"
                >
                  Ver espelho
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {decididos.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-bold text-gray-700 mb-1.5">Últimas decisões</div>
          <div className="flex flex-col gap-1">
            {decididos.map((l) => (
              <div key={l.id} className="text-[11px] text-gray-600 flex items-center gap-2 flex-wrap">
                <span className={`font-bold rounded-full border px-2 py-0.5 text-[10px] ${l.status === "aprovada" ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                  {l.status === "aprovada" ? "Aprovada" : "Negada"}
                </span>
                <span>
                  <strong>{nomes.get(l.parceiro_id) ?? "—"}</strong>
                  {l.status === "aprovada" ? ` · ${formatarMin(l.minutos_aprovados ?? 0)} (usou ${formatarMin(l.usado_seg / 60)})` : ""}
                  {" · "}por {nomes.get(l.decidido_por ?? "") ?? "—"} em {l.decidido_em ? quando(l.decidido_em) : "—"}
                </span>
                <span className="text-gray-400 truncate max-w-xs">“{l.motivo}”</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
