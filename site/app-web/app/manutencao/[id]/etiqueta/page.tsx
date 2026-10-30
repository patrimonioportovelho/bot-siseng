import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { formatMoeda } from "@/lib/format";
import { ManutencaoEtiqueta, type DadosMan } from "@/components/manutencao-etiqueta";
import { labelTipoServico } from "@/lib/manutencao/opcoes";
import {
  adicionarNotaRapidaAction,
  moverColunaAction,
  registrarContatoManutencaoAction,
  salvarCampoManutencaoAction
} from "../../actions";

export const dynamic = "force-dynamic";

function dinheiro(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? formatMoeda(n) : null;
}

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
        checklist_itens: { select: { done: true } },
        atividades: { where: { feito: false }, orderBy: { data: "asc" }, take: 3, select: { titulo: true, data: true } },
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
    servico: labelTipoServico(m.tipo_servico),
    urgencia: m.urgencia,
    coluna: m.coluna,
    desde: (m.coluna_atualizada_em ?? m.updated_at).toISOString(),
    imovelId: m.imoveis.id,
    imovelIdLegado: m.imoveis.id_legado,
    endereco: m.imoveis.endereco,
    proprietario: m.clientes ? { nome: m.clientes.nome, telefone: m.clientes.telefone } : null,
    prestadorId: m.prestador_id,
    autorizadoPor: m.autorizado_por,
    custoEstimado: dinheiro(m.custo_estimado),
    custoFinal: dinheiro(m.custo_final),
    chavePosse: m.chave_posse,
    chaveCom: m.chave_com,
    checklist: { feitos: m.checklist_itens.filter((i) => i.done).length, total: m.checklist_itens.length },
    proximasAtividades: m.atividades.map((a) => ({
      titulo: a.titulo,
      data: a.data.toISOString().slice(8, 10) + "/" + a.data.toISOString().slice(5, 7)
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
        acoes={{
          moverColuna: moverColunaAction,
          salvarCampo: salvarCampoManutencaoAction,
          adicionarNota: adicionarNotaRapidaAction,
          registrarContato: registrarContatoManutencaoAction
        }}
      />
    </div>
  );
}
