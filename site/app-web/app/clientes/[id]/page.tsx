import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ClienteForm } from "@/components/cliente-form";
import { atualizarClienteAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [cliente, lojas, bancos, parceiros] = await Promise.all([
    prisma.clientes.findUnique({ where: { id }, include: { parceiros: true } }),
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.bancos.findMany({ orderBy: { nome: "asc" } }),
    prisma.parceiros.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } })
  ]);

  if (!cliente) notFound();

  return (
    <div>
      <Topbar />

      <Link href="/clientes" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Clientes
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-1">{cliente.nome}</div>
      <div className="text-xs text-gray-500 mb-0.5">
        {cliente.tipo_cliente}
        {cliente.parceiros?.nome && <> · Parceiro responsável: {cliente.parceiros.nome}</>}
      </div>
      <div className="text-xs text-gray-400 mb-4">Id cliente: {cliente.id_legado ?? cliente.id}</div>

      <ClienteForm cliente={cliente} lojas={lojas} bancos={bancos} parceiros={parceiros} action={atualizarClienteAction} />
    </div>
  );
}
