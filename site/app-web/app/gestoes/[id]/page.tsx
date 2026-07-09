import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { GestaoEditarForm } from "@/components/gestao-editar-form";
import { GestaoChecklist } from "@/components/gestao-checklist";
import { GestaoAtividades } from "@/components/gestao-atividades";
import { formatData } from "@/lib/format";
import {
  atualizarGestaoAction,
  apagarGestaoAction,
  adicionarChecklistItemAction,
  marcarChecklistItemAction,
  removerChecklistItemAction,
  criarAtividadeAction,
  marcarAtividadeFeitaAction,
  removerAtividadeAction,
  adicionarNotaAction
} from "../actions";

export const dynamic = "force-dynamic";

export default async function GestaoDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;

  const gestao = await prisma.gestoes.findUnique({
    where: { id },
    include: {
      imoveis: {
        select: {
          id: true,
          id_legado: true,
          endereco: true,
          imoveis_proprietarios: { orderBy: { ordem: "asc" }, include: { clientes: { select: { id: true, nome: true } } } }
        }
      },
      clientes: { select: { nome: true } },
      parceiros: { select: { nome: true } },
      checklist_itens: { orderBy: { ordem: "asc" } },
      atividades: { orderBy: { data: "asc" } },
      notas: { orderBy: { criado_em: "desc" } }
    }
  });
  if (!gestao) notFound();

  const [parceiros, ultimoDocumento] = await Promise.all([
    prisma.parceiros.findMany({
      where: { funcao: "Corretor", status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    prisma.documentos_gerados.findFirst({
      where: { entidade_tipo: "gestao", entidade_id: gestao.id, tipo_documento: "contrato_gestao", status: "Sucesso" },
      orderBy: { gerado_em: "desc" }
    })
  ]);

  const outrosProprietarios = gestao.imoveis.imoveis_proprietarios
    .map((v) => v.clientes)
    .filter((c) => c.nome !== gestao.clientes.nome);

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <Link href="/gestoes" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Gestões
        </Link>
        {!gestao.excluido && (
          <form action={apagarGestaoAction}>
            <input type="hidden" name="gestaoId" value={gestao.id} />
            <button type="submit" className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50">
              Apagar cadastro
            </button>
          </form>
        )}
      </div>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Gestão salva com sucesso.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">
            {gestao.imoveis.endereco ?? gestao.imoveis.id_legado ?? "Imóvel"}
          </div>
          <Link href={`/imoveis/${gestao.imoveis.id}`} className="text-xs text-primary font-semibold hover:underline">
            Abrir imóvel →
          </Link>
        </div>
        <div className="text-xs text-gray-400">
          Id imóvel: {gestao.imoveis.id_legado ?? gestao.imoveis.id} · Cliente principal: {gestao.clientes.nome}
          {gestao.parceiros?.nome ? ` · Corretor: ${gestao.parceiros.nome}` : ""}
        </div>
        {outrosProprietarios.length > 0 && (
          <div className="text-xs text-gray-400 mt-1">
            Demais assinantes: {outrosProprietarios.map((c) => c.nome).join(", ")}
          </div>
        )}
        {ultimoDocumento?.arquivo_url && (
          <a
            href={ultimoDocumento.arquivo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline inline-block mt-2"
          >
            Ver contrato de gestão gerado ({formatData(ultimoDocumento.gerado_em)})
          </a>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <GestaoEditarForm gestao={gestao} parceiros={parceiros} action={atualizarGestaoAction} />

        <GestaoChecklist
          gestaoId={gestao.id}
          itens={gestao.checklist_itens}
          adicionar={adicionarChecklistItemAction}
          marcar={marcarChecklistItemAction}
          remover={removerChecklistItemAction}
        />

        <GestaoAtividades
          gestaoId={gestao.id}
          atividades={gestao.atividades}
          adicionar={criarAtividadeAction}
          marcarFeita={marcarAtividadeFeitaAction}
          remover={removerAtividadeAction}
        />

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Notas</div>
          <form action={adicionarNotaAction} className="flex gap-2 mb-4">
            <input type="hidden" name="gestaoId" value={gestao.id} />
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
            {gestao.notas.map((n) => (
              <div key={n.id} className="border border-gray-100 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-700">{n.texto}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{formatData(n.criado_em)}</div>
              </div>
            ))}
            {gestao.notas.length === 0 && <p className="text-xs text-gray-400">Nenhuma nota ainda.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
