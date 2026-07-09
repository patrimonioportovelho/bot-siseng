import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalGestaoForm } from "@/components/portal-gestao-form";

export const dynamic = "force-dynamic";

// Formulário "Elaboração de Contrato de Gestão" — só corretor logado no
// portal (email @remax.com.br + função Corretor, ver lib/portal-auth.ts)
// preenche isso. Os dados de cliente(s) e imóvel vão pro banco de verdade
// (mesmo padrão de cadastro do admin); o corretor em si vem sempre da
// própria sessão, sem poder escolher outro.
export default async function PortalGestaoNovoPage() {
  const session = await requirePortalSession();

  const [corretor, estados, cidades, clientesDoCorretor] = await Promise.all([
    prisma.parceiros.findUnique({
      where: { id: session.parceiroId },
      select: { id: true, nome: true, creci: true, cpf: true }
    }),
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

        <div className="text-lg font-bold text-gray-900 mb-1">Elaboração de Contrato de Gestão</div>
        <p className="text-xs text-gray-500 mb-6">
          Preencha os dados do cliente e do imóvel. Só o primeiro cliente cadastrado aparece no corpo do
          contrato — os demais (se houver) entram só no bloco de assinatura.
        </p>

        <PortalGestaoForm
          corretor={{ id: corretor.id, nome: corretor.nome, creci: corretor.creci, cpf: corretor.cpf }}
          estados={estados.map((e) => ({ id: e.id, nome: e.nome }))}
          cidades={cidades.map((c) => ({ id: c.id, nome: c.nome, estado_id: c.estado_id }))}
          clientesDoCorretor={clientesDoCorretor.map((c) => ({
            id: c.id,
            nome: c.nome,
            rg: c.rg ?? "",
            cpfCnpj: c.cpf ?? c.cnpj ?? "",
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
                valorVenda: v.imoveis.valor_venda != null ? String(v.imoveis.valor_venda) : "",
                matricula: v.imoveis.matricula ?? "",
                inscricaoMunicipal: v.imoveis.inscricao ?? "",
                endereco: v.imoveis.endereco ?? ""
              }))
          }))}
        />
      </div>
    </div>
  );
}
