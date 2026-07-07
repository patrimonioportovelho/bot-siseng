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

      <Link href="/administracoes" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Administrações
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Nova administração</div>

      <AdministracaoForm
        administracao={null}
        lojas={lojas}
        clientes={clientes}
        imoveis={imoveisComProprietarios}
        parceiros={parceiros}
        action={criarAdministracaoAction}
      />
    </div>
  );
}
