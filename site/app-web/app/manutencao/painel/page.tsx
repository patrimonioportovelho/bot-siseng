import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { formatData } from "@/lib/format";
import {
  URGENCIA_LABEL,
  URGENCIA_COR,
  CHAVE_POSSE_LABEL,
  labelColuna,
  iconeTipoServico
} from "@/lib/manutencao/opcoes";

export const dynamic = "force-dynamic";

// Ordem de urgência pra ordenar a lista "em aberto" com emergencial primeiro
// — não dá pra confiar em ORDER BY alfabético (alta vem antes de baixa).
const ORDEM_URGENCIA: Record<string, number> = { emergencial: 0, alta: 1, media: 2, baixa: 3 };

export default async function ManutencaoPainelPage() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const em7dias = new Date(hoje);
  em7dias.setDate(em7dias.getDate() + 7);

  const [emAberto, chavesFora, atividadesAtrasadas, atividadesProximas] = await Promise.all([
    prisma.manutencoes.findMany({
      where: { excluido: false, coluna: { not: "pago" } },
      include: {
        imoveis: { select: { id: true, id_legado: true, endereco: true } },
        clientes: { select: { nome: true } },
        parceiros: { select: { nome: true } }
      }
    }),
    prisma.manutencoes.findMany({
      where: { excluido: false, chave_posse: { not: "imobiliaria" } },
      orderBy: { chave_atualizado_em: "asc" },
      include: { imoveis: { select: { id: true, id_legado: true, endereco: true } } }
    }),
    prisma.manutencao_atividades.count({
      where: { feito: false, data: { lt: hoje }, manutencoes: { excluido: false } }
    }),
    prisma.manutencao_atividades.count({
      where: { feito: false, data: { gte: hoje, lt: em7dias }, manutencoes: { excluido: false } }
    })
  ]);

  const emAbertoOrdenado = [...emAberto].sort(
    (a, b) => (ORDEM_URGENCIA[a.urgencia] ?? 9) - (ORDEM_URGENCIA[b.urgencia] ?? 9)
  );

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Manutenção · Administração</div>
        <div className="flex gap-2">
          <Link href="/manutencao" className="text-xs border border-gray-300 text-gray-600 bg-white rounded-lg px-3 py-1.5 font-semibold">
            Quadro
          </Link>
          <Link href="/manutencao/calendario" className="text-xs border border-gray-300 text-gray-600 bg-white rounded-lg px-3 py-1.5 font-semibold">
            Calendário
          </Link>
          <Link href="/manutencao/painel" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold">
            Painel
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Manutenções em aberto</div>
          <div className="text-lg font-bold mt-1 text-gray-900">{emAberto.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Atividades atrasadas</div>
          <div className="text-lg font-bold mt-1 text-[#B14226]">{atividadesAtrasadas}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Atividades nos próximos 7 dias</div>
          <div className="text-lg font-bold mt-1 text-[#33587F]">{atividadesProximas}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Chaves fora da imobiliária</div>
          <div className="text-lg font-bold mt-1 text-[#A9822E]">{chavesFora.length}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Manutenções em aberto</div>
          <div className="flex flex-col gap-2">
            {emAbertoOrdenado.map((t) => {
              const cor = URGENCIA_COR[t.urgencia] ?? URGENCIA_COR.media;
              return (
                <Link
                  key={t.id}
                  href={`/manutencao/${t.id}`}
                  className="border border-gray-100 rounded-lg px-3 py-2 flex items-center justify-between gap-2 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-800 truncate">
                      {iconeTipoServico(t.tipo_servico)} {t.titulo}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">
                      {t.imoveis.endereco ?? t.imoveis.id_legado ?? "—"} · {labelColuna(t.coluna)}
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border shrink-0 ${cor.bg} ${cor.texto} ${cor.borda}`}>
                    {URGENCIA_LABEL[t.urgencia] ?? t.urgencia}
                  </span>
                </Link>
              );
            })}
            {emAbertoOrdenado.length === 0 && <p className="text-xs text-gray-400">Nenhuma manutenção em aberto.</p>}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Chaves fora da imobiliária</div>
          <div className="flex flex-col gap-2">
            {chavesFora.map((t) => (
              <Link
                key={t.id}
                href={`/manutencao/${t.id}`}
                className="border border-gray-100 rounded-lg px-3 py-2 flex items-center justify-between gap-2 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-gray-800 truncate">{t.titulo}</div>
                  <div className="text-[11px] text-gray-400 truncate">
                    {t.imoveis.endereco ?? t.imoveis.id_legado ?? "—"}
                    {t.chave_com ? ` · com ${t.chave_com}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] font-semibold text-gray-700">{CHAVE_POSSE_LABEL[t.chave_posse] ?? t.chave_posse}</div>
                  {t.chave_atualizado_em && (
                    <div className="text-[10px] text-gray-400">{formatData(t.chave_atualizado_em)}</div>
                  )}
                </div>
              </Link>
            ))}
            {chavesFora.length === 0 && <p className="text-xs text-gray-400">Todas as chaves estão na imobiliária.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
