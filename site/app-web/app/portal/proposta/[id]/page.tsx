import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { formatMoeda, formatData, formatDataCalendario, formatCpf, formatCnpj } from "@/lib/format";
import { resolverUrlDocumentoGerado } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Detalhe de uma Proposta de Compra e Venda — pedido do usuário (13/09/2026:
// "só conseguimos observar poucos detalhes" na lista). Mostra tudo que foi
// digitado + link pra baixar o último .docx gerado (sempre um novo arquivo a
// cada gerar/editar, nunca sobrescreve — pega o mais recente com sucesso em
// `documentos_gerados`) + atalho pra editar.
export default async function PortalPropostaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePortalSession();

  const proposta = await prisma.propostas.findUnique({
    where: { id },
    include: { clientes: true }
  });

  // Mesmo padrão do resto do portal (ver app/portal/financeiro/actions.ts):
  // 404 tanto pra proposta inexistente quanto pra proposta de outro corretor
  // — não dá pra diferenciar isso pra quem está de fora sem vazar que o
  // registro existe.
  if (!proposta || proposta.parceiro_id !== session.parceiroId) {
    notFound();
  }

  const ultimoDocumento = await prisma.documentos_gerados.findFirst({
    where: { entidade_tipo: "proposta", entidade_id: id, status: "Sucesso" },
    orderBy: { gerado_em: "desc" }
  });
  const url = ultimoDocumento ? await resolverUrlDocumentoGerado(ultimoDocumento) : null;

  const cliente = proposta.clientes;
  const enderecoImovel =
    [proposta.rua, proposta.numero].filter(Boolean).join(", ") +
    (proposta.complemento ? ` - ${proposta.complemento}` : "") +
    (proposta.bairro ? ` - ${proposta.bairro}` : "") +
    (proposta.cidade ? ` - ${proposta.cidade}` : "") +
    (proposta.estado ? `/${proposta.estado}` : "");

  const Linha = ({ label, valor }: { label: string; valor: string | null | undefined }) => (
    <div>
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="text-xs text-gray-800 mt-0.5">{valor || "—"}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/portal/proposta" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar
        </Link>

        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <div className="text-lg font-bold text-gray-900">
            {proposta.descricao || enderecoImovel.trim() || "Proposta"}
          </div>
          <Link
            href={`/portal/proposta/${proposta.id}/editar`}
            className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold hover:opacity-90"
          >
            Editar
          </Link>
        </div>
        <p className="text-xs text-gray-500 mb-4">Gerada em {formatDataCalendario(proposta.created_at)}.</p>

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
          <div className="text-sm font-bold text-gray-800 mb-3">Cliente (comprador/interessado)</div>
          <div className="grid md:grid-cols-2 gap-3">
            <Linha label="Nome" valor={cliente.nome} />
            <Linha
              label={cliente.tipo_cliente === "Pessoa Jurídica" ? "CNPJ" : "CPF"}
              valor={cliente.cnpj ? formatCnpj(cliente.cnpj) : cliente.cpf ? formatCpf(cliente.cpf) : null}
            />
            <Linha label="Estado civil" valor={cliente.estado_civil} />
            <Linha label="Profissão" valor={cliente.profissao} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
          <div className="text-sm font-bold text-gray-800 mb-3">Imóvel</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Linha label="Descrição" valor={proposta.descricao} />
            </div>
            <div className="md:col-span-2">
              <Linha label="Endereço" valor={enderecoImovel.trim() || null} />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
          <div className="text-sm font-bold text-gray-800 mb-3">Valor e condições</div>
          <div className="grid md:grid-cols-2 gap-3">
            <Linha label="Valor da proposta" valor={formatMoeda(proposta.valor_proposta)} />
            <Linha label="Data da proposta" valor={formatData(proposta.data_fechamento)} />
            <div className="md:col-span-2">
              <div className="text-[11px] text-gray-400">Forma de pagamento</div>
              <div className="text-xs text-gray-800 mt-0.5 whitespace-pre-line">{proposta.forma_pagamento || "—"}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold hover:opacity-90"
            >
              Baixar última proposta gerada
            </a>
          ) : (
            <span className="text-xs text-gray-400">Nenhum documento disponível — gere de novo em Editar.</span>
          )}
          <Link
            href={`/portal/proposta/${proposta.id}/editar`}
            className="text-xs border border-gray-300 text-gray-700 rounded-lg px-4 py-2 font-semibold hover:bg-gray-50"
          >
            Editar proposta
          </Link>
        </div>
      </div>
    </div>
  );
}
