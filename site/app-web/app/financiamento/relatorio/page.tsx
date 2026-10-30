import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { hojeInputDate } from "@/lib/format";
import { gerarRelatorioFinanciamento } from "@/lib/financiamento/relatorio";

export const dynamic = "force-dynamic";

function somarDias(iso: string, dias: number) {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
}

function fmtDias(n: number | null) {
  if (n === null) return "—";
  if (n < 1) return "< 1 dia";
  return `${n.toFixed(1).replace(".", ",")} dias`;
}

// Relatório do Financiamento: tempo por etapa, gargalos, conformidade e
// inconformidade (por motivo e por banco) e ciclo total — a partir das
// atividades que o quadro registra a cada mudança de etapa.
export default async function RelatorioFinanciamentoPage({
  searchParams
}: {
  searchParams: Promise<{ de?: string; ate?: string; banco?: string }>;
}) {
  await requireAdminSession();
  const { de, ate, banco } = await searchParams;
  const hoje = hojeInputDate();
  const valida = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const ateIso = valida(ate) ?? hoje;
  const deIso = valida(de) ?? somarDias(ateIso, -90);

  const [r, bancos] = await Promise.all([
    gerarRelatorioFinanciamento({
      de: new Date(`${deIso}T00:00:00.000Z`),
      ate: new Date(`${ateIso}T00:00:00.000Z`),
      banco: banco || null
    }),
    prisma.bancos.findMany({ orderBy: { nome: "asc" }, select: { nome: true } })
  ]);

  const c = r.conformidade;
  const taxaPrimeira = c.analises > 0 ? Math.round((c.conformesPrimeiraAnalise / c.analises) * 100) : null;
  const estimadasTotal = r.etapas.reduce((s, e) => s + e.estimadas, 0);
  const passagensTotal = r.etapas.reduce((s, e) => s + e.passagens, 0);
  const preset = (dias: number) => `/financiamento/relatorio?de=${somarDias(hoje, -dias)}&ate=${hoje}${banco ? `&banco=${encodeURIComponent(banco)}` : ""}`;

  return (
    <div>
      <Topbar />
      <Link href="/financiamento" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Financiamento
      </Link>

      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div>
          <div className="text-sm font-bold text-gray-800">Relatório do Financiamento</div>
          <div className="text-[11px] text-gray-400">
            Tempo por etapa, gargalos, conformidade e inconformidade — de {deIso.split("-").reverse().join("/")} a{" "}
            {ateIso.split("-").reverse().join("/")}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[30, 90, 365].map((d) => (
            <Link key={d} href={preset(d)} className="text-xs rounded-lg px-3 py-1.5 border bg-white border-gray-300 text-gray-600">
              {d === 365 ? "1 ano" : `${d} dias`}
            </Link>
          ))}
        </div>
      </div>

      <form className="bg-white border border-gray-200 rounded-xl p-3 mb-4 flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">De</label>
          <input type="date" name="de" defaultValue={deIso} className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Até</label>
          <input type="date" name="ate" defaultValue={ateIso} className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Banco</label>
          <select name="banco" defaultValue={banco ?? ""} className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="">Todos</option>
            {bancos.map((b) => (
              <option key={b.nome}>{b.nome}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold">
          Aplicar
        </button>
      </form>

      {estimadasTotal > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-lg px-3 py-2 mb-4">
          {estimadasTotal} de {passagensTotal} etapas deste relatório são anteriores ao quadro e têm o início estimado pelas datas cadastradas.
          A medição exata começa a partir do uso do quadro.
        </div>
      )}

      {/* Resumo de conformidade */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <Cartao rotulo="Conformes" valor={String(c.conformes)} />
        <Cartao rotulo="Inconformidades" valor={String(c.inconformidades)} destaque={c.inconformidades > 0 ? "vermelho" : undefined} />
        <Cartao rotulo="Em aberto agora" valor={String(c.abertas)} destaque={c.abertas > 0 ? "vermelho" : undefined} />
        <Cartao rotulo="Conforme na 1ª análise" valor={taxaPrimeira !== null ? `${taxaPrimeira}%` : "—"} />
        <Cartao rotulo="Tempo médio p/ resolver" valor={fmtDias(c.mediaResolucaoDias)} />
      </div>

      {/* Tempo por etapa */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 overflow-x-auto">
        <div className="text-sm font-bold text-gray-800 mb-3">Tempo por etapa</div>
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-normal py-1.5 border-b border-gray-100">Etapa / status</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Encerradas</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Tempo médio</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Máximo</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Meta</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Acima da meta</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Abertas agora</th>
            </tr>
          </thead>
          <tbody>
            {r.etapas.map((e) => (
              <tr key={e.etapa}>
                <td className="py-1.5 border-b border-gray-50 text-gray-800 font-medium">{e.etapa}</td>
                <td className="py-1.5 border-b border-gray-50 text-right text-gray-600">
                  {e.passagens}
                  {e.estimadas > 0 && <span className="text-[10px] text-gray-400"> ({e.estimadas} est.)</span>}
                </td>
                <td className="py-1.5 border-b border-gray-50 text-right font-semibold text-gray-800">{fmtDias(e.mediaDias)}</td>
                <td className="py-1.5 border-b border-gray-50 text-right text-gray-600">{fmtDias(e.maxDias)}</td>
                <td className="py-1.5 border-b border-gray-50 text-right text-gray-500">{e.metaDias ? `${e.metaDias} d` : "—"}</td>
                <td className={`py-1.5 border-b border-gray-50 text-right ${e.acimaDaMeta > 0 ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                  {e.acimaDaMeta}
                </td>
                <td className="py-1.5 border-b border-gray-50 text-right text-gray-600">
                  {e.abertasAgora}
                  {e.abertasAcimaDaMeta > 0 && <span className="text-red-600 text-[10px]"> ({e.abertasAcimaDaMeta} acima)</span>}
                </td>
              </tr>
            ))}
            {r.etapas.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-gray-400">
                  Nenhuma etapa registrada no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {/* Gargalos */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-1">Gargalos agora</div>
          <div className="text-[11px] text-gray-400 mb-3">Cards abertos acima da meta de tempo da etapa.</div>
          {r.gargalos.length === 0 ? (
            <div className="text-[11px] text-gray-400">Nenhum card acima da meta.</div>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {r.gargalos.map((g) => (
                <Link key={g.avaliacaoId} href={`/financiamento/${g.avaliacaoId}/etiqueta`} className="py-1.5 text-xs flex items-center justify-between gap-2 hover:bg-gray-50">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-800">{g.cliente}</span>
                    <span className="text-gray-400"> · {g.etapa}</span>
                    {g.banco && <span className="text-gray-400"> · {g.banco}</span>}
                  </span>
                  <span className="text-red-600 font-semibold shrink-0">
                    {g.dias}d / {g.metaDias}d{g.estimado ? "*" : ""}
                  </span>
                </Link>
              ))}
            </div>
          )}
          <div className="text-[10px] text-gray-400 mt-2">* início estimado pelas datas cadastradas.</div>
        </div>

        {/* Ciclo total */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-1">Ciclo do andamento (início → conclusão)</div>
          <div className="text-[11px] text-gray-400 mb-3">Andamentos concluídos no período, por tipo de contrato.</div>
          {r.ciclo.length === 0 ? (
            <div className="text-[11px] text-gray-400">Nenhum andamento concluído no período.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {r.ciclo.map((x) => (
                <div key={x.tipoContrato} className="flex items-center justify-between text-xs border-b border-gray-50 pb-1.5">
                  <span className="text-gray-700">
                    {x.tipoContrato} <span className="text-gray-400">({x.total})</span>
                  </span>
                  <span className="font-bold text-gray-800">{fmtDias(x.mediaDias)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="text-sm font-bold text-gray-800 mt-5 mb-2">Mensagens e contatos registrados</div>
          <div className="text-xs text-gray-600">
            <strong className="text-gray-800">{r.contatos.total}</strong> no período
            {r.contatos.porResponsavel.length > 0 && (
              <span className="text-gray-400"> — {r.contatos.porResponsavel.map((p) => `${p.nome.split(" ")[0]}: ${p.total}`).join(" · ")}</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Inconformidades por motivo</div>
          {c.porMotivo.length === 0 ? (
            <div className="text-[11px] text-gray-400">Nenhuma inconformidade no período.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="font-normal py-1 border-b border-gray-100">Motivo</th>
                  <th className="font-normal py-1 border-b border-gray-100 text-right">Total</th>
                  <th className="font-normal py-1 border-b border-gray-100 text-right">Abertas</th>
                  <th className="font-normal py-1 border-b border-gray-100 text-right">Resolução</th>
                </tr>
              </thead>
              <tbody>
                {c.porMotivo.map((m) => (
                  <tr key={m.motivo}>
                    <td className="py-1 border-b border-gray-50 text-gray-700">{m.motivo}</td>
                    <td className="py-1 border-b border-gray-50 text-right font-semibold text-gray-800">{m.total}</td>
                    <td className="py-1 border-b border-gray-50 text-right text-gray-500">{m.abertas}</td>
                    <td className="py-1 border-b border-gray-50 text-right text-gray-500">{fmtDias(m.mediaResolucaoDias)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Conformidade por banco</div>
          {c.porBanco.length === 0 ? (
            <div className="text-[11px] text-gray-400">Nenhuma análise de conformidade no período.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="font-normal py-1 border-b border-gray-100">Banco</th>
                  <th className="font-normal py-1 border-b border-gray-100 text-right">Conformes</th>
                  <th className="font-normal py-1 border-b border-gray-100 text-right">Inconformidades</th>
                </tr>
              </thead>
              <tbody>
                {c.porBanco.map((b) => (
                  <tr key={b.banco}>
                    <td className="py-1 border-b border-gray-50 text-gray-700">{b.banco}</td>
                    <td className="py-1 border-b border-gray-50 text-right text-green-700">{b.conformes}</td>
                    <td className="py-1 border-b border-gray-50 text-right text-red-600">{b.inconformidades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Cartao({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: "vermelho" }) {
  return (
    <div className={`border rounded-lg px-3 py-2 ${destaque === "vermelho" ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-gray-200 text-gray-800"}`}>
      <div className="text-[10px] opacity-70 leading-tight">{rotulo}</div>
      <div className="text-base font-bold">{valor}</div>
    </div>
  );
}
