import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { MarketingEditarForm } from "@/components/marketing-editar-form";
import { MarketingChecklist } from "@/components/marketing-checklist";
import { MarketingAtividades } from "@/components/marketing-atividades";
import { listarParceirosAdministrativos } from "@/lib/parceiros/administrativos";
import { labelColuna } from "@/lib/marketing/opcoes";
import { formatData } from "@/lib/format";
import {
  atualizarOrdemAction,
  apagarOrdemAction,
  adicionarChecklistItemAction,
  adicionarChecklistPadraoAction,
  marcarChecklistItemAction,
  removerChecklistItemAction,
  criarAtividadeAction,
  marcarAtividadeFeitaAction,
  removerAtividadeAction,
  adicionarNotaAction
} from "../actions";

export const dynamic = "force-dynamic";

export default async function MarketingDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;

  const ordem = await prisma.marketing_ordens.findUnique({
    where: { id },
    include: {
      parceiros_marketing_ordens_solicitante_parceiro_idToparceiros: { select: { nome: true } },
      parceiros_marketing_ordens_responsavel_atual_idToparceiros: { select: { nome: true } },
      checklist_itens: { orderBy: { ordem: "asc" } },
      atividades: { orderBy: { data: "asc" } },
      notas: { orderBy: { criado_em: "desc" } }
    }
  });
  if (!ordem) notFound();

  const [corretores, administrativos] = await Promise.all([
    prisma.parceiros.findMany({
      where: { funcao: "Corretor", status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    listarParceirosAdministrativos()
  ]);

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <Link href="/marketing" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Marketing
        </Link>
        {!ordem.excluido && (
          <form action={apagarOrdemAction}>
            <input type="hidden" name="ordemId" value={ordem.id} />
            <button type="submit" className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50">
              Apagar cadastro
            </button>
          </form>
        )}
      </div>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Ordem de Marketing salva com sucesso.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">{ordem.titulo}</div>
          <span className="text-xs bg-primary/10 text-primary font-semibold rounded-full px-2.5 py-1">
            {labelColuna(ordem.coluna)}
          </span>
        </div>
        <div className="text-xs text-gray-400">
          {ordem.id_legado ?? ordem.id}
          {ordem.parceiros_marketing_ordens_solicitante_parceiro_idToparceiros?.nome
            ? ` · Solicitante: ${ordem.parceiros_marketing_ordens_solicitante_parceiro_idToparceiros.nome}`
            : ""}
          {ordem.parceiros_marketing_ordens_responsavel_atual_idToparceiros?.nome
            ? ` · Responsável: ${ordem.parceiros_marketing_ordens_responsavel_atual_idToparceiros.nome}`
            : ""}
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <MarketingEditarForm ordem={ordem} corretores={corretores} administrativos={administrativos} action={atualizarOrdemAction} />

        <MarketingChecklist
          ordemId={ordem.id}
          itens={ordem.checklist_itens}
          adicionar={adicionarChecklistItemAction}
          adicionarPadrao={adicionarChecklistPadraoAction}
          marcar={marcarChecklistItemAction}
          remover={removerChecklistItemAction}
        />

        <MarketingAtividades
          ordemId={ordem.id}
          atividades={ordem.atividades}
          adicionar={criarAtividadeAction}
          marcarFeita={marcarAtividadeFeitaAction}
          remover={removerAtividadeAction}
        />

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Notas</div>
          <form action={adicionarNotaAction} className="flex gap-2 mb-4">
            <input type="hidden" name="ordemId" value={ordem.id} />
            <input
              name="texto"
              placeholder="Escreva uma nota..."
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 flex-1 outline-none focus:border-primary"
              required
            />
            <button type="submit" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap">
              + Adicionar nota
            </button>
          </form>
          <div className="flex flex-col gap-2">
            {ordem.notas.map((n) => (
              <div key={n.id} className="border border-gray-100 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-700">{n.texto}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{formatData(n.criado_em)}</div>
              </div>
            ))}
            {ordem.notas.length === 0 && <p className="text-xs text-gray-400">Nenhuma nota ainda.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
