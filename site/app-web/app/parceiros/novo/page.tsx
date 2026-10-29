import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ParceiroForm } from "@/components/parceiro-form";
import { requireAdminSession } from "@/lib/auth";
import { TODAS_FUNCOES } from "@/lib/parceiros/opcoes";
import { criarParceiroAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovoParceiroPage({
  searchParams
}: {
  searchParams: Promise<{ funcao?: string; origem?: string }>;
}) {
  const { funcao, origem } = await searchParams;
  const funcaoInicial = funcao && TODAS_FUNCOES.includes(funcao) ? funcao : undefined;
  const veioDoRecrutamento = origem === "recrutamento";
  const session = await requireAdminSession();
  const [lojas, bancos, estados, cidades] = await Promise.all([
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.bancos.findMany({ orderBy: { nome: "asc" } }),
    prisma.estados.findMany({ orderBy: { nome: "asc" } }),
    prisma.cidades.findMany({ orderBy: { nome: "asc" } })
  ]);

  return (
    <div>
      <Topbar />

      <Link
        href={veioDoRecrutamento ? "/recrutamento" : "/parceiros"}
        className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3"
      >
        ← Voltar para {veioDoRecrutamento ? "Recrutamento" : "Parceiros"}
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">{veioDoRecrutamento ? "Novo lead de recrutamento" : "Novo parceiro"}</div>

      <ParceiroForm
        parceiro={null}
        lojas={lojas}
        bancos={bancos}
        estados={estados}
        cidades={cidades}
        action={criarParceiroAction}
        isAdm={session.isAdm}
        funcaoInicial={funcaoInicial}
        origem={veioDoRecrutamento ? "recrutamento" : undefined}
      />
    </div>
  );
}
