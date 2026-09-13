import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalPropostaForm } from "@/components/portal-proposta-form";
import { formatCpf, formatCnpj, formatValorEditavel } from "@/lib/format";

export const dynamic = "force-dynamic";

// Edição de uma Proposta de Compra e Venda já gerada (13/09/2026 — antes só
// dava pra criar; corrigir um valor ou o endereço do imóvel exigia gerar
// outra do zero). Reaproveita o mesmo formulário de criação
// (PortalPropostaForm), só que pré-preenchido e com o modo de envio trocado
// (ver `propostaId`/`valoresIniciais` no componente).
export default async function PortalPropostaEditarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePortalSession();

  const [corretor, proposta, clientesDoCorretor, bancos, estados, cidades] = await Promise.all([
    prisma.parceiros.findUnique({
      where: { id: session.parceiroId },
      select: { id: true, nome: true, creci: true, cpf: true }
    }),
    prisma.propostas.findUnique({ where: { id }, include: { clientes: true } }),
    prisma.clientes.findMany({
      where: { parceiro_id: session.parceiroId },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, cpf: true, cnpj: true }
    }),
    prisma.bancos.findMany({ orderBy: { nome: "asc" } }),
    prisma.estados.findMany({ orderBy: { nome: "asc" } }),
    prisma.cidades.findMany({ orderBy: { nome: "asc" } })
  ]);

  if (!proposta || proposta.parceiro_id !== session.parceiroId) {
    notFound();
  }

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

  const cliente = proposta.clientes;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href={`/portal/proposta/${proposta.id}`} className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar pra proposta
        </Link>

        <div className="text-lg font-bold text-gray-900 mb-1">Editar proposta</div>
        <p className="text-xs text-gray-500 mb-6">
          Altere o que precisar e gere de novo — fica um novo arquivo, o anterior continua salvo.
        </p>

        <PortalPropostaForm
          corretor={{ id: corretor.id, nome: corretor.nome, creci: corretor.creci, cpf: corretor.cpf }}
          clientesDoCorretor={clientesDoCorretor.map((c) => ({
            id: c.id,
            nome: c.nome,
            cpfCnpj: c.cpf ? formatCpf(c.cpf) : c.cnpj ? formatCnpj(c.cnpj) : ""
          }))}
          bancos={bancos.map((b) => ({ id: b.id, nome: b.nome, codigo: b.codigo }))}
          estados={estados.map((e) => ({ id: e.id, nome: e.nome }))}
          cidades={cidades.map((c) => ({ id: c.id, nome: c.nome, estado_id: c.estado_id }))}
          propostaId={proposta.id}
          valoresIniciais={{
            clienteId: cliente.id,
            clienteNome: cliente.nome,
            clienteCpfCnpj: cliente.cnpj ? formatCnpj(cliente.cnpj) : cliente.cpf ? formatCpf(cliente.cpf) : "",
            descricao: proposta.descricao ?? "",
            rua: proposta.rua ?? "",
            numero: proposta.numero ?? "",
            complemento: proposta.complemento ?? "",
            bairro: proposta.bairro ?? "",
            cidade: proposta.cidade ?? "",
            estado: proposta.estado ?? "",
            valorProposta: formatValorEditavel(proposta.valor_proposta),
            formaPagamento: proposta.forma_pagamento ?? "",
            dataFechamento: proposta.data_fechamento.toISOString().slice(0, 10)
          }}
        />
      </div>
    </div>
  );
}
