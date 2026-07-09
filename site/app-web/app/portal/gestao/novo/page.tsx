import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalGestaoForm } from "@/components/portal-gestao-form";

export const dynamic = "force-dynamic";

// Formulário "Elaboração de Contrato de Gestão" — só corretor logado no
// portal (email @remax.com.br + função Corretor, ver lib/portal-auth.ts)
// preenche isso. Os dados de cliente(s) e imóvel vão pro banco de verdade
// (mesmo padrão de cadastro do admin); o corretor em si vem sempre da
// própria sessão, sem poder escolher outro.
export default async function PortalGestaoNovoPage() {
  const session = await requirePortalSession();

  const [corretor, estados, cidades] = await Promise.all([
    prisma.parceiros.findUnique({
      where: { id: session.parceiroId },
      select: { id: true, nome: true, creci: true, cpf: true }
    }),
    prisma.estados.findMany({ orderBy: { nome: "asc" } }),
    prisma.cidades.findMany({ orderBy: { nome: "asc" } })
  ]);

  if (!corretor) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <p className="text-sm text-red-600">
          Não encontrei seu cadastro de parceiro. Avise um administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <Link href="/portal" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar
      </Link>

      <div className="max-w-3xl">
        <div className="text-lg font-bold text-gray-900 mb-1">Elaboração de Contrato de Gestão</div>
        <p className="text-xs text-gray-500 mb-6">
          Preencha os dados do cliente e do imóvel. Só o primeiro cliente cadastrado aparece no corpo do
          contrato — os demais (se houver) entram só no bloco de assinatura.
        </p>

        <PortalGestaoForm
          corretor={{ id: corretor.id, nome: corretor.nome, creci: corretor.creci, cpf: corretor.cpf }}
          estados={estados.map((e) => ({ id: e.id, nome: e.nome }))}
          cidades={cidades.map((c) => ({ id: c.id, nome: c.nome, estado_id: c.estado_id }))}
        />
      </div>
    </div>
  );
}
