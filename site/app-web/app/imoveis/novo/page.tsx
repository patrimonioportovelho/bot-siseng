import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ImovelForm } from "@/components/imovel-form";
import { FUNCOES_CAPTADOR } from "@/lib/imoveis/opcoes";
import { criarImovelAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovoImovelPage() {
  const [clientes, parceiros, estados, cidades] = await Promise.all([
    prisma.clientes.findMany({
      // NULL em status_cadastro conta como "não arquivado" — todo cliente
      // criado pela tela nova fica com esse campo NULL (nunca é setado na
      // criação), e "not: Arquivado" sozinho exclui NULL no Postgres, o que
      // sumia com o cliente recém-criado desse seletor.
      where: { OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, id_legado: true, parceiro_id: true }
    }),
    prisma.parceiros.findMany({
      where: { funcao: { in: FUNCOES_CAPTADOR } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    prisma.estados.findMany({ orderBy: { nome: "asc" } }),
    prisma.cidades.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, estado_id: true } })
  ]);

  return (
    <div>
      <Topbar />

      <Link href="/imoveis" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Imóveis
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Novo imóvel</div>

      <ImovelForm
        imovel={null}
        clientes={clientes}
        proprietariosIniciais={[]}
        parceiros={parceiros}
        estados={estados}
        cidades={cidades}
        action={criarImovelAction}
      />
    </div>
  );
}
