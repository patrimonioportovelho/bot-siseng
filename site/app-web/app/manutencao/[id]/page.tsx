import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ManutencaoEditarForm } from "@/components/manutencao-editar-form";
import { ManutencaoChecklist } from "@/components/manutencao-checklist";
import { ManutencaoAtividades } from "@/components/manutencao-atividades";
import { formatData } from "@/lib/format";
import {
  atualizarManutencaoAction,
  apagarManutencaoAction,
  adicionarChecklistItemAction,
  marcarChecklistItemAction,
  removerChecklistItemAction,
  criarAtividadeAction,
  marcarAtividadeFeitaAction,
  removerAtividadeAction,
  adicionarNotaAction
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ManutencaoDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;

  const manutencao = await prisma.manutencoes.findUnique({
    where: { id },
    include: {
      imoveis: { select: { id: true, id_legado: true, endereco: true } },
      clientes: { select: { nome: true } },
      checklist_itens: { orderBy: { ordem: "asc" } },
      atividades: { orderBy: { data: "asc" } },
      notas: { orderBy: { criado_em: "desc" } }
    }
  });
  if (!manutencao) notFound();

  const [clientes, prestadores] = await Promise.all([
    prisma.clientes.findMany({
      where: { OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    prisma.parceiros.findMany({
      where: { funcao: "Prestador de Serviço", status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    })
  ]);

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <Link href="/manutencao" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Manutenção
        </Link>
        {!manutencao.excluido && (
          <form action={apagarManutencaoAction}>
            <input type="hidden" name="manutencaoId" value={manutencao.id} />
            <button type="submit" className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50">
              Apagar cadastro
            </button>
          </form>
        )}
      </div>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Manutenção salva com sucesso.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">
            {manutencao.imoveis.endereco ?? manutencao.imoveis.id_legado ?? "Imóvel"}
          </div>
          <Link href={`/imoveis/${manutencao.imoveis.id}`} className="text-xs text-primary font-semibold hover:underline">
            Abrir imóvel →
          </Link>
        </div>
        <div className="text-xs text-gray-400">
          Id imóvel: {manutencao.imoveis.id_legado ?? manutencao.imoveis.id}
          {manutencao.clientes?.nome ? ` · Proprietário: ${manutencao.clientes.nome}` : ""}
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <ManutencaoEditarForm
          manutencao={manutencao}
          clientes={clientes}
          prestadores={prestadores}
          clienteProprietarioNomeInicial={manutencao.clientes?.nome ?? null}
          action={atualizarManutencaoAction}
        />

        <ManutencaoChecklist
          manutencaoId={manutencao.id}
          itens={manutencao.checklist_itens}
          adicionar={adicionarChecklistItemAction}
          marcar={marcarChecklistItemAction}
          remover={removerChecklistItemAction}
        />

        <ManutencaoAtividades
          manutencaoId={manutencao.id}
          atividades={manutencao.atividades}
          adicionar={criarAtividadeAction}
          marcarFeita={marcarAtividadeFeitaAction}
          remover={removerAtividadeAction}
        />

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Notas</div>
          <form action={adicionarNotaAction} className="flex gap-2 mb-4">
            <input type="hidden" name="manutencaoId" value={manutencao.id} />
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
            {manutencao.notas.map((n) => (
              <div key={n.id} className="border border-gray-100 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-700">{n.texto}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{formatData(n.criado_em)}</div>
              </div>
            ))}
            {manutencao.notas.length === 0 && <p className="text-xs text-gray-400">Nenhuma nota ainda.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
