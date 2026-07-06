import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ImovelForm } from "@/components/imovel-form";
import { FUNCOES_CAPTADOR } from "@/lib/imoveis/opcoes";
import { atualizarImovelAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ImovelDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;

  const [imovel, clientes, parceiros, estados, cidades] = await Promise.all([
    prisma.imoveis.findUnique({
      where: { id },
      include: {
        parceiros: true,
        cidades: true,
        estados: true,
        imoveis_proprietarios: { include: { clientes: true }, orderBy: { ordem: "asc" } }
      }
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
  const proprietarios = imovel.imoveis_proprietarios.map((v) => v.clientes);
  const nomesProprietarios = proprietarios.map((c) => c.nome).join(", ");

  return (
    <div>
      <Topbar />

      <Link href="/imoveis" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Imóveis
      </Link>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Imóvel salvo com sucesso.
        </div>
      )}

      <div className="text-sm font-bold text-gray-800 mb-1">{titulo}</div>
      <div className="text-xs text-gray-500 mb-0.5">
        {imovel.tipo_imovel ?? "—"}
        {nomesProprietarios && (
          <>
            {" "}
            · {proprietarios.length > 1 ? "Proprietários" : "Proprietário"}: {nomesProprietarios}
          </>
        )}
      </div>
      <div className="text-xs text-gray-400 mb-4">Id imóvel: {imovel.id_legado ?? imovel.id}</div>

      <ImovelForm
        imovel={imovel}
        clientes={clientes}
        proprietariosIniciais={proprietarios.map((c) => ({
          id: c.id,
          nome: c.nome,
          id_legado: c.id_legado,
          parceiro_id: c.parceiro_id
        }))}
        parceiros={parceiros}
        estados={estados}
        cidades={cidades}
        action={atualizarImovelAction}
      />
    </div>
  );
}
