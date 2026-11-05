import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { ClienteEtiqueta, type DadosClienteEtiqueta } from "@/components/cliente-etiqueta";
import { ClienteComplementoForm } from "@/components/cliente-complemento-form";
import { prisma } from "@/lib/prisma";
import { formatTelefone } from "@/lib/format";
import { etapaDoCliente } from "@/lib/clientes/funil-servidor";
import { carregarVinculosCliente } from "@/lib/clientes/vinculos-servidor";
import { clienteParaFormulario } from "@/lib/financiamento/avaliacao-credito-servidor";
import { complementarClienteAction, listasFormularioClienteAction, registrarContatoPortalAction } from "../actions";

export const dynamic = "force-dynamic";

// Etiqueta do cliente no portal do corretor: só dos clientes dele. Acompanhar (WhatsApp, vínculos,
// contatos e notas) e complementar os dados; o primeiro movimento tira o cliente do estado "novo para você".
export default async function PortalEtiquetaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortalSession();
  const { id } = await params;

  const cliente = await prisma.clientes.findUnique({ where: { id } });
  if (!cliente || cliente.parceiro_id !== session.parceiroId) notFound();

  const [etapa, vinculos, contatos] = await Promise.all([
    etapaDoCliente(id),
    carregarVinculosCliente(id),
    prisma.clientes_contatos.findMany({ where: { cliente_id: id }, orderBy: { data: "desc" }, take: 100 })
  ]);
  if (!etapa) notFound();

  const quem = new Map(
    (await prisma.parceiros.findMany({ where: { id: { in: [...new Set(contatos.map((c) => c.por_parceiro_id).filter((x): x is string => !!x))] } }, select: { id: true, nome: true } })).map((p) => [p.id, p.nome])
  );

  const dados: DadosClienteEtiqueta = {
    id: cliente.id,
    idLegado: cliente.id_legado,
    nome: cliente.nome,
    telefone: cliente.telefone ? formatTelefone(cliente.telefone) : null,
    telefoneDigitos: (cliente.telefone ?? "").replace(/\D/g, "") || null,
    email: cliente.email,
    corretorNome: session.nome,
    corretorId: session.parceiroId,
    corretorAtivo: true,
    criadoEm: cliente.created_at.toISOString(),
    etapa: etapa.derivacao.etapa,
    motivo: etapa.derivacao.motivo,
    papeis: etapa.derivacao.papeis,
    voltaParaLeads: etapa.derivacao.voltaParaLeads,
    atendimentoDesde: etapa.atendimentoDesde ? etapa.atendimentoDesde.toISOString() : null,
    imovelReferencia: vinculos.imovelReferencia,
    repasseDesde: cliente.repasse_desde ? cliente.repasse_desde.toISOString() : null
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Link href="/portal/clientes" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar para meus clientes
        </Link>

        <ClienteEtiqueta
          d={dados}
          modoCorretor
          // no portal os vínculos são só para consulta (as telas do administrativo não abrem para o corretor)
          vinculos={vinculos.vinculos.map((v) => ({ ...v, href: null }))}
          contatosIniciais={contatos.map((c) => ({
            id: c.id,
            tipo: c.tipo,
            resultado: c.resultado,
            nota: c.nota,
            data: c.data.toISOString(),
            por: c.por_parceiro_id ? (quem.get(c.por_parceiro_id) ?? null) : null
          }))}
          remetentes={[]}
          remetenteLogado={{ id: session.parceiroId, primeiroNome: (session.nome ?? "").trim().split(/\s+/)[0] ?? "" }}
          extra={<ClienteComplementoForm clienteInicial={clienteParaFormulario(cliente)} carregarListas={listasFormularioClienteAction} salvar={complementarClienteAction} />}
          acoes={{ registrarContato: registrarContatoPortalAction }}
        />
      </div>
    </div>
  );
}
