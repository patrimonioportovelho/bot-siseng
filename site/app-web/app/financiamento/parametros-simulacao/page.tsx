import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { SimulacaoParametrosEditor, type LinhaParametro } from "@/components/simulacao-parametros-editor";
import { salvarParametroSimulacaoAction } from "../simulacao-actions";

export const dynamic = "force-dynamic";

// Parâmetros da simulação habitacional (taxas, tetos, cotas e seguros da Caixa). Ficam no banco porque mudam por
// portaria ou política; só quem edita o Financiamento consegue salvar (a ação confere).
export default async function ParametrosSimulacaoPage() {
  await requireAdminSession();
  const linhas = await prisma.simulacao_parametros.findMany({ orderBy: { chave: "asc" } });
  const dados: LinhaParametro[] = linhas.map((l) => ({
    chave: l.chave,
    valor: l.valor,
    descricao: l.descricao,
    fonte: l.fonte,
    atualizadoEm: l.updated_at.toISOString()
  }));

  return (
    <div>
      <Topbar />
      <Link href="/financiamento" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Financiamento
      </Link>
      <div className="text-lg font-bold text-gray-900 mb-1">Parâmetros da simulação habitacional</div>
      <p className="text-xs text-gray-500 mb-5 max-w-3xl">
        Taxas, tetos, cotas e seguros usados na simulação de imóveis usados (Caixa). Eles mudam por portaria ou política da Caixa, por isso ficam aqui e não no
        sistema. Em verde, o que foi conferido numa simulação real da Caixa; em amarelo, valores de referência que ainda precisam ser conferidos no simulador oficial;
        em vermelho, o que ainda não foi informado (a simulação avisa quando precisa de um deles).
      </p>
      <SimulacaoParametrosEditor linhas={dados} salvar={salvarParametroSimulacaoAction} />
    </div>
  );
}
