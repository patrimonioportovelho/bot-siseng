import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ClienteForm } from "@/components/cliente-form";
import { criarClienteAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovoClientePage() {
  const [lojas, bancos, parceiros] = await Promise.all([
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.bancos.findMany({ orderBy: { nome: "asc" } }),
    prisma.parceiros.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } })
  ]);

  return (
    <div>
      <Topbar />

      <Link href="/clientes" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Clientes
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Novo cliente</div>

      <ClienteForm cliente={null} lojas={lojas} bancos={bancos} parceiros={parceiros} action={criarClienteAction} />
    </div>
  );
}
