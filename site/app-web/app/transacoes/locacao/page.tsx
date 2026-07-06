import { Topbar } from "@/components/topbar";
import { TransacoesLista } from "@/components/transacoes-lista";

export const dynamic = "force-dynamic";

export default async function TransacoesLocacaoPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <div>
      <Topbar />
      <TransacoesLista tipo="Locação" q={q} novoHref="/transacoes/novo?tipo=Loca%C3%A7%C3%A3o" />
    </div>
  );
}
