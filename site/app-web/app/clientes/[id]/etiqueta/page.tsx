import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { ClienteEtiqueta, type DadosClienteEtiqueta } from "@/components/cliente-etiqueta";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { acessosDaSessao, nivelEmModulos } from "@/lib/acessos";
import { FUNCOES_CORRETOR } from "@/lib/transacoes/opcoes";
import { formatTelefone } from "@/lib/format";
import { etapaDoCliente } from "@/lib/clientes/funil-servidor";
import { carregarVinculosCliente } from "@/lib/clientes/vinculos-servidor";
import { moverClienteFunilAction, registrarContatoClienteAction, transferirClienteAction } from "../../funil-actions";

export const dynamic = "force-dynamic";

// Etiqueta do cliente: a etapa do quadro, os vínculos, o gerador de WhatsApp e o histórico de
// contatos numa tela só (mesmo desenho das etiquetas do Financiamento e do Recrutamento).
export default async function EtiquetaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requireAdminSession();
  const { id } = await params;

  const [cliente, etapa, vinculos, contatos, remetentes, corretoresAtivos] = await Promise.all([
    prisma.clientes.findUnique({
      where: { id },
      select: { id: true, id_legado: true, nome: true, telefone: true, email: true, created_at: true, status_cadastro: true, parceiro_id: true, parceiros: { select: { nome: true, funcao: true, status_funcao: true } } }
    }),
    etapaDoCliente(id),
    carregarVinculosCliente(id),
    prisma.clientes_contatos.findMany({ where: { cliente_id: id }, orderBy: { data: "desc" }, take: 100 }),
    prisma.parceiros.findMany({
      where: { funcao: { in: ["Administrativo", "Corretor"] }, status_funcao: "Ativo" },
      orderBy: [{ funcao: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true }
    }),
    // quem pode receber clientes: só Corretor e Corretor Estagiário em atividade
    prisma.parceiros.findMany({
      where: { funcao: { in: FUNCOES_CORRETOR }, status_funcao: "Ativo" },
      orderBy: [{ funcao: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true, funcao: true }
    })
  ]);
  if (!cliente || !etapa) notFound();

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
    corretorNome: cliente.parceiros?.nome ?? null,
    corretorId: cliente.parceiro_id,
    corretorAtivo: !!cliente.parceiros && FUNCOES_CORRETOR.includes(cliente.parceiros.funcao) && cliente.parceiros.status_funcao === "Ativo",
    criadoEm: cliente.created_at.toISOString(),
    etapa: etapa.derivacao.etapa,
    motivo: etapa.derivacao.motivo,
    papeis: etapa.derivacao.papeis,
    voltaParaLeads: etapa.derivacao.voltaParaLeads,
    atendimentoDesde: etapa.atendimentoDesde ? etapa.atendimentoDesde.toISOString() : null,
    imovelReferencia: vinculos.imovelReferencia
  };

  return (
    <div>
      <Topbar />
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <Link href="/clientes/funil" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para o Kanban de Clientes
        </Link>
      </div>
      <ClienteEtiqueta
        d={dados}
        vinculos={vinculos.vinculos}
        contatosIniciais={contatos.map((c) => ({
          id: c.id,
          tipo: c.tipo,
          resultado: c.resultado,
          nota: c.nota,
          data: c.data.toISOString(),
          por: c.por_parceiro_id ? (quem.get(c.por_parceiro_id) ?? null) : null
        }))}
        remetentes={remetentes}
        remetenteLogado={{ id: sessao.parceiroId, primeiroNome: (sessao.nome ?? "").trim().split(/\s+/)[0] ?? "" }}
        // transferir cliente: só quem edita Clientes (acesso Administrativo ou Diretor)
        podeTransferir={nivelEmModulos(acessosDaSessao(sessao), ["clientes"]) === "editar"}
        corretoresParaTransferir={corretoresAtivos}
        acoes={{ mover: moverClienteFunilAction, registrarContato: registrarContatoClienteAction, transferir: transferirClienteAction }}
      />
    </div>
  );
}
