import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { AdministracaoForm } from "@/components/administracao-form";
import { StatusTransacaoSelect } from "@/components/status-transacao-select";
import { FUNCOES_CAPTADOR } from "@/lib/administracoes/opcoes";
import { formatMoeda, formatDataCalendario } from "@/lib/format";
import { atualizarAdministracaoAction, apagarAdministracaoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdministracaoDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;
  const session = await getAdminSession();

  const [administracao, lojas, clientes, imoveis, parceiros, transacoes] = await Promise.all([
    prisma.adm_imoveis.findUnique({
      where: { id },
      include: {
        clientes: true,
        lojas: true,
        imoveis: {
          include: {
            imoveis_proprietarios: { orderBy: { ordem: "asc" }, include: { clientes: true } }
          }
        }
      }
    }),
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.clientes.findMany({
      // NULL em status_cadastro conta como "não arquivado" — ver mesmo
      // comentário em app/imoveis/novo/page.tsx.
      where: { OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, id_legado: true, parceiro_id: true }
    }),
    prisma.imoveis.findMany({
      where: { excluido: false },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        id_legado: true,
        endereco: true,
        inscricao: true,
        imoveis_proprietarios: {
          orderBy: { ordem: "asc" },
          select: { clientes: { select: { id: true, nome: true } } }
        }
      }
    }),
    prisma.parceiros.findMany({
      where: { funcao: { in: FUNCOES_CAPTADOR } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    prisma.transacoes.findMany({
      where: { adm_imovel_id: id, excluido: false },
      orderBy: { created_at: "desc" },
      include: {
        clientes_transacoes_cliente_contraparte_idToclientes: { select: { nome: true } }
      }
    })
  ]);

  if (!administracao) notFound();

  const proprietariosImovel = administracao.imoveis?.imoveis_proprietarios.map((v) => v.clientes) ?? [];
  const nomesProprietarios = proprietariosImovel.map((c) => c.nome).join(", ");

  const imoveisComProprietarios = imoveis.map((i) => ({
    id: i.id,
    id_legado: i.id_legado,
    endereco: i.endereco,
    inscricao: i.inscricao,
    proprietarios: i.imoveis_proprietarios.map((v) => v.clientes)
  }));

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3">
        <Link href="/administracoes" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Administrações
        </Link>
        {session?.isAdm && !administracao.excluido && (
          <form action={apagarAdministracaoAction}>
            <input type="hidden" name="administracaoId" value={administracao.id} />
            <button
              type="submit"
              className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50"
            >
              Apagar cadastro
            </button>
          </form>
        )}
      </div>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Administração salva com sucesso.
        </div>
      )}

      <div className="text-sm font-bold text-gray-800 mb-1">
        {administracao.imoveis?.endereco ?? "Imóvel sem endereço"}
      </div>
      <div className="text-xs text-gray-500 mb-0.5">
        {administracao.lojas?.nome}
        {nomesProprietarios && (
          <>
            {" · "}
            {proprietariosImovel.length > 1 ? `Proprietários (${proprietariosImovel.length})` : "Proprietário"}:{" "}
            {nomesProprietarios}
          </>
        )}
        {" · "}
        {administracao.status}
      </div>
      <div className="text-xs text-gray-400 mb-4">
        Id administração: {administracao.id_legado ?? administracao.id}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="text-sm font-bold text-gray-800 mb-3">
          Transações de locação ({transacoes.length})
        </div>
        {transacoes.length === 0 && (
          <p className="text-xs text-gray-400 py-3">Nenhuma transação vinculada a esta administração ainda.</p>
        )}
        {transacoes.length > 0 && (
          <div className="flex flex-col">
            <div className="hidden md:grid md:grid-cols-[1fr_1fr_auto_auto] gap-3 px-1 py-1.5 text-[11px] text-gray-400 border-b border-gray-100">
              <span>Locatário</span>
              <span>Assinatura</span>
              <span className="text-right">Valor</span>
              <span>Status</span>
            </div>
            {transacoes.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-1 gap-1 md:grid-cols-[1fr_1fr_auto_auto] md:gap-3 md:items-center px-1 py-2 border-b border-gray-50 last:border-0"
              >
                <span className="text-xs font-medium text-gray-800 truncate">
                  {t.clientes_transacoes_cliente_contraparte_idToclientes?.nome ?? "—"}
                </span>
                <span className="text-xs text-gray-500">{formatDataCalendario(t.data_assinatura)}</span>
                <span className="text-xs text-gray-600 text-right whitespace-nowrap">
                  {formatMoeda(t.valor_transacao)}
                </span>
                <StatusTransacaoSelect transacaoId={t.id} admImovelId={administracao.id} statusAtual={t.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      <AdministracaoForm
        administracao={administracao}
        lojas={lojas}
        clientes={clientes}
        imoveis={imoveisComProprietarios}
        parceiros={parceiros}
        action={atualizarAdministracaoAction}
      />
    </div>
  );
}
