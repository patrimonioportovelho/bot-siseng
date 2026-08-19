import { Topbar } from "@/components/topbar";
import { TransacoesLista } from "@/components/transacoes-lista";

export const dynamic = "force-dynamic";

export default async function TransacoesLocacaoPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; excluido?: string; erro?: string }>;
}) {
  const { q, excluido, erro } = await searchParams;

  return (
    <div>
      <Topbar />
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">
          {erro}
        </div>
      )}
      {excluido === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Cadastro apagado com sucesso.
        </div>
      )}
      <TransacoesLista tipo="Locação" q={q} novoHref="/transacoes/novo?tipo=Loca%C3%A7%C3%A3o" />
    </div>
  );
}
