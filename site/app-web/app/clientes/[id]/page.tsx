import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { ClienteForm } from "@/components/cliente-form";
import { atualizarClienteAction, apagarClienteAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ClienteDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; embed?: string }>;
}) {
  const { id } = await params;
  const { salvo, embed } = await searchParams;
  const embutido = embed === "1";
  const session = await getAdminSession();

  const [cliente, lojas, bancos, parceiros] = await Promise.all([
    prisma.clientes.findUnique({ where: { id }, include: { parceiros: true } }),
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.bancos.findMany({ orderBy: { nome: "asc" } }),
    prisma.parceiros.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } })
  ]);

  if (!cliente) notFound();

  return (
    <div>
      {!embutido && <Topbar />}

      <div className="flex items-center justify-between mb-3">
        {embutido ? (
          <span />
        ) : (
          <Link href="/clientes" className="text-xs text-gray-500 hover:text-gray-800">
            ← Voltar para Clientes
          </Link>
        )}
        {session?.isAdm && cliente.status_cadastro !== "Arquivado" && (
          <form action={apagarClienteAction}>
            <input type="hidden" name="clienteId" value={cliente.id} />
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
          Cliente salvo com sucesso.
        </div>
      )}

      <div className="text-sm font-bold text-gray-800 mb-1">{cliente.nome}</div>
      <div className="text-xs text-gray-500 mb-0.5">
        {cliente.tipo_cliente}
        {cliente.parceiros?.nome && <> · Parceiro responsável: {cliente.parceiros.nome}</>}
      </div>
      <div className="text-xs text-gray-400 mb-4">Id cliente: {cliente.id_legado ?? cliente.id}</div>

      <ClienteForm
        cliente={cliente}
        lojas={lojas}
        bancos={bancos}
        parceiros={parceiros}
        action={atualizarClienteAction}
        embutido={embutido}
      />
    </div>
  );
}
