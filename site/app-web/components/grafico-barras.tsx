// Gráfico de barras simples (SVG/CSS puro, sem dependência nova) — usado no
// bloco Financeiro do dashboard pra mostrar Recebido x Pago mês a mês.
// Server-safe: não usa hooks nem estado, só recebe os dados já prontos.
type Serie = { chave: string; cor: string; nome: string };
type Ponto = { label: string } & Record<string, number | string>;

export function GraficoBarras({
  dados,
  series,
  formatarValor
}: {
  dados: Ponto[];
  series: Serie[];
  formatarValor: (v: number) => string;
}) {
  if (dados.length === 0) {
    return <p className="text-xs text-gray-400">Sem movimentações pagas no período.</p>;
  }

  const maior = Math.max(1, ...dados.flatMap((d) => series.map((s) => Number(d[s.chave]) || 0)));

  return (
    <div>
      <div className="flex items-end gap-2 md:gap-3 h-36 overflow-x-auto pb-1">
        {dados.map((d) => (
          <div key={d.label} className="flex-1 min-w-[36px] flex flex-col items-center gap-1">
            <div className="flex items-end gap-1 h-28 w-full justify-center">
              {series.map((s) => {
                const valor = Number(d[s.chave]) || 0;
                const alturaPct = (valor / maior) * 100;
                return (
                  <div
                    key={s.chave}
                    title={`${s.nome} em ${d.label}: ${formatarValor(valor)}`}
                    className="w-3 rounded-t transition-all"
                    style={{ height: `${valor > 0 ? Math.max(3, alturaPct) : 0}%`, backgroundColor: s.cor }}
                  />
                );
              })}
            </div>
            <span className="text-[10px] text-gray-400 whitespace-nowrap">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-3 justify-center flex-wrap">
        {series.map((s) => (
          <div key={s.chave} className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: s.cor }} />
            {s.nome}
          </div>
        ))}
      </div>
    </div>
  );
}
