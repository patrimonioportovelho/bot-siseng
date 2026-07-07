import { Topbar } from "@/components/topbar";
import { TransacoesLista } from "@/components/transacoes-lista";

export const dynamic = "force-dynamic";

export default async function TransacoesVendaPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; excluido?: string }>;
}) {
  const { q, excluido } = await searchParams;

  return (
    <div>
      <Topbar />
      {excluido === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Cadastro apagado com sucesso.
        </div>
      )}
      <TransacoesLista tipo="Compra e Venda" q={q} novoHref="/transacoes/novo?tipo=Compra%20e%20Venda" />
    </div>
  );
}
