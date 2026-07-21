import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalPropostaForm } from "@/components/portal-proposta-form";
import { formatCpf, formatCnpj } from "@/lib/format";

export const dynamic = "force-dynamic";
// Mesmo motivo do portal de Compra e Venda (ver comentário lá): cadastro
// "tudo do zero" faz várias consultas em sequência e ainda gera o
// documento — estende o tempo antes do timeout padrão da função.
export const maxDuration = 30;

// Formulário "Proposta de Compra e Venda" — mesma restrição de acesso do
// Contrato de Gestão (só corretor logado no portal, email @remax.com.br +
// função Corretor, ver lib/portal-auth.ts). Diferente da Gestão, o imóvel
// aqui é sempre texto livre (nunca vira registro em `imoveis`) — a proposta
// normalmente é sobre imóvel externo, sem proprietário cadastrado no
// sistema. Só o cliente (comprador/interessado) é reaproveitado/cadastrado
// do jeito de sempre, pra evitar duplicidade.
export default async function PortalPropostaNovoPage() {
  const session = await requirePortalSession();

  const [corretor, clientesDoCorretor, bancos] = await Promise.all([
    prisma.parceiros.findUnique({
      where: { id: session.parceiroId },
      select: { id: true, nome: true, creci: true, cpf: true }
    }),
    prisma.clientes.findMany({
      where: { parceiro_id: session.parceiroId },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        cpf: true,
        cnpj: true,
        endereco: true,
        estado_civil: true,
        profissao: true,
        cat_profissao: true
      }
    }),
    // Dados bancários — mesmo cadastro completo do administrativo (ver
    // components/cliente-form.tsx), liberado aqui pro corretor já deixar o
    // cliente novo com a conta certinha desde o cadastro.
    prisma.bancos.findMany({ orderBy: { nome: "asc" } })
  ]);

  if (!corretor) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PortalHeader nome={session.nome} />
        <div className="max-w-3xl mx-auto px-4 py-6">
          <p className="text-sm text-red-600">
            Não encontrei seu cadastro de parceiro. Avise um administrador.
          </p>
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

        <div className="text-lg font-bold text-gray-900 mb-1">Proposta de Compra e Venda</div>
        <p className="text-xs text-gray-500 mb-6">
          Preencha os dados do cliente e do imóvel. O imóvel não é cadastrado no sistema — é usado só
          para preencher o documento, já que a proposta normalmente é sobre um imóvel externo.
        </p>

        <PortalPropostaForm
          corretor={{ id: corretor.id, nome: corretor.nome, creci: corretor.creci, cpf: corretor.cpf }}
          clientesDoCorretor={clientesDoCorretor.map((c) => ({
            id: c.id,
            nome: c.nome,
            cpfCnpj: c.cpf ? formatCpf(c.cpf) : c.cnpj ? formatCnpj(c.cnpj) : "",
            endereco: c.endereco ?? "",
            estadoCivil: c.estado_civil ?? "",
            profissao: c.profissao ?? c.cat_profissao ?? ""
          }))}
          bancos={bancos.map((b) => ({ id: b.id, nome: b.nome, codigo: b.codigo }))}
        />
      </div>
    </div>
  );
}
