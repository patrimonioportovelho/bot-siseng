import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { AdministracaoForm } from "@/components/administracao-form";
import { FUNCOES_CAPTADOR } from "@/lib/administracoes/opcoes";
import { criarAdministracaoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaAdministracaoPage() {
  const [lojas, clientes, imoveis, parceiros] = await Promise.all([
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.clientes.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, id_legado: true, parceiro_id: true }
    }),
    prisma.imoveis.findMany({
      orderBy: { created_at: "desc" },
      select: { id: true, id_legado: true, endereco: true, inscricao: true }
    }),
    prisma.parceiros.findMany({
      where: { funcao: { in: FUNCOES_CAPTADOR } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    })
  ]);

  return (
    <div>
      <Topbar />

      <Link href="/administracoes" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Administrações
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Nova administração</div>

      <AdministracaoForm
        administracao={null}
        lojas={lojas}
        clientes={clientes}
        imoveis={imoveis}
        parceiros={parceiros}
        action={criarAdministracaoAction}
      />
    </div>
  );
}
