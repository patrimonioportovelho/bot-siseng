import { Topbar } from "@/components/topbar";
import { TransacoesLista } from "@/components/transacoes-lista";

export const dynamic = "force-dynamic";

export default async function TransacoesVendaPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <div>
      <Topbar />
      <TransacoesLista tipo="Compra e Venda" q={q} novoHref="/transacoes/novo?tipo=Compra%20e%20Venda" />
    </div>
  );
}
