import type { AvaliacaoMeta, ClassificacaoMeta, SituacaoMeta } from "@/lib/metas/calculo";
import { tipoMetaOpcao } from "@/lib/metas/opcoes";

type MetaComProgresso = {
  meta: {
    id: string;
    tipo_meta: string;
    parceiro_id: string | null;
    observacao: string | null;
  };
  avaliacao: AvaliacaoMeta;
};

// Visual de cada situação — cor da barra/anel, emoji e o texto do selo.
// Concentrado aqui (em vez de espalhado no JSX) pra ficar fácil de ajustar o
// tom sem caçar cada `situacao === "x" ? ... : ...` espalhado.
const VISUAL_SITUACAO: Record<
  SituacaoMeta,
  { cor: string; corTexto: string; corFundo: string; corBorda: string; emoji: string; selo: string }
> = {
  concluida: {
    cor: "#22c55e",
    corTexto: "text-green-700",
    corFundo: "bg-green-50",
    corBorda: "border-green-200",
    emoji: "🏆",
    selo: "Meta batida!"
  },
  no_prazo: {
    cor: "#635bff",
    corTexto: "text-blue-700",
    corFundo: "bg-blue-50",
    corBorda: "border-blue-200",
    emoji: "🚀",
    selo: "No ritmo certo"
  },
  atencao: {
    cor: "#f59e0b",
    corTexto: "text-amber-700",
    corFundo: "bg-amber-50",
    corBorda: "border-amber-200",
    emoji: "⚡",
    selo: "Precisa acelerar"
  },
  atrasada: {
    cor: "#ef4444",
    corTexto: "text-red-700",
    corFundo: "bg-red-50",
    corBorda: "border-red-200",
    emoji: "🔥",
    selo: "Correndo contra o tempo"
  },
  vencida: {
    cor: "#6b7280",
    corTexto: "text-gray-600",
    corFundo: "bg-gray-100",
    corBorda: "border-gray-200",
    emoji: "⏰",
    selo: "Prazo encerrado"
  }
};

const VISUAL_CLASSIFICACAO: Record<ClassificacaoMeta, { label: string; emoji: string }> = {
  bronze: { label: "Bronze", emoji: "🥉" },
  prata: { label: "Prata", emoji: "🥈" },
  ouro: { label: "Ouro", emoji: "🥇" },
  diamante: { label: "Diamante", emoji: "💎" }
};

// Anel de progresso via conic-gradient — mais parecido com jogo/app de
// fitness do que uma barrinha reta, sem precisar desenhar SVG à mão.
function AnelProgresso({ percentual, cor }: { percentual: number; cor: string }) {
  const p = Math.max(0, Math.min(100, percentual));
  return (
    <div
      className="relative w-16 h-16 rounded-full shrink-0"
      style={{ background: `conic-gradient(${cor} ${p * 3.6}deg, #e5e7eb 0deg)` }}
    >
      <div className="absolute inset-1.5 bg-white rounded-full flex items-center justify-center">
        <span className="text-xs font-bold text-gray-800">{percentual}%</span>
      </div>
    </div>
  );
}

function CardMeta({ meta, avaliacao }: MetaComProgresso) {
  const opcao = tipoMetaOpcao(meta.tipo_meta);
  const visual = VISUAL_SITUACAO[avaliacao.situacao];
  const classificacao = VISUAL_CLASSIFICACAO[avaliacao.classificacao];
  const critico = avaliacao.diasRestantes !== null && avaliacao.diasRestantes <= 3 && avaliacao.situacao !== "concluida";

  return (
    <div className={`bg-white border rounded-xl p-4 ${visual.corBorda} ${avaliacao.situacao === "concluida" ? "bg-gradient-to-br from-green-50 to-white" : ""}`}>
      <div className="flex items-start gap-3">
        <AnelProgresso percentual={avaliacao.percentual} cor={visual.cor} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-0.5">
            <div className="text-sm font-bold text-gray-800">{opcao?.label ?? meta.tipo_meta}</div>
            <span className="text-[13px]" title={classificacao.label}>
              {classificacao.emoji}
            </span>
          </div>
          <div className="text-[11px] text-gray-400">
            {meta.parceiro_id ? "Meta individual" : "🌐 Meta geral — soma de todo mundo"}
          </div>
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border mt-1.5 ${visual.corFundo} ${visual.corTexto} ${visual.corBorda}`}>
            {visual.emoji} {visual.selo}
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-700 mt-3">{avaliacao.mensagem}</p>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {avaliacao.diasRestantes !== null && avaliacao.situacao !== "concluida" && avaliacao.situacao !== "vencida" && (
          <span
            className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${
              critico ? "bg-red-100 text-red-700 animate-pulse" : "bg-gray-100 text-gray-600"
            }`}
          >
            ⏳ {avaliacao.diasRestantes} dia{avaliacao.diasRestantes === 1 ? "" : "s"} restante{avaliacao.diasRestantes === 1 ? "" : "s"}
          </span>
        )}
        {avaliacao.ritmoDiarioTexto && (
          <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 bg-indigo-50 text-indigo-700">
            🎯 {avaliacao.ritmoDiarioTexto}/dia
          </span>
        )}
      </div>

      {meta.observacao && <p className="text-[11px] text-gray-400 mt-2 italic">"{meta.observacao}"</p>}
    </div>
  );
}

export function PortalMetasPainel({ metas }: { metas: MetaComProgresso[] }) {
  if (metas.length === 0) return null;

  const urgentes = metas.filter(
    ({ avaliacao }) =>
      avaliacao.situacao === "atrasada" || (avaliacao.diasRestantes !== null && avaliacao.diasRestantes <= 3 && avaliacao.situacao !== "concluida")
  );
  const concluidas = metas.filter(({ avaliacao }) => avaliacao.situacao === "concluida").length;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Suas metas</div>
        {concluidas > 0 && (
          <span className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            🏆 {concluidas} batida{concluidas === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {urgentes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 flex items-center gap-2">
          <span className="text-lg">🔥</span>
          <p className="text-xs text-red-700 font-semibold">
            Corrida contra o tempo! Você tem {urgentes.length} meta{urgentes.length === 1 ? "" : "s"} atrasada
            {urgentes.length === 1 ? "" : "s"} ou com o prazo acabando — dá tempo de virar o jogo, bora acelerar.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {metas.map((item) => (
          <CardMeta key={item.meta.id} {...item} />
        ))}
      </div>
    </div>
  );
}
