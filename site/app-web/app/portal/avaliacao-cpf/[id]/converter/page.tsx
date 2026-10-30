import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalAvaliacaoCpfForm } from "@/components/portal-avaliacao-cpf-form";
import { prisma } from "@/lib/prisma";
import { clienteParaFormulario } from "@/lib/financiamento/avaliacao-credito-servidor";
import { respostasVazias } from "@/lib/financiamento/avaliacao-credito";

export const dynamic = "force-dynamic";
// Mesmo motivo do maxDuration em ../../novo/page.tsx (anexos + e-mail em after()).
export const maxDuration = 60;

// O corretor consultou o CPF antes e agora quer transformar a consulta em
// Avaliação de crédito: o cadastro do cliente volta preenchido para conferir e
// completar, ele responde as 3 perguntas e a etiqueta vai para "Montagem de
// processo" no Financiamento.
export default async function PortalAvaliacaoCpfConverterPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortalSession();
  const { id } = await params;

  const avaliacao = await prisma.avaliacoes.findUnique({
    where: { id },
    include: { clientes: true }
  });
  if (!avaliacao || avaliacao.excluido || avaliacao.parceiro_id !== session.parceiroId || !avaliacao.clientes) {
    notFound();
  }

  const [bancos, estados, cidades] = await Promise.all([
    prisma.bancos.findMany({ orderBy: { nome: "asc" } }),
    prisma.estados.findMany({ orderBy: { nome: "asc" } }),
    prisma.cidades.findMany({ orderBy: { nome: "asc" } })
  ]);

  const consulta = avaliacao.status === "Consulta de CPF";
  const donoDoCliente = avaliacao.clientes.parceiro_id === session.parceiroId;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/portal/avaliacao-cpf" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar para minhas avaliações
        </Link>

        <div className="text-lg font-bold text-gray-900 mb-1">Transformar em Avaliação de crédito</div>
        <p className="text-xs text-gray-500 mb-6">
          Cliente: <strong>{avaliacao.clientes.nome}</strong>. Confira o cadastro, complete o que faltar (identificação e
          contato são obrigatórios), responda as 3 perguntas e a etiqueta passa para Montagem de processo.
        </p>

        {!consulta ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
            Esta avaliação já está em <strong>{avaliacao.status}</strong> — só uma Consulta de CPF pode ser transformada em
            Avaliação de crédito.
          </div>
        ) : !donoDoCliente ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
            O cadastro deste cliente está em nome de outro corretor, então não dá para completá-lo por aqui. Fale com o
            administrativo.
          </div>
        ) : (
          <PortalAvaliacaoCpfForm
            clientesDisponiveis={[]}
            bancos={bancos.map((b) => ({ id: b.id, nome: b.nome, codigo: b.codigo }))}
            estados={estados.map((e) => ({ id: e.id, nome: e.nome }))}
            cidades={cidades.map((c) => ({ id: c.id, nome: c.nome, estado_id: c.estado_id }))}
            conversao={{ avaliacaoId: avaliacao.id, cliente: clienteParaFormulario(avaliacao.clientes), respostas: respostasVazias() }}
          />
        )}
      </div>
    </div>
  );
}
