import Link from "next/link";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PublicacaoCard } from "@/components/site/publicacao-card";
import { formatMoeda, situacaoVencimento, STATUS_TRANSACAO_EM_ABERTO } from "@/lib/format";
import { STATUS_AVALIACAO_ATIVOS, STATUS_AVALIACAO_ENCERRADOS } from "@/lib/financiamento/opcoes";

const IMOBVIEW_URL = "https://www.imobview.pro/login";

// Dias de antecedência pro alerta de vencimento das Avaliações aprovadas —
// mesma janela usada em /financiamento (lib/financiamento, DIAS_ALERTA_VALIDADE).
const DIAS_ALERTA_VALIDADE = 30;

export const dynamic = "force-dynamic";

function Kpi({
  label,
  value,
  sub,
  tone
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "azul" | "verde" | "roxo" | "ambar" | "vermelho";
}) {
  const cores: Record<string, string> = {
    azul: "bg-blue-50 border-blue-100 text-blue-700",
    verde: "bg-green-50 border-green-100 text-green-700",
    roxo: "bg-indigo-50 border-indigo-100 text-indigo-700",
    ambar: "bg-amber-50 border-amber-100 text-amber-700",
    vermelho: "bg-red-50 border-red-100 text-red-700"
  };
  const classe = tone ? cores[tone] : "bg-white border-gray-200 text-gray-900";
  return (
    <div className={`rounded-xl border p-3 ${classe}`}>
      <div className={`text-xs ${tone ? "" : "text-gray-500"}`}>{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] opacity-70 mt-0.5">{sub}</div>}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{titulo}</div>
      {children}
    </div>
  );
}

// Portal do corretor — desde a mudança pra login por email @remax.com.br +
// função Corretor (lib/portal-auth.ts), toda sessão aqui é de um corretor
// identificado (session.parceiroId sempre presente); não existe mais o
// acesso anônimo "sem identificação" que só via notícias.
//
// A tela principal era uma pilha de botões de ação — agora esses viraram o
// menu lateral (components/portal-sidebar.tsx, pedido do usuário: "menu
// lateral vertical igual do administrativo") e este espaço virou um mini
// dashboard com tudo que está no nome deste corretor como parceiro: clientes,
// imóveis, gestões, negócios (Compra e Venda/Locação), administrações,
// avaliações de crédito (Financiamento/Consulta de CPF) e honorários.
//
// O mural de notícias aqui usa a mesma tabela publicacoes_site do site
// público (/login), filtrando só quem foi marcado com "portal_corretor" em
// Configurações — antes disso existia uma tabela "noticias" separada, sem
// nenhuma tela de cadastro (só dava pra popular direto no banco).
export default async function PortalPage() {
  const session = await requirePortalSession();
  const pid = session.parceiroId;

  const [
    noticias,
    checklists,
    clientesQtd,
    imoveisQtd,
    gestoesQtd,
    gestoesEmCaptacaoQtd,
    propostasQtd,
    vendaTotal,
    vendaAbertas,
    locacaoTotal,
    locacaoAbertas,
    administracoesTotal,
    administracoesAtivas,
    avaliacoesPorStatus,
    avaliacoesAprovadas,
    honorariosRecebidos,
    honorariosPendentes
  ] = await Promise.all([
    prisma.publicacoes_site.findMany({
      where: { ativo: true, portal_corretor: true, tipo: { not: "Checklist" } },
      orderBy: { publicado_em: "desc" },
      take: 20
    }),
    // Checklists da imobiliária — mesma tabela publicacoes_site, reaproveitando
    // o formato de publicação (abre em /noticias/[id], dá pra copiar a
    // mensagem ou mandar direto no WhatsApp pro cliente).
    prisma.publicacoes_site.findMany({
      where: { ativo: true, portal_corretor: true, tipo: "Checklist" },
      orderBy: { titulo: "asc" }
    }),
    prisma.clientes.count({
      where: { parceiro_id: pid, OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] }
    }),
    prisma.imoveis.count({ where: { parceiro_id: pid, excluido: false } }),
    prisma.gestoes.count({ where: { parceiro_id: pid, excluido: false } }),
    prisma.gestoes.count({ where: { parceiro_id: pid, excluido: false, coluna: "captacao_exclusiva" } }),
    prisma.propostas.count({ where: { parceiro_id: pid } }),
    prisma.transacoes.count({
      where: { excluido: false, tipo: "Compra e Venda", OR: [{ corretor_proprietario_id: pid }, { corretor_contraparte_id: pid }] }
    }),
    prisma.transacoes.count({
      where: {
        excluido: false,
        tipo: "Compra e Venda",
        status: STATUS_TRANSACAO_EM_ABERTO,
        OR: [{ corretor_proprietario_id: pid }, { corretor_contraparte_id: pid }]
      }
    }),
    prisma.transacoes.count({
      where: { excluido: false, tipo: "Locação", OR: [{ corretor_proprietario_id: pid }, { corretor_contraparte_id: pid }] }
    }),
    prisma.transacoes.count({
      where: {
        excluido: false,
        tipo: "Locação",
        status: STATUS_TRANSACAO_EM_ABERTO,
        OR: [{ corretor_proprietario_id: pid }, { corretor_contraparte_id: pid }]
      }
    }),
    prisma.adm_imoveis.count({ where: { parceiro_id: pid, excluido: false } }),
    prisma.adm_imoveis.count({ where: { parceiro_id: pid, excluido: false, status: "Ativo" } }),
    prisma.avaliacoes.groupBy({
      by: ["status"],
      where: { parceiro_id: pid, excluido: false },
      _count: { _all: true }
    }),
    // Só as Aprovadas precisam do prazo de validade, pro alerta de vencimento
    // (mesma régua de 30 dias usada em /financiamento).
    prisma.avaliacoes.findMany({
      where: { parceiro_id: pid, excluido: false, status: "Aprovado" },
      select: { data_validade: true }
    }),
    prisma.pagamentos.aggregate({
      where: { parceiro_id: pid, status: "Pago" },
      _sum: { valor_parceiro: true },
      _count: true
    }),
    prisma.pagamentos.aggregate({
      where: { parceiro_id: pid, status: { not: "Pago" } },
      _sum: { valor_parceiro: true },
      _count: true
    })
  ]);

  // Link absoluto pro compartilhar (ShareButton/WhatsApp) funcionar mesmo
  // fora do portal — mesmo padrão usado em /login e /noticias/[id].
  const host = (await headers()).get("host");
  const baseUrl = `${host?.includes("localhost") ? "http" : "https"}://${host}`;

  // Avaliações agrupadas pelas mesmas 4 lentes que o usuário pediu pra ver:
  // Consulta de CPF (triagem inicial), Em andamento (o resto dos status
  // ativos), Aprovadas e Concluídas — encerradas (reprovada/cancelada/
  // vencida) entram só no total, não merecem destaque próprio aqui.
  const contarStatus = (status: string) => avaliacoesPorStatus.find((a) => a.status === status)?._count._all ?? 0;
  const consultaCpfQtd = contarStatus("Consulta de CPF");
  const aprovadoQtd = contarStatus("Aprovado");
  const concluidoQtd = contarStatus("Concluído");
  const emAndamentoQtd = STATUS_AVALIACAO_ATIVOS.filter((s) => s !== "Consulta de CPF" && s !== "Aprovado").reduce(
    (acc, s) => acc + contarStatus(s),
    0
  );
  const encerradoQtd = STATUS_AVALIACAO_ENCERRADOS.reduce((acc, s) => acc + contarStatus(s), 0);
  const avaliacoesTotalQtd = consultaCpfQtd + aprovadoQtd + concluidoQtd + emAndamentoQtd + encerradoQtd;

  const aprovadasVencendoQtd = avaliacoesAprovadas.filter((a) => {
    const sit = situacaoVencimento(a.data_validade, false, DIAS_ALERTA_VALIDADE);
    return sit === "alerta" || sit === "vencido";
  }).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="text-lg font-bold text-gray-900 mb-1">Seu painel</div>
        <p className="text-xs text-gray-500 mb-6">
          Um resumo rápido de tudo que está no seu nome: clientes, imóveis, negócios em andamento, avaliações de
          crédito e honorários. As ações pra criar um novo cadastro ficaram no menu ao lado.
        </p>

        <Secao titulo="Sua carteira">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Clientes" value={String(clientesQtd)} />
            <Kpi label="Imóveis captados" value={String(imoveisQtd)} />
            <Kpi
              label="Contratos de gestão"
              value={String(gestoesQtd)}
              sub={gestoesEmCaptacaoQtd > 0 ? `${gestoesEmCaptacaoQtd} em captação` : undefined}
            />
            <Kpi label="Propostas enviadas" value={String(propostasQtd)} />
          </div>
        </Secao>

        <Secao titulo="Negócios">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Kpi
              tone="azul"
              label="Compra e venda"
              value={`${vendaAbertas} em andamento`}
              sub={`${vendaTotal} no total`}
            />
            <Kpi tone="azul" label="Locação" value={`${locacaoAbertas} em andamento`} sub={`${locacaoTotal} no total`} />
            <Kpi
              tone="roxo"
              label="Administrações"
              value={`${administracoesAtivas} ativas`}
              sub={`${administracoesTotal} no total`}
            />
          </div>
        </Secao>

        <Secao titulo="Avaliações de crédito (Financiamento)">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi tone="ambar" label="Consulta de CPF" value={String(consultaCpfQtd)} sub="aguardando triagem" />
            <Kpi tone="azul" label="Em andamento" value={String(emAndamentoQtd)} />
            <Kpi
              tone="roxo"
              label="Aprovadas"
              value={String(aprovadoQtd)}
              sub={aprovadasVencendoQtd > 0 ? `${aprovadasVencendoQtd} vencendo em 30d` : undefined}
            />
            <Kpi tone="verde" label="Concluídas" value={String(concluidoQtd)} />
          </div>
          {avaliacoesTotalQtd === 0 && (
            <p className="text-[11px] text-gray-400 mt-2">Nenhuma avaliação de crédito cadastrada ainda.</p>
          )}
          {encerradoQtd > 0 && (
            <p className="text-[11px] text-gray-400 mt-2">
              + {encerradoQtd} encerrada{encerradoQtd > 1 ? "s" : ""} (reprovada, cancelada ou vencida).
            </p>
          )}
        </Secao>

        <Secao titulo="Honorários">
          <div className="grid grid-cols-2 gap-3">
            <Kpi
              tone="verde"
              label="Recebido"
              value={formatMoeda(honorariosRecebidos._sum.valor_parceiro ?? 0)}
              sub={`${honorariosRecebidos._count} repasse(s)`}
            />
            <Kpi
              tone="ambar"
              label="A receber"
              value={formatMoeda(honorariosPendentes._sum.valor_parceiro ?? 0)}
              sub={`${honorariosPendentes._count} pendente(s)`}
            />
          </div>
        </Secao>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800 mb-3">Notícias</div>
            {noticias.length === 0 && (
              <p className="text-xs text-gray-400">Nenhuma notícia publicada ainda.</p>
            )}
            <div className="flex flex-col gap-3 max-h-[32rem] overflow-auto">
              {noticias.map((n) => (
                <PublicacaoCard key={n.id} publicacao={n} baseUrl={baseUrl} />
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800 mb-1">Checklists</div>
            <p className="text-xs text-gray-500 mb-3">
              Abra um checklist, copie a mensagem ou já encaminhe pronta no WhatsApp pro cliente.
            </p>
            {checklists.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum checklist cadastrado ainda.</p>
            )}
            <div className="flex flex-col gap-2">
              {checklists.map((c) => (
                <Link
                  key={c.id}
                  href={`/noticias/${c.id}?from=portal`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span>{c.titulo}</span>
                  <span className="text-gray-400">→</span>
                </Link>
              ))}

              <a
                href={IMOBVIEW_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 mt-2"
              >
                <span>
                  ImobView <span className="text-xs text-gray-400">— estudo de mercado</span>
                </span>
                <span className="text-gray-400">↗</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
