import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { TransacaoForm } from "@/components/transacao-form";
import { formatData, formatMoeda } from "@/lib/format";
import { atualizarTransacaoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function TransacaoDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;

  const [transacao, lojas, clientes, imoveis, parceiros] = await Promise.all([
    prisma.transacoes.findUnique({
      where: { id },
      include: {
        imoveis: { include: { imoveis_proprietarios: { include: { clientes: true }, orderBy: { ordem: "asc" } } } },
        transacoes_contrapartes: { include: { clientes: true }, orderBy: { ordem: "asc" } }
      }
    }),
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.clientes.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, id_legado: true }
    }),
    prisma.imoveis.findMany({
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
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, funcao: true }
    })
  ]);

  if (!transacao) notFound();

  const imoveisComProprietarios = imoveis.map((i) => ({
    id: i.id,
    id_legado: i.id_legado,
    endereco: i.endereco,
    inscricao: i.inscricao,
    proprietarios: i.imoveis_proprietarios.map((v) => v.clientes)
  }));

  const proprietarios = transacao.imoveis?.imoveis_proprietarios.map((v) => v.clientes) ?? [];
  const nomesProprietarios = proprietarios.map((c) => c.nome).join(", ");
  const interessados = transacao.transacoes_contrapartes.map((v) => v.clientes);
  const nomesInteressados = interessados.map((c) => c.nome).join(", ");

  return (
    <div>
      <Topbar />

      <Link href="/transacoes" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Transações
      </Link>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Transação salva com sucesso.
        </div>
      )}

      <div className="text-sm font-bold text-gray-800 mb-1">
        {transacao.imoveis?.endereco ?? "Imóvel sem endereço"}
      </div>
      <div className="text-xs text-gray-500 mb-0.5">
        {transacao.tipo}
        {nomesProprietarios && <> · Proprietário{proprietarios.length > 1 ? "s" : ""}: {nomesProprietarios}</>}
        {nomesInteressados && <> · Interessado{interessados.length > 1 ? "s" : ""}: {nomesInteressados}</>}
      </div>
      <div className="text-xs text-gray-400 mb-4">
        Id transação: {transacao.id_legado ?? transacao.id}
        {" · "}Assinatura: {formatData(transacao.data_assinatura)}
        {" · "}Valor: {formatMoeda(transacao.valor_transacao)}
      </div>

      <TransacaoForm
        transacao={transacao}
        lojas={lojas}
        clientes={clientes}
        imoveis={imoveisComProprietarios}
        parceiros={parceiros}
        interessadosIniciais={interessados}
        action={atualizarTransacaoAction}
      />
    </div>
  );
}
