import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { requireAdminSession } from "@/lib/auth";
import { hojeInputDate } from "@/lib/format";
import { calcularIndicadoresRecrutamento, resolverPeriodoRecrutamento } from "@/lib/recrutamento/indicadores";
import { CANAIS, META_CANAL_MES, METAS_MES, PRAZO_ACOLHIDA_DIAS } from "@/lib/recrutamento/opcoes";

export const dynamic = "force-dynamic";

// Painel do recrutamento (mês) e relatório semanal de sexta: funil, reuniões,
// recrutados, acolhidos, prazo, motivos. Metas = ponto de partida do processo;
// a partir do 2º mês vale ajustar com as taxas reais.
export default async function IndicadoresRecrutamentoPage({
  searchParams
}: {
  searchParams: Promise<{ p?: string; ref?: string }>;
}) {
  await requireAdminSession();
  const { p, ref } = await searchParams;
  const tipo = p === "semana" ? "semana" : "mes";
  const referencia = ref && /^\d{4}-\d{2}-\d{2}$/.test(ref) ? ref : hojeInputDate();
  const periodo = resolverPeriodoRecrutamento(tipo, referencia);
  const ind = await calcularIndicadoresRecrutamento(periodo.inicio, periodo.fim);

  const fator = tipo === "mes" ? 1 : 0.25;
  const meta = (mes: number) => Math.max(1, Math.ceil(mes * fator));

  const linhas: { rotulo: string; definicao: string; realizado: number; meta: number }[] = [
    { rotulo: "Prospectados", definicao: "Pessoas abordadas pela 1ª vez, de qualquer canal", realizado: ind.prospectados, meta: meta(METAS_MES.prospectados) },
    { rotulo: "1ªs reuniões agendadas", definicao: "Entrevistas marcadas", realizado: ind.reunioes1Agendadas, meta: meta(METAS_MES.reunioes1Agendadas) },
    { rotulo: "1ªs reuniões realizadas", definicao: "Entrevistas que aconteceram", realizado: ind.reunioes1Realizadas, meta: meta(METAS_MES.reunioes1Realizadas) },
    { rotulo: "Entrevistas positivas", definicao: "1ªs reuniões aprovadas para a 2ª reunião", realizado: ind.positivas, meta: meta(METAS_MES.positivas) },
    { rotulo: "2ªs reuniões realizadas", definicao: "Apresentações do modelo de negócio", realizado: ind.reunioes2Realizadas, meta: meta(METAS_MES.reunioes2Realizadas) },
    { rotulo: "Recrutados", definicao: "Contrato de associação assinado", realizado: ind.recrutados, meta: meta(METAS_MES.recrutados) },
    { rotulo: "Acolhidos", definicao: "Corretores acolhidos com acessos liberados", realizado: ind.acolhidos, meta: meta(METAS_MES.acolhidos) }
  ];

  const taxaComparecimento = ind.comparecimento !== null ? Math.round(ind.comparecimento * 100) : null;
  const trilhaPct = ind.trilha.total > 0 ? Math.round((ind.trilha.completos / ind.trilha.total) * 100) : null;
  const motivoPct =
    ind.faltasDesistencias.total > 0 ? Math.round((ind.faltasDesistencias.comMotivo / ind.faltasDesistencias.total) * 100) : null;
  const motivosOrdenados = Object.entries(ind.motivos).sort((a, b) => b[1] - a[1]);

  const link = (t: "semana" | "mes", r: string) => `/recrutamento/indicadores?p=${t}&ref=${r}`;

  return (
    <div>
      <Topbar />
      <Link href="/recrutamento" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Recrutamento
      </Link>

      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div>
          <div className="text-sm font-bold text-gray-800">Indicadores do recrutamento</div>
          <div className="text-[11px] text-gray-400 capitalize">{periodo.rotulo}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={link("semana", hojeInputDate())} className={`text-xs rounded-lg px-3 py-1.5 border ${tipo === "semana" ? "bg-primary text-white border-primary" : "bg-white border-gray-300 text-gray-600"}`}>
            Semana
          </Link>
          <Link href={link("mes", hojeInputDate())} className={`text-xs rounded-lg px-3 py-1.5 border ${tipo === "mes" ? "bg-primary text-white border-primary" : "bg-white border-gray-300 text-gray-600"}`}>
            Mês
          </Link>
          <Link href={link(tipo, periodo.anterior)} className="text-xs rounded-lg px-3 py-1.5 border bg-white border-gray-300 text-gray-600">
            ← Anterior
          </Link>
          <Link href={link(tipo, periodo.proximo)} className="text-xs rounded-lg px-3 py-1.5 border bg-white border-gray-300 text-gray-600">
            Próximo →
          </Link>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 overflow-x-auto">
        <table className="w-full text-xs min-w-[560px]">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-normal py-1.5 border-b border-gray-100">Indicador</th>
              <th className="font-normal py-1.5 border-b border-gray-100 hidden md:table-cell">Definição</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Realizado</th>
              <th className="font-normal py-1.5 border-b border-gray-100 text-right">Meta</th>
              <th className="font-normal py-1.5 border-b border-gray-100 w-40">Andamento</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const pct = l.meta > 0 ? Math.round((l.realizado / l.meta) * 100) : 0;
              const cor = pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-amber-400" : "bg-red-400";
              return (
                <tr key={l.rotulo}>
                  <td className="py-2 border-b border-gray-50 font-medium text-gray-800">{l.rotulo}</td>
                  <td className="py-2 border-b border-gray-50 text-gray-500 hidden md:table-cell">{l.definicao}</td>
                  <td className="py-2 border-b border-gray-50 text-right font-bold text-gray-800">{l.realizado}</td>
                  <td className="py-2 border-b border-gray-50 text-right text-gray-500">{l.meta}</td>
                  <td className="py-2 border-b border-gray-50">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{pct}%</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Taxas e prazos</div>
          <div className="flex flex-col gap-2 text-xs">
            <Linha
              rotulo="Taxa de comparecimento (1ªs realizadas ÷ agendadas)"
              valor={taxaComparecimento !== null ? `${taxaComparecimento}%` : "—"}
              meta={`meta ${Math.round(METAS_MES.comparecimento * 100)}%`}
              ok={taxaComparecimento !== null ? taxaComparecimento >= METAS_MES.comparecimento * 100 : null}
            />
            <Linha
              rotulo="Conclusão da trilha (100% de presença)"
              valor={trilhaPct !== null ? `${trilhaPct}% (${ind.trilha.completos} de ${ind.trilha.total})` : "—"}
              meta="meta 100%"
              ok={trilhaPct !== null ? trilhaPct === 100 : null}
            />
            <Linha
              rotulo="Prazo até a acolhida (dias desde o início da turma)"
              valor={ind.prazoMedioAcolhida !== null ? `média ${ind.prazoMedioAcolhida} · máx. ${ind.prazoMaximoAcolhida}` : "—"}
              meta={`até ${PRAZO_ACOLHIDA_DIAS} dias`}
              ok={ind.prazoMaximoAcolhida !== null ? ind.prazoMaximoAcolhida <= PRAZO_ACOLHIDA_DIAS : null}
            />
            <Linha
              rotulo="Faltas e desistências com motivo registrado"
              valor={motivoPct !== null ? `${motivoPct}% (${ind.faltasDesistencias.comMotivo} de ${ind.faltasDesistencias.total})` : "—"}
              meta="meta 100%"
              ok={motivoPct !== null ? motivoPct === 100 : null}
            />
            <Linha rotulo="Custo por lead (tráfego pago)" valor="—" meta="definir com o gestor de tráfego" ok={null} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Prospectados por canal</div>
          <div className="flex flex-col gap-2.5">
            {CANAIS.map((c) => {
              const real = ind.prospectadosPorCanal[c] ?? 0;
              const m = meta(META_CANAL_MES[c]);
              const pct = m > 0 ? Math.round((real / m) * 100) : 0;
              return (
                <div key={c}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-700">{c}</span>
                    <span className="text-gray-500">
                      <strong className="text-gray-800">{real}</strong> / {m}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
            {(ind.prospectadosPorCanal["Não informado"] ?? 0) > 0 && (
              <div className="text-[11px] text-gray-400">Sem canal informado: {ind.prospectadosPorCanal["Não informado"]}</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Motivos de falta e desistência</div>
        <div className="text-[11px] text-gray-400 mb-3">Revisados todo mês para ajustar a atração e a 1ª reunião.</div>
        {motivosOrdenados.length === 0 ? (
          <div className="text-[11px] text-gray-400">Nenhum motivo registrado no período.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {motivosOrdenados.map(([motivo, n]) => (
              <div key={motivo} className="flex items-center justify-between text-xs border-b border-gray-50 pb-1">
                <span className="text-gray-700">{motivo}</span>
                <span className="font-bold text-gray-800">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, meta, ok }: { rotulo: string; valor: string; meta: string; ok: boolean | null }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-50 pb-1.5">
      <span className="text-gray-600">{rotulo}</span>
      <span className="text-right shrink-0">
        <span className={`font-bold ${ok === null ? "text-gray-800" : ok ? "text-green-700" : "text-red-600"}`}>{valor}</span>
        <span className="block text-[10px] text-gray-400">{meta}</span>
      </span>
    </div>
  );
}
