import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { MarketingEditarForm } from "@/components/marketing-editar-form";
import { MarketingChecklist } from "@/components/marketing-checklist";
import { MarketingAtividades } from "@/components/marketing-atividades";
import { MarketingProducoes } from "@/components/marketing-producoes";
import { MarketingBriefingForm } from "@/components/marketing-briefing-form";
import { BotaoSubmit } from "@/components/botao-submit";
import { listarParceirosAdministrativos } from "@/lib/parceiros/administrativos";
import { labelColuna, pilarImpactoDaColuna, PILAR_IMPACTO_COR, slaDaOrdem } from "@/lib/marketing/opcoes";
import { formatData } from "@/lib/format";
import {
  atualizarOrdemAction,
  apagarOrdemAction,
  salvarBriefingAction,
  adicionarChecklistItemAction,
  adicionarChecklistPadraoAction,
  marcarChecklistItemAction,
  removerChecklistItemAction,
  criarAtividadeAction,
  marcarAtividadeFeitaAction,
  removerAtividadeAction,
  criarProducaoAction,
  atualizarProducaoLinksAction,
  atualizarProducaoStatusAction,
  incrementarRevisaoProducaoAction,
  removerProducaoAction,
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
      producoes: { where: { excluido: false }, orderBy: { created_at: "asc" } },
      notas: { orderBy: { criado_em: "desc" } }
    }
  });
  if (!ordem) notFound();

  const pilar = pilarImpactoDaColuna(ordem.coluna);
  const sla = slaDaOrdem(ordem.coluna, ordem.tipo, ordem.coluna_atualizada_em);

  const [corretores, administrativos, empreendimentos, imovel, imoveis] = await Promise.all([
    prisma.parceiros.findMany({
      where: { funcao: "Corretor", status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    listarParceirosAdministrativos(),
    prisma.marketing_empreendimentos.findMany({
      where: { excluido: false, status: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    // Imóvel vinculado (Ordem "cadastro inteligente", 09/08/2026) — puxa
    // endereço/valor prontos pro briefing quando existe (ver
    // components/marketing-briefing-form.tsx).
    ordem.imovel_id
      ? prisma.imoveis.findUnique({
          where: { id: ordem.imovel_id },
          select: { endereco: true, valor_venda: true, valor_avaliacao: true }
        })
      : null,
    // Lista completa pro autocomplete de "Imóvel vinculado" na ficha (pedido
    // do usuário, 09/08/2026 — "marketing ir para os imóveis como
    // relatório"): permite linkar/trocar o imóvel de qualquer Ordem, não só
    // as que nasceram de um pedido da Agenda.
    prisma.imoveis.findMany({
      where: { excluido: false },
      orderBy: { created_at: "desc" },
      select: { id: true, id_legado: true, endereco: true }
    })
  ]);

  const imovelVinculado = imovel
    ? {
        endereco: imovel.endereco,
        valor: imovel.valor_venda != null
          ? imovel.valor_venda.toString()
          : imovel.valor_avaliacao != null
            ? imovel.valor_avaliacao.toString()
            : null
      }
    : null;

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
          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] font-bold rounded-full px-2.5 py-1 border ${PILAR_IMPACTO_COR[pilar.id]}`}
              title="Pilar IMPACTO — nível de andamento da metodologia, calculado a partir da etapa"
            >
              {pilar.letra} · {pilar.label}
            </span>
            <span className="text-xs bg-primary/10 text-primary font-semibold rounded-full px-2.5 py-1">
              {labelColuna(ordem.coluna)}
            </span>
            {sla?.atrasado && (
              <span
                className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-red-50 text-red-600 border border-red-200"
                title="Etapa passou do prazo (SLA)"
              >
                Atrasado
              </span>
            )}
          </div>
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
        <MarketingEditarForm
          ordem={ordem}
          corretores={corretores}
          administrativos={administrativos}
          empreendimentos={empreendimentos}
          imoveis={imoveis}
          action={atualizarOrdemAction}
        />

        <MarketingBriefingForm
          ordemId={ordem.id}
          briefingTipoAtual={ordem.briefing_tipo}
          briefingDadosAtuais={ordem.briefing_dados as Record<string, unknown> | null}
          briefingCompleto={ordem.briefing_completo}
          corretores={corretores}
          solicitanteCorretorId={ordem.solicitante_parceiro_id}
          imovelVinculado={imovelVinculado}
          action={salvarBriefingAction}
        />

        <MarketingChecklist
          ordemId={ordem.id}
          itens={ordem.checklist_itens}
          pilarAtualLabel={pilar.label}
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

        <MarketingProducoes
          ordemId={ordem.id}
          producoes={ordem.producoes}
          administrativos={administrativos}
          criar={criarProducaoAction}
          atualizarLinks={atualizarProducaoLinksAction}
          atualizarStatus={atualizarProducaoStatusAction}
          incrementarRevisao={incrementarRevisaoProducaoAction}
          remover={removerProducaoAction}
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
            <BotaoSubmit className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap" carregandoTexto="Adicionando...">
              + Adicionar nota
            </BotaoSubmit>
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
