import { buscarMercado, type Indicador } from "@/lib/mercado";

const COR_TENDENCIA: Record<NonNullable<Indicador["tendencia"]>, string> = {
  alta: "text-emerald-300",
  baixa: "text-red-300",
  estavel: "text-white/60"
};
const SETA: Record<NonNullable<Indicador["tendencia"]>, string> = { alta: "▲", baixa: "▼", estavel: "■" };

// Faixa de indicadores no cabeçalho do portal: dólar, euro, Selic, inflação e Ibovespa. Server component: busca com
// cache (ver lib/mercado.ts) e, se nenhuma fonte responder, simplesmente não aparece (não quebra o cabeçalho).
export async function PortalIndicadores() {
  const { itens, atualizadoEm } = await buscarMercado();
  if (itens.length === 0) return null;

  const quando = atualizadoEm
    ? atualizadoEm.toLocaleString("pt-BR", { timeZone: "America/Porto_Velho", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="border-t border-white/10 bg-black/15">
      <div className="px-4 md:px-6 py-2 flex items-stretch gap-2 overflow-x-auto">
        {itens.map((i) => (
          <div key={i.id} className="shrink-0 rounded-lg bg-white/5 border border-white/10 px-2.5 md:px-3 py-1.5 min-w-[104px] md:min-w-[118px]" title={i.detalhe ?? undefined}>
            <div className="text-[10px] uppercase tracking-wide text-white/55 leading-none">{i.rotulo}</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[13px] font-bold text-white leading-none whitespace-nowrap">{i.valor}</span>
              {i.variacao && i.tendencia && (
                <span className={`text-[10px] font-semibold whitespace-nowrap ${COR_TENDENCIA[i.tendencia]}`}>
                  {SETA[i.tendencia]} {i.variacao}
                </span>
              )}
            </div>
            {i.detalhe && <div className="text-[9px] text-white/45 mt-0.5 whitespace-nowrap">{i.detalhe}</div>}
          </div>
        ))}
        {/* celular: só a hora; telas maiores: hora e fontes */}
        <div className="md:hidden shrink-0 self-center pl-1 text-[9px] leading-snug text-white/40 whitespace-nowrap">
          Atualização<br />automática{quando && <><br />{quando}</>}
        </div>
        <div className="hidden md:block shrink-0 ml-auto self-center pl-2 text-[9px] leading-snug text-white/40 text-right whitespace-nowrap">
          Atualização automática
          {quando && <> · {quando}</>}
          <br />
          Fontes: Banco Central, AwesomeAPI, Yahoo Finance
        </div>
      </div>
    </div>
  );
}

// Reserva a altura da faixa enquanto as cotações carregam (o cabeçalho não "pula").
export function PortalIndicadoresCarregando() {
  return (
    <div className="border-t border-white/10 bg-black/15">
      <div className="px-4 md:px-6 py-2 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, n) => (
          <div key={n} className="shrink-0 rounded-lg bg-white/5 border border-white/10 min-w-[118px] h-[46px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
