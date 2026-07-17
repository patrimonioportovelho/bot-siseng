// Gráfico de pizza (donut) simples em SVG puro — sem dependência nova. Usa o
// truque de stroke-dasharray/dashoffset em cima de um círculo (sem precisar
// calcular arcos de path manualmente). Server-safe.
const CORES_PADRAO = ["#33587F", "#A9822E", "#3C7A57", "#B14226", "#6B4E9C", "#1f7a4d", "#8a8a8a", "#c2703d"];

export function GraficoPizza({
  dados,
  formatarValor,
  mensagemVazia = "Sem despesas pagas no período."
}: {
  dados: { label: string; valor: number }[];
  formatarValor: (v: number) => string;
  mensagemVazia?: string;
}) {
  const total = dados.reduce((acc, d) => acc + d.valor, 0);

  if (total <= 0) {
    return <p className="text-xs text-gray-400">{mensagemVazia}</p>;
  }

  const raio = 15.9155;
  const circunferencia = 2 * Math.PI * raio;
  let acumuladoPct = 0;

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg viewBox="0 0 42 42" className="w-32 h-32 shrink-0 -rotate-90">
        <circle cx="21" cy="21" r={raio} fill="transparent" stroke="#f1f1f1" strokeWidth="6" />
        {dados.map((d, i) => {
          const pct = (d.valor / total) * 100;
          const dash = (pct / 100) * circunferencia;
          const offset = -((acumuladoPct / 100) * circunferencia);
          acumuladoPct += pct;
          return (
            <circle
              key={d.label}
              cx="21"
              cy="21"
              r={raio}
              fill="transparent"
              stroke={CORES_PADRAO[i % CORES_PADRAO.length]}
              strokeWidth="6"
              strokeDasharray={`${dash} ${circunferencia - dash}`}
              strokeDashoffset={offset}
            >
              <title>{`${d.label}: ${formatarValor(d.valor)} (${pct.toFixed(0)}%)`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="flex flex-col gap-1.5 min-w-0">
        {dados.map((d, i) => (
          <div key={d.label} className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
              style={{ backgroundColor: CORES_PADRAO[i % CORES_PADRAO.length] }}
            />
            <span className="truncate max-w-[160px]">{d.label}</span>
            <span className="text-gray-400 whitespace-nowrap">
              {formatarValor(d.valor)} ({((d.valor / total) * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
