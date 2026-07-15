import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalCompraVendaForm } from "@/components/portal-compra-venda-form";
import { listarImoveisParaCompraVenda, listarClientesParaCompraVenda } from "@/lib/transacoes/buscas";
import { FUNCOES_CORRETOR } from "@/lib/transacoes/opcoes";

export const dynamic = "force-dynamic";
// Cadastrar "tudo do zero" (comprador + vendedor + imóvel novos) numa
// transação só faz várias consultas em sequência e ainda manda o email de
// resumo pro administrativo — com o limite padrão de tempo de função do
// Vercel isso podia estourar antes de terminar, e a tela ficava parada sem
// avisar nada. Isso também estende o tempo pra Server Action chamada desta
// página (gerarCompraVendaAction).
export const maxDuration = 30;

// Formulário "Elaboração de Compra e Venda" — o corretor puxa um imóvel já
// captado (de qualquer corretor da imobiliária, não só o dele) e um ou mais
// clientes compradores (idem), e cadastra a transação de verdade com status
// "Elaboração do Contrato de Compra e Venda". Não gera documento nenhum —
// só cadastra, pro ADM assumir dali pra frente (inclusive a divisão do
// comissionamento entre os corretores).
export default async function PortalCompraVendaNovoPage() {
  const session = await requirePortalSession();

  const [corretor, lojas, corretores, parceirosTodos, imoveis, clientes, estados, cidades] = await Promise.all([
    prisma.parceiros.findUnique({
      where: { id: session.parceiroId },
      select: { id: true, nome: true }
    }),
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.parceiros.findMany({
      where: { funcao: { in: FUNCOES_CORRETOR }, status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    // Parceiro externo (parceria fora da imobiliária) não precisa ter função
    // de Corretor — mesma lista ampla usada no formulário do admin
    // (components/transacao-form.tsx).
    prisma.parceiros.findMany({
      where: { status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    listarImoveisParaCompraVenda(session.parceiroId),
    listarClientesParaCompraVenda(session.parceiroId),
    // Usados só quando o corretor cadastra um imóvel novo (não existia
    // ainda no sistema) — mesmo padrão do formulário de Administração.
    prisma.estados.findMany({ orderBy: { nome: "asc" } }),
    prisma.cidades.findMany({ orderBy: { nome: "asc" } })
  ]);

  if (!corretor) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PortalHeader nome={session.nome} />
        <div className="max-w-3xl mx-auto px-4 py-6">
          <p className="text-sm text-red-600">Não encontrei seu cadastro de parceiro. Avise um administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/portal" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar
        </Link>

        <div className="text-lg font-bold text-gray-900 mb-1">Elaboração de Compra e Venda</div>
        <p className="text-xs text-gray-500 mb-6">
          Puxe o imóvel (de qualquer captação da imobiliária) e o(s) cliente(s) comprador(es), preencha os
          dados do negócio e cadastre a transação. Não gera contrato nenhum aqui — isso fica com o
          administrativo, junto com a divisão do comissionamento entre os corretores.
        </p>

        <PortalCompraVendaForm
          corretorLogadoId={corretor.id}
          lojas={lojas.map((l) => ({ id: l.id, nome: l.nome }))}
          corretores={corretores}
          parceirosTodos={parceirosTodos}
          imoveis={imoveis}
          clientes={clientes}
          estados={estados.map((e) => ({ id: e.id, nome: e.nome }))}
          cidades={cidades.map((c) => ({ id: c.id, nome: c.nome, estado_id: c.estado_id }))}
        />
      </div>
    </div>
  );
}
