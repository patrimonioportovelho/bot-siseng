import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { BotaoSubmit } from "@/components/botao-submit";
import { prisma } from "@/lib/prisma";
import { requireAdm } from "@/lib/auth";
import { adicionarPeriodoPontoAction, anularPeriodoPontoAction } from "@/lib/ponto/actions";
import { espelhoDoPeriodo } from "@/lib/ponto/relatorio";
import { CATEGORIAS_ATIVIDADE, atividadesDoPeriodo } from "@/lib/ponto/atividades";
import { obterConfigPonto } from "@/lib/ponto/servidor";
import { NOMES_DIA, formatarMin, instanteDoDia, partesLocais } from "@/lib/ponto/regras";

export const dynamic = "force-dynamic";

const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Porto_Velho" });
const dataHora = (d: Date) => d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Porto_Velho" });

function lerYmd(v: string | undefined): Date | null {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  return m ? instanteDoDia(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-2.5 py-1 bg-white outline-none focus:border-primary";

// Espelho de ponto de uma pessoa: dia a dia, com os períodos de uso, o total, o uso no almoço, fora do
// expediente e com liberação, mais ajustes manuais da diretoria (sempre com justificativa).
export default async function EspelhoPontoPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ de?: string; ate?: string; ok?: string; erro?: string; cat?: string }>;
}) {
  await requireAdm();
  const { id } = await params;
  const { de: deParam, ate: ateParam, ok, erro, cat } = await searchParams;

  const pessoa = await prisma.parceiros.findUnique({ where: { id }, select: { id: true, nome: true, funcao: true } });
  if (!pessoa) notFound();

  const hoje = new Date();
  const p = partesLocais(hoje);
  const inicioMes = instanteDoDia(p.ano, p.mes, 1);
  const de = lerYmd(deParam) ?? inicioMes;
  const ateIncl = lerYmd(ateParam) ?? new Date(instanteDoDia(p.ano, p.mes + 1, 1).getTime() - 86400000);
  const ate = new Date(Math.min(ateIncl.getTime() + 86400000, de.getTime() + 62 * 86400000)); // até ~2 meses por vez
  const deYmd = partesLocais(de).ymd;
  const ateYmd = partesLocais(new Date(ate.getTime() - 86400000)).ymd;

  const cfg = await obterConfigPonto(id);
  const [dias, liberacoes, atividades] = await Promise.all([
    espelhoDoPeriodo(id, cfg, de, ate),
    prisma.ponto_liberacoes.findMany({ where: { parceiro_id: id, solicitado_em: { gte: de, lt: ate } }, orderBy: { solicitado_em: "asc" } }),
    atividadesDoPeriodo(id, cfg, de, ate)
  ]);
  // contagem por categoria e filtro (?cat=)
  const porCategoria = new Map<string, number>();
  for (const a of atividades.itens) porCategoria.set(a.categoria, (porCategoria.get(a.categoria) ?? 0) + 1);
  const itensAtividade = cat ? atividades.itens.filter((a) => a.categoria === cat) : atividades.itens;
  const foraDoExpediente = atividades.itens.filter((a) => a.fora).length;
  const semPonto = atividades.itens.filter((a) => a.semPonto).length;
  const linkCat = (c: string | null) => `/configuracoes/ponto/${id}?de=${deYmd}&ate=${ateYmd}${c ? `&cat=${encodeURIComponent(c)}` : ""}#atividades`;

  const total = dias.reduce((acc, d) => acc + d.totalMin, 0);
  const totalAlmoco = dias.reduce((acc, d) => acc + d.almocoMin, 0);
  const totalFora = dias.reduce((acc, d) => acc + d.foraMin, 0);
  const totalExtra = dias.reduce((acc, d) => acc + d.extraMin, 0);
  const diasUteis = dias.filter((d) => d.diaSemana <= 5).length;

  const mesAnterior = instanteDoDia(p.ano, p.mes - 1, 1);
  const rotuloData = (d: string) => d.split("-").reverse().join("/");

  return (
    <div>
      <div className="print:hidden">
        <Topbar />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <Link href="/configuracoes#ponto" className="text-xs text-gray-500 hover:text-gray-800 print:hidden">
          ← Voltar para Configurações
        </Link>
        <div className="flex items-center gap-2 print:hidden">
          <BotaoImprimir />
          <a href={`/configuracoes/ponto/${id}/csv?de=${deYmd}&ate=${ateYmd}`} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-gray-600 hover:bg-gray-50">
            Baixar CSV
          </a>
        </div>
      </div>

      {ok === "1" && <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-3 print:hidden">Registro salvo.</div>}
      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-3 print:hidden">{erro}</div>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-bold text-gray-800">Espelho de ponto — {pessoa.nome}</div>
        <div className="text-[11px] text-gray-500 mb-3">
          {pessoa.funcao} · período de {rotuloData(deYmd)} a {rotuloData(ateYmd)} · expediente {cfg.entrada}–{cfg.saida}, almoço {cfg.almocoInicio}–{cfg.almocoFim}, teto semanal{" "}
          {formatarMin(cfg.cargaMin)}
        </div>

        <form className="flex items-end gap-2 flex-wrap mb-3 print:hidden" method="get">
          <label className="text-[11px] text-gray-600">
            De
            <input type="date" name="de" defaultValue={deYmd} className={`${CAMPO} block mt-0.5`} />
          </label>
          <label className="text-[11px] text-gray-600">
            Até
            <input type="date" name="ate" defaultValue={ateYmd} className={`${CAMPO} block mt-0.5`} />
          </label>
          <button type="submit" className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-gray-600 hover:bg-gray-50">
            Ver
          </button>
          <Link href={`/configuracoes/ponto/${id}?de=${partesLocais(inicioMes).ymd}&ate=${partesLocais(new Date(instanteDoDia(p.ano, p.mes + 1, 1).getTime() - 86400000)).ymd}`} className="text-[11px] text-primary underline">
            Este mês
          </Link>
          <Link href={`/configuracoes/ponto/${id}?de=${partesLocais(mesAnterior).ymd}&ate=${partesLocais(new Date(inicioMes.getTime() - 86400000)).ymd}`} className="text-[11px] text-primary underline">
            Mês anterior
          </Link>
        </form>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {[
            { r: "Total de uso", v: formatarMin(total), s: `${diasUteis} dias úteis no período` },
            { r: "Uso no almoço", v: formatarMin(totalAlmoco), s: "dentro das horas, sinalizado" },
            { r: "Uso fora do expediente", v: formatarMin(totalFora), s: "só com liberação da diretoria" },
            { r: "Hora extra autorizada", v: formatarMin(totalExtra), s: `${liberacoes.filter((l) => l.status === "aprovada").length} liberação(ões)` }
          ].map((c) => (
            <div key={c.r} className="border border-gray-200 rounded-lg px-3 py-2">
              <div className="text-[10px] text-gray-500">{c.r}</div>
              <div className="text-base font-bold text-gray-800">{c.v}</div>
              <div className="text-[10px] text-gray-400">{c.s}</div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-1.5 pr-3 font-semibold">Dia</th>
                <th className="py-1.5 pr-3 font-semibold">Períodos de uso</th>
                <th className="py-1.5 pr-3 font-semibold text-right">Total</th>
                <th className="py-1.5 pr-3 font-semibold text-right">Almoço</th>
                <th className="py-1.5 pr-3 font-semibold text-right">Fora do expediente</th>
                <th className="py-1.5 font-semibold text-right">Extra aut.</th>
              </tr>
            </thead>
            <tbody>
              {dias.map((d) => {
                const fimDeSemana = d.diaSemana > 5;
                if (fimDeSemana && d.periodos.length === 0) return null;
                return (
                  <tr key={d.ymd} className={`border-b border-gray-100 align-top ${fimDeSemana ? "bg-gray-50" : ""}`}>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-gray-700">
                      {rotuloData(d.ymd).slice(0, 5)} <span className="text-gray-400">{NOMES_DIA[d.diaSemana].slice(0, 3)}</span>
                    </td>
                    <td className="py-1.5 pr-3">
                      {d.periodos.length === 0 && <span className="text-gray-300">—</span>}
                      <div className="flex flex-col gap-0.5">
                        {d.periodos.map((s) => (
                          <div key={s.id} className={`flex items-center gap-2 flex-wrap ${s.anulada ? "line-through text-gray-400" : "text-gray-700"}`}>
                            <span>
                              {hora(s.inicio)}–{s.aberto ? "agora" : hora(s.fim)} ({formatarMin((s.fim.getTime() - s.inicio.getTime()) / 60000)})
                            </span>
                            {s.origem === "ajuste_manual" && <span className="text-[9px] font-bold rounded-full border border-blue-200 bg-blue-50 text-blue-700 px-1.5 no-underline">ajuste manual</span>}
                            {s.anulada && <span className="text-[9px] font-bold rounded-full border border-gray-300 text-gray-500 px-1.5">anulado</span>}
                            {s.justificativa && <span className="text-[10px] text-gray-400 no-underline">“{s.justificativa}”</span>}
                            {!s.anulada && !s.aberto && (
                              <details className="print:hidden">
                                <summary className="text-[10px] text-gray-400 hover:text-red-600 cursor-pointer">anular</summary>
                                <form action={anularPeriodoPontoAction} className="flex items-center gap-1 mt-1">
                                  <input type="hidden" name="id" value={s.id} />
                                  <input type="hidden" name="parceiroId" value={id} />
                                  <input type="hidden" name="de" value={deYmd} />
                                  <input type="hidden" name="ate" value={ateYmd} />
                                  <input name="justificativa" placeholder="Justificativa (obrigatória)" className={`${CAMPO} w-56`} />
                                  <BotaoSubmit carregandoTexto="..." className="text-[10px] border border-gray-300 rounded-lg px-2 py-1" variante="secundario">
                                    Anular
                                  </BotaoSubmit>
                                </form>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-1.5 pr-3 text-right font-semibold text-gray-800">{d.totalMin >= 1 ? formatarMin(d.totalMin) : "—"}</td>
                    <td className={`py-1.5 pr-3 text-right ${d.almocoMin >= 1 ? "text-amber-700 font-semibold" : "text-gray-300"}`}>{d.almocoMin >= 1 ? formatarMin(d.almocoMin) : "—"}</td>
                    <td className={`py-1.5 pr-3 text-right ${d.foraMin >= 1 ? "text-red-700 font-semibold" : "text-gray-300"}`}>{d.foraMin >= 1 ? formatarMin(d.foraMin) : "—"}</td>
                    <td className={`py-1.5 text-right ${d.extraMin >= 1 ? "text-red-700 font-semibold" : "text-gray-300"}`}>{d.extraMin >= 1 ? formatarMin(d.extraMin) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {liberacoes.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="text-sm font-bold text-gray-800 mb-2">Pedidos de liberação no período</div>
          <div className="flex flex-col gap-1.5">
            {liberacoes.map((l) => (
              <div key={l.id} className="text-xs text-gray-700 flex items-center gap-2 flex-wrap">
                <span className="text-gray-400">{dataHora(l.solicitado_em)}</span>
                <span className={`text-[10px] font-bold rounded-full border px-2 py-0.5 ${l.status === "aprovada" ? "bg-green-50 text-green-700 border-green-200" : l.status === "pendente" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                  {l.status === "aprovada" ? "Aprovada" : l.status === "pendente" ? "Pendente" : "Negada"}
                </span>
                <span>
                  pediu {formatarMin(l.minutos_solicitados)}
                  {l.status === "aprovada" ? ` · liberado ${formatarMin(l.minutos_aprovados ?? 0)}, usou ${formatarMin(l.usado_seg / 60)}` : ""}
                </span>
                <span className="text-gray-400">“{l.motivo}”</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 print:hidden">
        <div className="text-sm font-bold text-gray-800 mb-1">Lançar período manualmente</div>
        <p className="text-xs text-gray-500 mb-3">
          Para quando a pessoa esqueceu de sair ou o sistema ficou sem registrar (queda de energia, por exemplo). Fica marcado como “ajuste manual”, com a justificativa e quem lançou.
          Nenhum registro é apagado: um período errado é anulado.
        </p>
        <form action={adicionarPeriodoPontoAction} className="flex items-end gap-2 flex-wrap">
          <input type="hidden" name="parceiroId" value={id} />
          <input type="hidden" name="de" value={deYmd} />
          <input type="hidden" name="ate" value={ateYmd} />
          <label className="text-[11px] text-gray-600">
            Dia
            <input type="date" name="dia" required className={`${CAMPO} block mt-0.5`} />
          </label>
          <label className="text-[11px] text-gray-600">
            Entrada
            <input type="time" name="inicio" required className={`${CAMPO} block mt-0.5`} />
          </label>
          <label className="text-[11px] text-gray-600">
            Saída
            <input type="time" name="fim" required className={`${CAMPO} block mt-0.5`} />
          </label>
          <label className="text-[11px] text-gray-600 flex-1 min-w-56">
            Justificativa
            <input name="justificativa" required minLength={10} className={`${CAMPO} block w-full mt-0.5`} />
          </label>
          <BotaoSubmit carregandoTexto="Salvando..." className="text-xs bg-primary text-white rounded-lg px-3 py-1.5">
            Lançar
          </BotaoSubmit>
        </form>
      </div>

      {/* Relatório de atividades: o que a pessoa fez no sistema no período */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mt-4" id="atividades">
        <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
          <div className="text-sm font-bold text-gray-800">Atividades no sistema</div>
          <a
            href={`/configuracoes/ponto/${id}/csv?tipo=atividades&de=${deYmd}&ate=${ateYmd}`}
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-gray-600 hover:bg-gray-50 print:hidden"
          >
            Baixar atividades (CSV)
          </a>
        </div>
        <p className="text-[11px] text-gray-500 mb-3">
          O que {pessoa.nome.split(" ")[0]} alterou no sistema de {rotuloData(deYmd)} a {rotuloData(ateYmd)}: etiquetas e quadros movidos, cadastros editados, documentos gerados, contatos
          registrados. Só aparecem ações que mudam algo: abrir ou olhar uma tela não deixa registro. A coluna de avisos cruza cada ação com o ponto.
        </p>

        {atividades.itens.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">Nenhuma atividade registrada no período.</p>
        ) : (
          <>
            <div className="flex items-center gap-1.5 flex-wrap mb-3 print:hidden">
              <Link href={linkCat(null)} className={`text-[11px] rounded-full border px-2.5 py-1 ${!cat ? "bg-primary text-white border-primary" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                Todas ({atividades.itens.length})
              </Link>
              {CATEGORIAS_ATIVIDADE.filter((c) => porCategoria.has(c)).map((c) => (
                <Link key={c} href={linkCat(c)} className={`text-[11px] rounded-full border px-2.5 py-1 ${cat === c ? "bg-primary text-white border-primary" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                  {c} ({porCategoria.get(c)})
                </Link>
              ))}
            </div>
            {(foraDoExpediente > 0 || semPonto > 0) && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                {foraDoExpediente > 0 && <span>{foraDoExpediente} ação(ões) fora do expediente. </span>}
                {semPonto > 0 && <span>{semPonto} ação(ões) sem período de uso registrado no ponto (pode ser uma sessão não registrada ou uma ação feita por outro caminho).</span>}
              </div>
            )}
            <div className="flex flex-col divide-y divide-gray-100">
              {itensAtividade.map((a, i) => {
                const dia = a.quando.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short", timeZone: "America/Porto_Velho" });
                const anterior = i > 0 ? itensAtividade[i - 1].quando.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short", timeZone: "America/Porto_Velho" }) : null;
                return (
                  <div key={a.id}>
                    {dia !== anterior && <div className="text-[11px] font-bold text-gray-500 bg-gray-50 -mx-4 px-4 py-1 mt-2 first:mt-0">{dia}</div>}
                    <div className="flex items-start gap-2 py-1.5 text-xs">
                      <span className="text-gray-400 w-10 shrink-0">{hora(a.quando)}</span>
                      <span className="text-[10px] font-bold rounded-full border border-gray-200 bg-gray-50 text-gray-600 px-2 py-0.5 shrink-0">{a.categoria}</span>
                      <span className="flex-1 min-w-0 text-gray-800">
                        {a.href ? (
                          <Link href={a.href} className="hover:text-primary hover:underline">
                            {a.titulo}
                          </Link>
                        ) : (
                          a.titulo
                        )}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {a.fora && <span className="text-[9px] font-bold rounded-full border border-red-200 bg-red-50 text-red-700 px-1.5">fora do expediente</span>}
                        {a.almoco && <span className="text-[9px] font-bold rounded-full border border-amber-200 bg-amber-50 text-amber-700 px-1.5">almoço</span>}
                        {a.semPonto && <span className="text-[9px] font-bold rounded-full border border-gray-300 bg-white text-gray-500 px-1.5">sem ponto</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {atividades.truncado && <p className="text-[11px] text-gray-400 mt-2">Mostrando as 500 mais recentes do período. Para ver as mais antigas, reduza o período.</p>}
          </>
        )}
      </div>
    </div>
  );
}
