import Link from "next/link";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PublicacaoCard } from "@/components/site/publicacao-card";
import { GraficoBarras } from "@/components/grafico-barras";
import { formatMoeda, situacaoVencimento, hojePortoVelho, STATUS_TRANSACAO_EM_ABERTO } from "@/lib/format";
import { STATUS_AVALIACAO_ATIVOS, STATUS_AVALIACAO_ENCERRADOS } from "@/lib/financiamento/opcoes";
import { calcularAlcancado, avaliarMeta } from "@/lib/metas/calculo";
import { PortalMetasPainel } from "@/components/portal-metas-painel";

const IMOBVIEW_URL = "https://www.imobview.pro/login";

// Só as duas últimas notícias por aqui — pedido do usuário: uma pilha longa
// de banners ficava "estranha" no painel. Quem quiser ver mais, tem o mural
// completo do site público (mesma tabela, sem esse limite).
const NOTICIAS_LIMITE = 2;

// Janela do gráfico "Novos negócios, mês a mês" — 6 meses (mês atual +
// 5 anteriores), mesmo horizonte curto usado em telas de resumo do sistema.
const MESES_GRAFICO = 6;
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

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
  const classe = tone ? cores[tone] : "bg-gray-50 border-gray-100 text-gray-900";
  return (
    <div className={`rounded-lg border p-2.5 ${classe}`}>
      <div className={`text-[11px] ${tone ? "" : "text-gray-500"}`}>{label}</div>
      <div className="text-base font-bold mt-0.5">{value}</div>
      {sub && <div className="text-[10px] opacity-70 mt-0.5">{sub}</div>}
    </div>
  );
}

// Cada grupo agora é um card branco compacto (em vez de só um rótulo solto
// em cima de um grid no fundo cinza) — dois cards por linha em telas md+,
// pra ocupar bem menos altura (pedido do usuário: "esse formato está
// ocupando muito espaço e muito solto").
function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
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

  const hoje = hojePortoVelho();

  // Início da janela do gráfico: primeiro dia do mês, MESES_GRAFICO-1 meses
  // atrás (inclui o mês atual inteiro).
  const inicioGrafico = new Date(hoje.getFullYear(), hoje.getMonth() - (MESES_GRAFICO - 1), 1);

  const [
    pedidosAgendaRespondidos,
    metasAtivas,
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
    honorariosPendentes,
    transacoesGrafico,
    administracoesGrafico
  ] = await Promise.all([
    // Pedidos de Agenda que o setor já respondeu e o corretor ainda não
    // abriu — vira o banner de notificação abaixo (some sozinho assim que
    // ele visita /portal/agenda, ver app/portal/agenda/page.tsx).
    prisma.solicitacoes_agenda.findMany({
      where: { parceiro_id: pid, excluido: false, status: { not: "pendente" }, visto_pelo_corretor: false },
      orderBy: { respondido_em: "desc" }
    }),
    // Metas ativas AGORA (o período já começou e ainda não terminou) que
    // valem pra este corretor: individuais dele (parceiro_id = pid) ou
    // Gerais (parceiro_id null, soma de todo mundo). Ordenada pela mais
    // urgente primeiro (prazo mais próximo).
    prisma.metas.findMany({
      where: {
        OR: [{ parceiro_id: pid }, { parceiro_id: null }],
        periodo_inicio: { lte: hoje },
        periodo_fim: { gte: hoje }
      },
      orderBy: { periodo_fim: "asc" }
    }),
    prisma.publicacoes_site.findMany({
      where: { ativo: true, portal_corretor: true, tipo: { not: "Checklist" } },
      orderBy: { publicado_em: "desc" },
      take: NOTICIAS_LIMITE
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
    }),
    // Gráfico "Novos negócios, mês a mês" — mesma lógica do dashboard admin
    // (Compra e Venda + Locação + Administração), só que filtrado pra este
    // corretor: crédito pra qualquer lado da transação (proprietário e/ou
    // contraparte), pela Data de assinatura.
    prisma.transacoes.findMany({
      where: {
        excluido: false,
        tipo: { in: ["Compra e Venda", "Locação"] },
        data_assinatura: { gte: inicioGrafico },
        OR: [{ corretor_proprietario_id: pid }, { corretor_contraparte_id: pid }]
      },
      select: { tipo: true, data_assinatura: true }
    }),
    prisma.adm_imoveis.findMany({
      where: { parceiro_id: pid, excluido: false, data_assinatura: { gte: inicioGrafico } },
      select: { data_assinatura: true }
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

  // Gráfico "Novos negócios, mês a mês" — agrupa por mês (pela Data de
  // assinatura) dentro da janela de MESES_GRAFICO, sempre preenchendo todo
  // mês do intervalo (mesmo os sem nenhum negócio) pra a linha do tempo não
  // ficar com buracos.
  const porMesNegociosCorretor = new Map<string, { vendas: number; locacoes: number; administracoes: number }>();
  for (let i = 0; i < MESES_GRAFICO; i++) {
    const d = new Date(inicioGrafico.getFullYear(), inicioGrafico.getMonth() + i, 1);
    porMesNegociosCorretor.set(`${d.getFullYear()}-${d.getMonth()}`, { vendas: 0, locacoes: 0, administracoes: 0 });
  }
  function chaveMesGrafico(data: Date) {
    return `${data.getFullYear()}-${data.getMonth()}`;
  }
  for (const t of transacoesGrafico) {
    if (!t.data_assinatura) continue;
    const linha = porMesNegociosCorretor.get(chaveMesGrafico(new Date(t.data_assinatura)));
    if (!linha) continue;
    if (t.tipo === "Compra e Venda") linha.vendas += 1;
    else if (t.tipo === "Locação") linha.locacoes += 1;
  }
  for (const a of administracoesGrafico) {
    if (!a.data_assinatura) continue;
    const linha = porMesNegociosCorretor.get(chaveMesGrafico(new Date(a.data_assinatura)));
    if (linha) linha.administracoes += 1;
  }
  const dadosGraficoNegociosCorretor = [...porMesNegociosCorretor.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, v]) => {
      const [ano, mes] = chave.split("-").map(Number);
      return { label: `${MESES_ABREV[mes]}/${String(ano).slice(2)}`, ...v };
    });
  const temNegocioNoGrafico = dadosGraficoNegociosCorretor.some(
    (d) => d.vendas > 0 || d.locacoes > 0 || d.administracoes > 0
  );

  // Progresso de cada meta ativa é apurado na hora (não fica guardado em
  // lugar nenhum) — sempre reflete o cadastro real mais recente. Ver
  // lib/metas/calculo.ts pra como cada tipo é contado e como a mensagem
  // ("faltam X dias, você precisa...") é montada.
  const metasComProgresso = await Promise.all(
    metasAtivas.map(async (m) => ({ meta: m, avaliacao: avaliarMeta(m, await calcularAlcancado(m)) }))
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="text-lg font-bold text-gray-900 mb-1">Seu painel</div>
        <p className="text-xs text-gray-500 mb-6">
          Um resumo rápido de tudo que está no seu nome: clientes, imóveis, negócios em andamento, avaliações de
          crédito e honorários. As ações pra criar um novo cadastro ficaram no menu ao lado.
        </p>

        {pedidosAgendaRespondidos.length > 0 && (
          <Link
            href="/portal/agenda"
            className="block bg-primary/5 border border-primary/30 text-primary text-xs rounded-xl px-4 py-3 mb-4 hover:bg-primary/10"
          >
            <span className="font-semibold">
              {pedidosAgendaRespondidos.length === 1
                ? "Seu pedido na Agenda foi respondido."
                : `${pedidosAgendaRespondidos.length} pedidos seus na Agenda foram respondidos.`}
            </span>{" "}
            Toque pra ver →
          </Link>
        )}

        <PortalMetasPainel metas={metasComProgresso} />

        <div className="bg-white border border-gray-200 rounded-xl p-4 mt-4 mb-4">
          <div className="text-sm font-bold text-gray-800 mb-1">Evolução dos seus negócios</div>
          <p className="text-[11px] text-gray-400 mb-3">
            Compra e Venda + Locação + Administração, mês a mês (pela Data de assinatura).
          </p>
          <GraficoBarras
            dados={dadosGraficoNegociosCorretor}
            series={[
              { chave: "vendas", cor: "#04075c", nome: "Compra e Venda" },
              { chave: "locacoes", cor: "#3C7A57", nome: "Locação" },
              { chave: "administracoes", cor: "#c97a1a", nome: "Administração" }
            ]}
            formatarValor={(v) => String(v)}
            mensagemVazia="Sem negócios registrados nesse período."
          />
          {!temNegocioNoGrafico && (
            <p className="text-[11px] text-gray-400 mt-2">
              Nenhum negócio assinado nos últimos {MESES_GRAFICO} meses ainda.
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <Secao titulo="Sua carteira">
            <div className="grid grid-cols-2 gap-2">
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
            <div className="grid grid-cols-3 gap-2">
              <Kpi
                tone="azul"
                label="Compra e venda"
                value={`${vendaAbertas} em andamento`}
                sub={`${vendaTotal} no total`}
              />
              <Kpi
                tone="azul"
                label="Locação"
                value={`${locacaoAbertas} em andamento`}
                sub={`${locacaoTotal} no total`}
              />
              <Kpi
                tone="roxo"
                label="Administrações"
                value={`${administracoesAtivas} ativas`}
                sub={`${administracoesTotal} no total`}
              />
            </div>
          </Secao>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <Secao titulo="Avaliações de crédito (Financiamento)">
            <div className="grid grid-cols-2 gap-2">
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
            <div className="grid grid-cols-2 gap-2">
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
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-sm font-bold text-gray-800">Notícias</div>
              <Link href="/login#noticias" className="text-[11px] text-primary font-semibold hover:underline">
                Ver mural completo →
              </Link>
            </div>
            {noticias.length === 0 && (
              <p className="text-xs text-gray-400">Nenhuma notícia publicada ainda.</p>
            )}
            <div className="flex flex-col gap-3">
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
