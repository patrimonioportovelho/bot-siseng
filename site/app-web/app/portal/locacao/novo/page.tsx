import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalLocacaoForm } from "@/components/portal-locacao-form";
import { listarImoveisParaCompraVenda, listarClientesParaCompraVenda } from "@/lib/transacoes/buscas";
import { FUNCOES_CORRETOR } from "@/lib/transacoes/opcoes";

export const dynamic = "force-dynamic";
// Mesmo motivo dos outros formulários "tudo do zero" do portal (ver
// comentário em app/portal/compra-venda/novo/page.tsx): várias consultas em
// sequência + upload de documento + email podem passar do timeout padrão.
export const maxDuration = 30;

// Formulário "Elaboração de Locação" — duas origens possíveis pro
// imóvel/proprietário:
// 1. Através de uma Administração já cadastrada com status Ativo (imóvel e
//    proprietário vêm dela automaticamente; ao cadastrar, a administração
//    passa sozinha de Ativo para Locado).
// 2. Sem administração: o corretor escolhe um imóvel já captado por
//    qualquer corretor da imobiliária (que não tenha uma administração
//    ativa — esse precisa passar pela opção 1) ou cadastra um imóvel novo
//    com o(s) proprietário(s).
// Não gera contrato nenhum aqui — só cadastra a transação de verdade (status
// "Elaboração de Contrato de Locação" ou "Imóvel em locação sem
// administração"), pro administrativo gerar o documento e dar sequência.
export default async function PortalLocacaoNovoPage() {
  const session = await requirePortalSession();

  const [
    corretor,
    lojas,
    corretores,
    parceirosTodos,
    imoveis,
    clientes,
    estados,
    cidades,
    bancos,
    admImoveisAtivos,
    bairrosCadastrados
  ] = await Promise.all([
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
      prisma.parceiros.findMany({
        where: { status_funcao: "Ativo" },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true }
      }),
      listarImoveisParaCompraVenda(session.parceiroId),
      listarClientesParaCompraVenda(session.parceiroId),
      prisma.estados.findMany({ orderBy: { nome: "asc" } }),
      prisma.cidades.findMany({ orderBy: { nome: "asc" } }),
      prisma.bancos.findMany({ orderBy: { nome: "asc" } }),
      // Só administrações com status Ativo podem virar uma locação em
      // "Elaboração de Contrato de Locação" — mesma regra do formulário de
      // Transações do admin (ver app/transacoes/novo/page.tsx).
      prisma.adm_imoveis.findMany({
        where: { status: "Ativo", excluido: false },
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          id_legado: true,
          parceiro_id: true,
          imovel_id: true,
          imoveis: { select: { endereco: true, inscricao: true } },
          clientes: { select: { nome: true } }
        }
      }),
      // Sugestão de bairro por cidade (EnumList) — a mesma lista sincronizada
      // usada no cadastro de imóvel do admin.
      prisma.imoveis.findMany({
        where: { excluido: false, bairro: { not: null }, cidade_id: { not: null } },
        select: { cidade_id: true, bairro: true },
        distinct: ["cidade_id", "bairro"]
      })
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

  const administracoes = admImoveisAtivos.map((a) => ({
    id: a.id,
    id_legado: a.id_legado,
    parceiroId: a.parceiro_id,
    imovelId: a.imovel_id,
    imovelEndereco: a.imoveis.endereco,
    imovelInscricao: a.imoveis.inscricao,
    clienteNome: a.clientes.nome
  }));

  const imoveisComAdmAtivaIds = administracoes.map((a) => a.imovelId);

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/portal" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar
        </Link>

        <div className="text-lg font-bold text-gray-900 mb-1">Elaboração de Locação</div>
        <p className="text-xs text-gray-500 mb-6">
          Escolha se a locação vem de uma Administração já Ativa (imóvel e proprietário automáticos) ou se é sem
          administração. Preencha os dados do negócio e cadastre a transação — não gera contrato nenhum aqui, isso
          fica com o administrativo, junto com a divisão do comissionamento entre os corretores.
        </p>

        <PortalLocacaoForm
          corretorLogadoId={corretor.id}
          lojas={lojas.map((l) => ({ id: l.id, nome: l.nome }))}
          corretores={corretores}
          parceirosTodos={parceirosTodos}
          imoveis={imoveis}
          clientes={clientes}
          administracoes={administracoes}
          imoveisComAdmAtivaIds={imoveisComAdmAtivaIds}
          estados={estados.map((e) => ({ id: e.id, nome: e.nome }))}
          cidades={cidades.map((c) => ({ id: c.id, nome: c.nome, estado_id: c.estado_id }))}
          bancos={bancos.map((b) => ({ id: b.id, nome: b.nome, codigo: b.codigo }))}
          bairrosCadastrados={bairrosCadastrados}
        />
      </div>
    </div>
  );
}
