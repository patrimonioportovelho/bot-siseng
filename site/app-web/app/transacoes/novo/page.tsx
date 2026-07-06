import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { TransacaoForm } from "@/components/transacao-form";
import { criarTransacaoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaTransacaoPage() {
  const [lojas, clientes, imoveis, parceiros] = await Promise.all([
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

      <Link href="/transacoes" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Transações
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Nova transação</div>

      <TransacaoForm
        transacao={null}
        lojas={lojas}
        clientes={clientes}
        imoveis={imoveisComProprietarios}
        parceiros={parceiros}
        interessadosIniciais={[]}
        action={criarTransacaoAction}
      />
    </div>
  );
}
