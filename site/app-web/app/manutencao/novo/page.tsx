import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ManutencaoForm } from "@/components/manutencao-form";
import { criarManutencaoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaManutencaoPage({
  searchParams
}: {
  searchParams: Promise<{ imovel_id?: string }>;
}) {
  const { imovel_id: imovelIdInicial } = await searchParams;

  const [imoveis, clientes, prestadores] = await Promise.all([
    // Puxa qualquer imóvel, não só os com administração ativa cadastrada —
    // tem muita locação que ainda não foi formalizada como administração,
    // ver decisão tomada com o usuário.
    prisma.imoveis.findMany({
      where: { excluido: false },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        id_legado: true,
        endereco: true,
        imoveis_proprietarios: { orderBy: { ordem: "asc" }, take: 1, select: { clientes: { select: { id: true, nome: true } } } }
      }
    }),
    prisma.clientes.findMany({
      where: { OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    // Prestador de serviço é um Parceiro com essa função específica (ver
    // lib/parceiros/opcoes.ts) — não é um cadastro à parte.
    prisma.parceiros.findMany({
      where: { funcao: "Prestador de Serviço", status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    })
  ]);

  const imoveisOpcoes = imoveis.map((i) => ({
    id: i.id,
    id_legado: i.id_legado,
    endereco: i.endereco,
    proprietarioId: i.imoveis_proprietarios[0]?.clientes.id ?? null,
    proprietarioNome: i.imoveis_proprietarios[0]?.clientes.nome ?? null
  }));

  return (
    <div>
      <Topbar />

      <Link href="/manutencao" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Manutenção
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Nova manutenção</div>

      <ManutencaoForm
        imoveis={imoveisOpcoes}
        clientes={clientes}
        prestadores={prestadores}
        imovelIdInicial={imovelIdInicial ?? null}
        action={criarManutencaoAction}
      />
    </div>
  );
}
