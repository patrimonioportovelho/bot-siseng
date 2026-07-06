import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ImovelForm } from "@/components/imovel-form";
import { FUNCOES_CAPTADOR } from "@/lib/imoveis/opcoes";
import { atualizarImovelAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ImovelDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [imovel, clientes, parceiros, estados, cidades] = await Promise.all([
    prisma.imoveis.findUnique({
      where: { id },
      include: { clientes: { include: { parceiros: true } }, parceiros: true, cidades: true, estados: true }
    }),
    prisma.clientes.findMany({
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

  if (!imovel) notFound();

  const enderecoMontado = [imovel.rua, imovel.n_predial].filter(Boolean).join(", ");
  const titulo = imovel.endereco || enderecoMontado || "Imóvel sem endereço";

  return (
    <div>
      <Topbar />

      <Link href="/imoveis" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Imóveis
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-1">{titulo}</div>
      <div className="text-xs text-gray-500 mb-0.5">
        {imovel.tipo_imovel ?? "—"}
        {imovel.clientes?.nome && <> · Proprietário: {imovel.clientes.nome}</>}
      </div>
      <div className="text-xs text-gray-400 mb-4">Id imóvel: {imovel.id_legado ?? imovel.id}</div>

      <ImovelForm
        imovel={imovel}
        clientes={clientes}
        parceiros={parceiros}
        estados={estados}
        cidades={cidades}
        action={atualizarImovelAction}
      />
    </div>
  );
}
