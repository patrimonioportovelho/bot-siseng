import type { SituacaoRankingCorretor } from "@/lib/parceiros/ranking-honorarios";

// Mensagem motivacional do ranking de honorários no painel do corretor —
// pedido do usuário (29/08/2026: "algo intuitivo para rankear eles"), mesmo
// tom/visual de components/portal-metas-painel.tsx (emoji + selo colorido).
// Só aparece pra função Corretor (ver app/portal/page.tsx) — Corretor
// Estagiário não entra no ranking.
const VISUAL: Record<string, { emoji: string; corFundo: string; corBorda: string; corTexto: string }> = {
  "1": { emoji: "🥇", corFundo: "bg-amber-50", corBorda: "border-amber-200", corTexto: "text-amber-700" },
  "2": { emoji: "🥈", corFundo: "bg-gray-100", corBorda: "border-gray-300", corTexto: "text-gray-700" },
  "3": { emoji: "🥉", corFundo: "bg-orange-50", corBorda: "border-orange-200", corTexto: "text-orange-700" },
  resto: { emoji: "🎉", corFundo: "bg-primary/5", corBorda: "border-primary/30", corTexto: "text-primary" },
  sem_valor: { emoji: "🎯", corFundo: "bg-gray-50", corBorda: "border-gray-200", corTexto: "text-gray-600" }
};

export function PortalRankingHonorarioBanner({ situacao }: { situacao: SituacaoRankingCorretor }) {
  const chave = situacao.status === "sem_valor" ? "sem_valor" : situacao.posicao <= 3 ? String(situacao.posicao) : "resto";
  const visual = VISUAL[chave];

  return (
    <div className={`rounded-xl border px-4 py-3 mb-4 flex items-center gap-3 ${visual.corFundo} ${visual.corBorda}`}>
      <span className="text-xl shrink-0">{visual.emoji}</span>
      <p className={`text-xs font-semibold ${visual.corTexto}`}>{situacao.mensagem}</p>
    </div>
  );
}
