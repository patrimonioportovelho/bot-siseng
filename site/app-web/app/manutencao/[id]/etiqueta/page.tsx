import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { hojeInputDate } from "@/lib/format";
import { ManutencaoEtiqueta, type DadosMan } from "@/components/manutencao-etiqueta";
import {
  adicionarChecklistRapidoAction,
  adicionarNotaRapidaAction,
  criarAtividadeRapidaAction,
  marcarAtividadeRapidaAction,
  marcarChecklistRapidoAction,
  moverColunaAction,
  registrarContatoManutencaoAction,
  removerAtividadeRapidaAction,
  removerChecklistRapidoAction,
  salvarCampoManutencaoAction
} from "../../actions";

export const dynamic = "force-dynamic";

// Etiqueta da Manutenção: o ticket inteiro numa tela, com mensagem de WhatsApp
// (proprietário, prestador ou inquilino), notas/contatos e salvamento
// automático. Mesmo desenho das etiquetas do Financiamento e do Recrutamento.
export default async function EtiquetaManutencaoPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requireAdminSession();
  const { id } = await params;

  const [m, prestadores, remetentes] = await Promise.all([
    prisma.manutencoes.findUnique({
      where: { id },
      include: {
        imoveis: { select: { id: true, id_legado: true, endereco: true } },
        clientes: { select: { nome: true, telefone: true } },
        checklist_itens: { orderBy: { ordem: "asc" }, select: { id: true, label: true, done: true } },
        atividades: { orderBy: { data: "asc" } },
        notas: { orderBy: { criado_em: "desc" }, take: 100 }
      }
    }),
    prisma.parceiros.findMany({
      where: { funcao: "Prestador de Serviço", status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, telefone: true }
    }),
    prisma.parceiros.findMany({
      where: { funcao: { in: ["Administrativo", "Corretor"] }, status_funcao: "Ativo" },
      orderBy: [{ funcao: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true }
    })
  ]);
  if (!m || m.excluido) notFound();

  const dados: DadosMan = {
    id: m.id,
    titulo: m.titulo,
    tipoServico: m.tipo_servico,
    urgencia: m.urgencia,
    solicitadoPor: m.solicitado_por,
    coluna: m.coluna,
    desde: (m.coluna_atualizada_em ?? m.updated_at).toISOString(),
    imovelId: m.imoveis.id,
    imovelIdLegado: m.imoveis.id_legado,
    endereco: m.imoveis.endereco,
    proprietario: m.clientes ? { nome: m.clientes.nome, telefone: m.clientes.telefone } : null,
    prestadorId: m.prestador_id,
    chavePosse: m.chave_posse,
    chaveCom: m.chave_com,
    chaveAtualizadaEm: m.chave_atualizado_em ? m.chave_atualizado_em.toISOString() : null,
    checklist: m.checklist_itens,
    atividades: m.atividades.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      titulo: a.titulo,
      data: a.data.toISOString().slice(0, 10),
      feito: a.feito,
      notas: a.notas
    })),
    notas: m.notas.map((n) => ({ id: n.id, texto: n.texto, criadoEm: n.criado_em.toISOString() }))
  };

  return (
    <div>
      <Topbar />
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <Link href="/manutencao" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para o quadro de Manutenção
        </Link>
      </div>
      <ManutencaoEtiqueta
        d={dados}
        prestadores={prestadores}
        remetentes={remetentes}
        remetenteLogado={{ id: sessao.parceiroId, primeiroNome: (sessao.nome ?? "").trim().split(/\s+/)[0] ?? "" }}
        agoraMs={Date.now()}
        hoje={hojeInputDate()}
        acoes={{
          moverColuna: moverColunaAction,
          salvarCampo: salvarCampoManutencaoAction,
          adicionarNota: adicionarNotaRapidaAction,
          registrarContato: registrarContatoManutencaoAction,
          adicionarChecklist: adicionarChecklistRapidoAction,
          marcarChecklist: marcarChecklistRapidoAction,
          removerChecklist: removerChecklistRapidoAction,
          criarAtividade: criarAtividadeRapidaAction,
          marcarAtividade: marcarAtividadeRapidaAction,
          removerAtividade: removerAtividadeRapidaAction
        }}
      />
    </div>
  );
}
