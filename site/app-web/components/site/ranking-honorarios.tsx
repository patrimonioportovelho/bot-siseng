import type { LinhaRankingHonorario } from "@/lib/parceiros/ranking-honorarios";

// Pódio de até 3 corretores no dashboard externo (/login), antes do SAC —
// pedido do usuário (29/08/2026): "ranking de quem mais recebeu honorários,
// somando locação e compra e venda". Mostra só quem realmente recebeu algo
// no mês (1, 2 ou 3 cartões, nunca mais que isso), sempre centralizado —
// reseta sozinho todo dia 1º porque buscarRankingHonorariosMes já soma só o
// mês corrente.
const MEDALHA = ["🥇", "🥈", "🥉"];

function primeiroUltimoNome(nomeCompleto: string): { linha1: string; linha2: string | null } {
  const partes = nomeCompleto.trim().split(/\s+/);
  if (partes.length <= 1) return { linha1: nomeCompleto, linha2: null };
  return { linha1: partes[0], linha2: partes.slice(1).join(" ") };
}

function CartaoCorretor({ linha, posicao }: { linha: LinhaRankingHonorario; posicao: number }) {
  const { linha1, linha2 } = primeiroUltimoNome(linha.nome);
  return (
    <div className="flex flex-col items-center w-full max-w-[220px] sm:max-w-[280px]">
      <span className="text-4xl mb-2">{MEDALHA[posicao - 1]}</span>
      <div className="w-full aspect-[9/16] rounded-xl overflow-hidden border border-gray-200 bg-gray-100 shadow-sm">
        {linha.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={linha.fotoUrl} alt={linha.nome} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-gray-300">
            {linha.nome.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="w-full text-center mt-3 leading-tight break-words">
        <div className="text-base font-bold text-gray-800">{linha1}</div>
        {linha2 && <div className="text-base font-bold text-gray-800">{linha2}</div>}
      </div>
    </div>
  );
}

export function RankingHonorarios({ ranking }: { ranking: LinhaRankingHonorario[] }) {
  const top3 = ranking.slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <section id="ranking" className="mb-16">
      <div className="text-xl font-bold text-gray-800 mb-1 text-center">Ranking de honorários do mês</div>
      <p className="text-xs text-gray-500 mb-6 text-center">
        Os corretores que mais receberam honorário este mês, somando Locação e Compra e Venda.
      </p>
      <div className="flex flex-wrap justify-center gap-8 sm:gap-12">
        {top3.map((linha, i) => (
          <CartaoCorretor key={linha.parceiroId} linha={linha} posicao={i + 1} />
        ))}
      </div>
    </section>
  );
}
