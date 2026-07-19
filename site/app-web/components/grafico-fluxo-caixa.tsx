"use client";

import { useMemo, useState } from "react";
import { formatMoeda } from "@/lib/format";

export type DiaFluxoCaixa = {
  dataIso: string;
  label: string;
  entradas: number;
  saidas: number;
  saldoAcumulado: number;
  anterior: number | null;
};

const COR_ENTRADA = "#3C7A57";
const COR_SAIDA = "#B14226";
const COR_SALDO = "#04075c";

// Gráfico principal do dashboard: Entradas x Saídas dia a dia, só o dinheiro
// de fato movimentado (Financeiro pago) vinculado a Compra e Venda ou
// Locação (Administração entra por tabela quando vira Locação com gestão) —
// pedido explícito do usuário, no lugar do gráfico mensal que já existia lá
// embaixo em Financeiro. SVG + estado local (sem lib de gráfico nova),
// seguindo o mesmo espírito de components/grafico-barras.tsx, só que
// interativo: passa o mouse em cima de um dia e vê os valores exatos.
export function GraficoFluxoCaixa({
  dados,
  mostrarComparativoAnterior
}: {
  dados: DiaFluxoCaixa[];
  mostrarComparativoAnterior: boolean;
}) {
  const [modo, setModo] = useState<"diario" | "acumulado">("diario");
  const [hover, setHover] = useState<number | null>(null);

  const { maiorEntrada, maiorSaida, diaMaisMovimentado } = useMemo(() => {
    let maiorEntrada = dados[0] ?? null;
    let maiorSaida = dados[0] ?? null;
    let diaMaisMovimentado = dados[0] ?? null;
    for (const d of dados) {
      if (d.entradas > (maiorEntrada?.entradas ?? -1)) maiorEntrada = d;
      if (d.saidas > (maiorSaida?.saidas ?? -1)) maiorSaida = d;
      if (d.entradas + d.saidas > (diaMaisMovimentado ? diaMaisMovimentado.entradas + diaMaisMovimentado.saidas : -1))
        diaMaisMovimentado = d;
    }
    return { maiorEntrada, maiorSaida, diaMaisMovimentado };
  }, [dados]);

  // Barras diárias (modo "Diário") ou acumuladas (modo "Acumulado") — o
  // toggle não muda a linha de Saldo acumulado, só o que as barras mostram.
  const barras = useMemo(() => {
    if (modo === "diario") return dados.map((d) => ({ entradas: d.entradas, saidas: d.saidas }));
    let entradasAc = 0;
    let saidasAc = 0;
    return dados.map((d) => {
      entradasAc += d.entradas;
      saidasAc += d.saidas;
      return { entradas: entradasAc, saidas: saidasAc };
    });
  }, [dados, modo]);

  const temMovimento = dados.some((d) => d.entradas > 0 || d.saidas > 0);

  if (dados.length === 0 || !temMovimento) {
    return (
      <p className="text-xs text-gray-400">
        Sem movimentações pagas de Compra e Venda ou Locação nesse período.
      </p>
    );
  }

  const maiorBarra = Math.max(1, ...barras.flatMap((b) => [b.entradas, b.saidas]));
  const valoresSaldo = dados.flatMap((d) => (d.anterior !== null ? [d.saldoAcumulado, d.anterior] : [d.saldoAcumulado]));
  const minSaldo = Math.min(0, ...valoresSaldo);
  const maxSaldo = Math.max(0, ...valoresSaldo);
  const faixaSaldo = maxSaldo - minSaldo || 1;

  const LARGURA = 1000;
  const ALTURA = 260;
  const MARGEM_TOPO = 10;
  const MARGEM_BASE = 24;
  const alturaUtil = ALTURA - MARGEM_TOPO - MARGEM_BASE;
  const n = dados.length;
  const colWidth = LARGURA / n;

  function xCentro(i: number) {
    return colWidth * i + colWidth / 2;
  }
  function yBarra(v: number) {
    return ALTURA - MARGEM_BASE - (v / maiorBarra) * alturaUtil;
  }
  function yLinha(v: number) {
    return ALTURA - MARGEM_BASE - ((v - minSaldo) / faixaSaldo) * alturaUtil;
  }

  const pontosLinha = dados.map((d, i) => `${xCentro(i)},${yLinha(d.saldoAcumulado)}`).join(" ");
  const pontosAnterior = mostrarComparativoAnterior
    ? dados
        .map((d, i) => (d.anterior !== null ? `${xCentro(i)},${yLinha(d.anterior)}` : null))
        .filter((p): p is string => p !== null)
        .join(" ")
    : "";

  const larguraBarra = Math.max(2, colWidth * 0.32);
  const d = hover !== null ? dados[hover] : null;

  // Marcações de dia no eixo X: a cada 2 dias se couber tudo, senão a cada 5 —
  // pra não empilhar número em cima de número num mês de 31 dias.
  const passoLabel = n <= 15 ? 1 : n <= 60 ? 2 : Math.ceil(n / 30) * 5;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-sm font-bold text-gray-800">Evolução do período</div>
          <p className="text-[11px] text-gray-400">
            Entradas, saídas e saldo dia a dia — Compra e Venda, Locação e Administração (via locação com gestão).
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
          <button
            type="button"
            onClick={() => setModo("diario")}
            className={`px-3 py-1.5 ${modo === "diario" ? "bg-primary text-white" : "bg-white text-gray-500"}`}
          >
            Diário
          </button>
          <button
            type="button"
            onClick={() => setModo("acumulado")}
            className={`px-3 py-1.5 ${modo === "acumulado" ? "bg-primary text-white" : "bg-white text-gray-500"}`}
          >
            Acumulado
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
          <div className="text-[11px] text-gray-500">Maior entrada</div>
          <div className="text-base font-bold mt-0.5 text-[#3C7A57]">{formatMoeda(maiorEntrada?.entradas ?? 0)}</div>
          <div className="text-[11px] text-gray-400">Dia {maiorEntrada?.label ?? "—"}</div>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
          <div className="text-[11px] text-gray-500">Maior saída</div>
          <div className="text-base font-bold mt-0.5 text-[#B14226]">{formatMoeda(maiorSaida?.saidas ?? 0)}</div>
          <div className="text-[11px] text-gray-400">Dia {maiorSaida?.label ?? "—"}</div>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
          <div className="text-[11px] text-gray-500">Dia mais movimentado</div>
          <div className="text-base font-bold mt-0.5 text-primary">
            {formatMoeda((diaMaisMovimentado?.entradas ?? 0) + (diaMaisMovimentado?.saidas ?? 0))}
          </div>
          <div className="text-[11px] text-gray-400">Dia {diaMaisMovimentado?.label ?? "—"}</div>
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="w-full h-64" preserveAspectRatio="none">
          <line x1={0} y1={yBarra(0)} x2={LARGURA} y2={yBarra(0)} stroke="#e5e7eb" strokeWidth={1} />

          {dados.map((day, i) => {
            const b = barras[i];
            return (
              <g key={day.dataIso}>
                <rect
                  x={xCentro(i) - larguraBarra - 1}
                  y={Math.min(yBarra(0), yBarra(b.entradas))}
                  width={larguraBarra}
                  height={Math.max(0, Math.abs(yBarra(0) - yBarra(b.entradas)))}
                  fill={COR_ENTRADA}
                  opacity={hover === null || hover === i ? 1 : 0.35}
                />
                <rect
                  x={xCentro(i) + 1}
                  y={Math.min(yBarra(0), yBarra(b.saidas))}
                  width={larguraBarra}
                  height={Math.max(0, Math.abs(yBarra(0) - yBarra(b.saidas)))}
                  fill={COR_SAIDA}
                  opacity={hover === null || hover === i ? 1 : 0.35}
                />
              </g>
            );
          })}

          {mostrarComparativoAnterior && pontosAnterior && (
            <polyline points={pontosAnterior} fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 3" />
          )}
          <polyline points={pontosLinha} fill="none" stroke={COR_SALDO} strokeWidth={2} />

          {hover !== null && (
            <line x1={xCentro(hover)} y1={0} x2={xCentro(hover)} y2={ALTURA - MARGEM_BASE} stroke="#9ca3af" strokeWidth={1} strokeDasharray="3 3" />
          )}

          {dados.map((day, i) => (
            <rect
              key={day.dataIso}
              x={colWidth * i}
              y={0}
              width={colWidth}
              height={ALTURA}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
          ))}

          {dados.map((day, i) =>
            i % passoLabel === 0 ? (
              <text key={day.dataIso} x={xCentro(i)} y={ALTURA - 6} textAnchor="middle" fontSize={10} fill="#9ca3af">
                {day.label}
              </text>
            ) : null
          )}
        </svg>

        {d && (
          <div
            className="absolute top-1 bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs z-10 pointer-events-none"
            style={{
              left: `${Math.min(78, Math.max(2, (xCentro(hover!) / LARGURA) * 100))}%`
            }}
          >
            <div className="font-bold text-gray-800 mb-1">Dia {d.label}</div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Entradas</span>
              <span className="font-semibold text-[#3C7A57]">{formatMoeda(d.entradas)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Saídas</span>
              <span className="font-semibold text-[#B14226]">{formatMoeda(d.saidas)}</span>
            </div>
            <div className="border-t border-gray-100 mt-1.5 pt-1.5 flex justify-between gap-4">
              <span className="text-gray-500">Saldo do dia</span>
              <span className={`font-semibold ${d.entradas - d.saidas >= 0 ? "text-[#3C7A57]" : "text-[#B14226]"}`}>
                {formatMoeda(d.entradas - d.saidas)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Saldo acumulado</span>
              <span className="font-semibold text-primary">{formatMoeda(d.saldoAcumulado)}</span>
            </div>
            {d.anterior !== null && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Mês anterior</span>
                <span className="font-semibold text-gray-500">{formatMoeda(d.anterior)}</span>
              </div>
            )}
            <a href={`/financeiro?pago=todas&pag_de=${d.dataIso}&pag_ate=${d.dataIso}`} className="text-[10px] text-primary underline block mt-1.5 pointer-events-auto">
              Ver esse dia no Financeiro →
            </a>
          </div>
        )}
      </div>

      <div className="flex gap-4 mt-2 justify-center flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: COR_ENTRADA }} />
          Entradas
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: COR_SAIDA }} />
          Saídas
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: COR_SALDO }} />
          Saldo acumulado
        </div>
        {mostrarComparativoAnterior && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span
              className="w-4 h-0.5 inline-block"
              style={{ backgroundImage: "repeating-linear-gradient(90deg, #9ca3af 0 4px, transparent 4px 7px)" }}
            />
            Mês anterior
          </div>
        )}
      </div>
    </div>
  );
}
