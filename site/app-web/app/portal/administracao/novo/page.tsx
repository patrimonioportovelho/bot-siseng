import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalAdministracaoForm } from "@/components/portal-administracao-form";
import { formatCpf, formatCnpj } from "@/lib/format";

export const dynamic = "force-dynamic";
// Mesmo motivo do portal de Compra e Venda (ver comentário lá): cadastro
// "tudo do zero" faz várias consultas em sequência e ainda gera o
// documento — estende o tempo antes do timeout padrão da função.
export const maxDuration = 30;

// Formulário "Elaboração de Contrato de Administração" — só corretor logado
// no portal (email @remax.com.br + função Corretor, ver lib/portal-auth.ts)
// preenche isso. Mesmo padrão do Contrato de Gestão: os dados de
// cliente(s)/imóvel vão pro banco de verdade (mesmo cadastro que o
// administrativo usa em "Nova administração"); o corretor em si vem sempre
// da própria sessão, sem poder escolher outro. Diferente da Gestão, aqui não
// se gera documento nenhum — só cadastra a administração (status Captação)
// pro administrativo assumir dali pra frente.
export default async function PortalAdministracaoNovoPage() {
  const session = await requirePortalSession();

  const [corretor, lojas, estados, cidades, clientesDoCorretor] = await Promise.all([
    prisma.parceiros.findUnique({
      where: { id: session.parceiroId },
      select: { id: true, nome: true, creci: true, cpf: true }
    }),
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.estados.findMany({ orderBy: { nome: "asc" } }),
    prisma.cidades.findMany({ orderBy: { nome: "asc" } }),
    // Clientes que esse corretor já cadastrou antes (por ele mesmo, via
    // portal ou pelo admin) — oferecido no formulário pra evitar cadastro
    // duplicado do mesmo cliente a cada novo contrato. Junto de cada um já
    // vêm os imóveis que ele tem cadastrados, pro corretor poder reaproveitar
    // em vez de cadastrar o mesmo imóvel de novo.
    prisma.clientes.findMany({
      where: { parceiro_id: session.parceiroId },
      orderBy: { nome: "asc" },
      include: {
        imoveis_proprietarios: {
          include: { imoveis: true }
        }
      }
    })
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

        <div className="text-lg font-bold text-gray-900 mb-1">Elaboração de Contrato de Administração</div>
        <p className="text-xs text-gray-500 mb-6">
          Preencha os dados do(s) proprietário(s) e do imóvel. A administração entra no quadro do
          administrativo com status <strong>Captação</strong> — é o administrativo quem avança o status e gera o
          contrato para assinatura.
        </p>

        <PortalAdministracaoForm
          corretor={{ id: corretor.id, nome: corretor.nome, creci: corretor.creci, cpf: corretor.cpf }}
          lojas={lojas.map((l) => ({ id: l.id, nome: l.nome }))}
          estados={estados.map((e) => ({ id: e.id, nome: e.nome }))}
          cidades={cidades.map((c) => ({ id: c.id, nome: c.nome, estado_id: c.estado_id }))}
          clientesDoCorretor={clientesDoCorretor.map((c) => ({
            id: c.id,
            nome: c.nome,
            rg: c.rg ?? "",
            cpfCnpj: c.cpf ? formatCpf(c.cpf) : c.cnpj ? formatCnpj(c.cnpj) : "",
            endereco: c.endereco ?? "",
            nacionalidade: c.nacionalidade ?? "",
            estadoCivil: c.estado_civil ?? "",
            email: c.email ?? "",
            telefone: c.telefone ?? "",
            imoveis: c.imoveis_proprietarios
              .filter((v) => !v.imoveis.excluido)
              .map((v) => ({
                id: v.imoveis.id,
                tipoImovel: v.imoveis.tipo_imovel ?? "",
                rua: v.imoveis.rua ?? "",
                nPredial: v.imoveis.n_predial ?? "",
                complemento: v.imoveis.complemento ?? "",
                bairro: v.imoveis.bairro ?? "",
                estadoId: v.imoveis.estado_id ?? "",
                cidadeId: v.imoveis.cidade_id ?? "",
                matricula: v.imoveis.matricula ?? "",
                inscricao: v.imoveis.inscricao ?? "",
                endereco: v.imoveis.endereco ?? ""
              }))
          }))}
        />
      </div>
    </div>
  );
}
