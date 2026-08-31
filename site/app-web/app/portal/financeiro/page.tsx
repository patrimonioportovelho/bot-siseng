import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { formatMoeda, formatDataCalendario, situacaoVencimento, STATUS_TRANSACAO_EM_ABERTO } from "@/lib/format";
import { saldoDevido } from "@/lib/financeiro/pagamentos-pix";
import { previsaoComissaoTransacao, type PrevisaoComissao } from "@/lib/financeiro/previsao-comissao";

export const dynamic = "force-dynamic";

// Janela de alerta de vencimento — mesma usada em /financiamento (admin).
const DIAS_ALERTA = 15;

function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-bold text-gray-800">{titulo}</div>
      {sub && <p className="text-[11px] text-gray-400 mb-3">{sub}</p>}
      {children}
    </div>
  );
}

function Badge({ situacao }: { situacao: "vencido" | "alerta" | "normal" | null }) {
  if (!situacao) return null;
  const estilos: Record<string, string> = {
    vencido: "bg-red-50 text-red-600 border-red-200",
    alerta: "bg-amber-50 text-amber-700 border-amber-200",
    normal: "bg-gray-50 text-gray-500 border-gray-200"
  };
  const rotulos: Record<string, string> = { vencido: "Vencido", alerta: "Vence em breve", normal: "Em dia" };
  return (
    <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border ${estilos[situacao]}`}>
      {rotulos[situacao]}
    </span>
  );
}

// Financeiro do corretor no Portal (Fase 8, 14/08/2026) — pedido do usuário:
// "ele vai ter agora no menu a opção financeiro. Por lá ele vai saber o que
// recebeu, o que vai receber e o que vai pagar". Três seções:
//
// "A pagar" — todo Recebimento vinculado a ele (qualquer categoria, ex.: Fee
// Corretor Remax) ainda em aberto. Não é um lançamento novo/duplicado: é a
// MESMA linha de movimentacoes que o admin vê em /financeiro, só que do lado
// dele. Aqui é só a lista resumida (saldo devedor + vencimento); a opção de
// gerar Pix por pedaço (parcial) e o histórico/QR Code de cada pedaço ficam
// na página de detalhe (/portal/financeiro/[id], mesma ideia da página de
// detalhe do admin) — pedido do usuário 14/08/2026: "quando vai na página no
// financeiro do corretor ocupa muito espaço e o QR Code só some depois que
// confirma, imagina quando tiver um monte de despesa".
//
// "Recebido" — repasse de honorário (comissão) que a imobiliária já pagou a
// ele, vindo do rateio (gerarRateioAction em app/financeiro/actions.ts).
// Mesma fonte de dados corrigida no Painel (ver app/portal/page.tsx) —
// movimentacoes.pago na Despesa de repasse, mais "pago direto" (vendedor
// pagou o corretor por fora, sem gerar Despesa).
//
// "A receber" (Fase 8c, 16/08/2026 — pedido do usuário depois de ver a Fase
// 8 no ar: "o A receber precisa puxar do pendente da transação de compra e
// venda ou locação... uma administração sem locação também é uma previsão
// mas é diferente, não é garantida") tem DOIS níveis de confiança, somados
// no card do topo:
//   1) Rateio já gerado (despesa existe, só falta pagar) — mais garantido.
//   2) Previsão calculada em cima de transação Compra e Venda/Locação já
//      ABERTA (assinada) vinculada a ele, mas cujo rateio ainda nem foi
//      gerado — ver lib/financeiro/previsao-comissao.ts (mesma conta em
//      cascata do rateio de verdade, projetada pra frente).
// E um terceiro nível, mostrado À PARTE (NÃO soma no card do topo, por
// pedido explícito do usuário — "não é garantida"): estimativa de comissão
// de uma Administração dele que ainda não virou Locação assinada.
export default async function PortalFinanceiroPage() {
  const session = await requirePortalSession();
  const pid = session.parceiroId;

  // Mesma categoria fixa usada em app/financeiro/actions.ts, app/portal/
  // page.tsx e lib/parceiros/ranking-honorarios.ts (Cat0021 "Repasse de
  // Honorários Transações", tipo Despesa) — ver correção de 31/08/2026
  // abaixo, no "Recebido"/"A receber".
  const categoriaRepasse = await prisma.categorias_financeiras.findFirst({
    where: { nome: "Repasse de Honorários Transações", tipo: "Despesa" },
    select: { id: true }
  });

  const [
    aPagar,
    despesasPagas,
    despesasPendentes,
    pagosDireto,
    transacoesAbertas,
    administracoesSemLocacao,
    comissaoPadraoCorretor
  ] = await Promise.all([
    prisma.movimentacoes.findMany({
      where: { tipo: "Recebimento", parceiro_id: pid, pago: false },
      include: { categorias_financeiras: { select: { nome: true } }, pagamentos_pix: { orderBy: { criado_em: "desc" } } },
      orderBy: { vencimento: "asc" }
    }),
    // Correção de 31/08/2026 (mesmo achado do ranking de honorários):
    // filtrava por `pagamento_id: { not: null }` pra identificar "é uma
    // despesa de repasse", mas isso só vem preenchido quando a despesa
    // nasce do rateio automático — repasse lançado manualmente em
    // Financeiro (comum em Compra e Venda) ficava de fora. Trocado pra
    // filtrar pela categoria, mesmo sinal que a tela de Financeiro usa.
    prisma.movimentacoes.findMany({
      where: categoriaRepasse
        ? { tipo: "Despesa", parceiro_id: pid, categoria_id: categoriaRepasse.id, pago: true }
        : { id: "" },
      include: { categorias_financeiras: { select: { nome: true } } },
      orderBy: { data_pagamento: "desc" },
      take: 30
    }),
    prisma.movimentacoes.findMany({
      where: categoriaRepasse
        ? { tipo: "Despesa", parceiro_id: pid, categoria_id: categoriaRepasse.id, pago: false }
        : { id: "" },
      include: { categorias_financeiras: { select: { nome: true } } },
      orderBy: { vencimento: "asc" }
    }),
    prisma.pagamentos.findMany({
      where: { parceiro_id: pid, pago_direto: true },
      orderBy: { created_at: "desc" },
      take: 30
    }),
    // Negócio assinado (aberto) vinculado a ele — como corretor de qualquer
    // um dos dois lados, ou como participante extra do rateio — pra prever
    // a comissão de um jeito que ainda não teve o rateio gerado (ex.: recém
    // assinado). Mesmo filtro de "aberto" já usado no KPI "Negócios" deste
    // painel (ver app/portal/page.tsx).
    prisma.transacoes.findMany({
      where: {
        excluido: false,
        tipo: { in: ["Compra e Venda", "Locação"] },
        status: STATUS_TRANSACAO_EM_ABERTO,
        OR: [
          { corretor_proprietario_id: pid },
          { corretor_contraparte_id: pid },
          { transacoes_comissao_extra: { some: { parceiro_id: pid } } }
        ]
      },
      select: {
        id: true,
        id_legado: true,
        tipo: true,
        valor_transacao: true,
        porc_honorario: true,
        tem_parceria: true,
        porc_parceria: true,
        porc_corretor_proprietario: true,
        porc_corretor_contraparte: true,
        corretor_proprietario_id: true,
        corretor_contraparte_id: true,
        data_pagamento: true,
        condicoes_pagamento: {
          where: { gera_comissao: true },
          select: {
            id: true,
            porc_comissao: true,
            data_pagamento: true,
            pagamentos: { where: { parceiro_id: pid }, select: { id: true } }
          }
        },
        pagamentos: { where: { parceiro_id: pid, condicao_pagamento_id: null }, select: { id: true } },
        transacoes_comissao_extra: { where: { parceiro_id: pid }, select: { porcentagem: true } }
      }
    }),
    // Administração dele que ainda não virou uma Locação assinada — não tem
    // split de comissão por corretor definido ainda (só existe quando vira
    // transação de verdade), então a estimativa usa o honorário cheio da
    // Administração, sem tentar fatiar. Explicitamente "não garantida".
    prisma.adm_imoveis.findMany({
      where: { parceiro_id: pid, excluido: false },
      select: {
        id: true,
        id_legado: true,
        valor_transacao: true,
        porc_honorario: true,
        transacoes: { where: { tipo: "Locação", excluido: false }, select: { id: true } }
      }
    }),
    // % pré-definida do próprio corretor (cadastro em Parceiro, Fase 9) —
    // usada como fallback na previsão abaixo pra negócio que ainda não tem
    // porc_corretor_proprietario/contraparte preenchido na transação em si
    // (ver comentário em lib/financeiro/previsao-comissao.ts).
    prisma.parceiros.findUnique({ where: { id: pid }, select: { porc_proprietario: true, porc_interessado: true } })
  ]);

  const totalRecebidoDespesas = despesasPagas.reduce((soma, m) => soma + Number(m.valor), 0);
  const totalRecebidoDireto = pagosDireto.reduce((soma, p) => soma + Number(p.valor_parceiro ?? 0), 0);
  const totalRecebido = totalRecebidoDespesas + totalRecebidoDireto;

  const previsoesTransacao: PrevisaoComissao[] = transacoesAbertas.flatMap((t) => {
    const temCondicoes = t.condicoes_pagamento.length > 0;
    const condicoesPendentes = t.condicoes_pagamento
      .filter((c) => c.pagamentos.length === 0)
      .map((c) => ({ id: c.id, porc_comissao: c.porc_comissao ? Number(c.porc_comissao) : null, data_pagamento: c.data_pagamento }));
    const semCondicaoJaGerado = t.pagamentos.length > 0;
    const fracaoExtra = t.transacoes_comissao_extra[0] ? Number(t.transacoes_comissao_extra[0].porcentagem) : 0;

    return previsaoComissaoTransacao({
      transacao: {
        id: t.id,
        id_legado: t.id_legado,
        tipo: t.tipo,
        valor_transacao: Number(t.valor_transacao),
        porc_honorario: Number(t.porc_honorario),
        tem_parceria: t.tem_parceria,
        porc_parceria: Number(t.porc_parceria ?? 0),
        porc_corretor_proprietario: Number(t.porc_corretor_proprietario),
        porc_corretor_contraparte: Number(t.porc_corretor_contraparte),
        corretor_proprietario_id: t.corretor_proprietario_id,
        corretor_contraparte_id: t.corretor_contraparte_id,
        data_pagamento: t.data_pagamento
      },
      parceiroId: pid,
      temCondicoes,
      condicoesPendentes,
      semCondicaoJaGerado,
      fracaoExtra,
      porcPadraoProprietario: comissaoPadraoCorretor?.porc_proprietario != null ? Number(comissaoPadraoCorretor.porc_proprietario) : null,
      porcPadraoInteressado: comissaoPadraoCorretor?.porc_interessado != null ? Number(comissaoPadraoCorretor.porc_interessado) : null
    });
  });

  const administracoesEstimativa = administracoesSemLocacao
    .filter((a) => a.transacoes.length === 0 && a.valor_transacao && a.porc_honorario)
    .map((a) => ({
      id: a.id,
      idLegado: a.id_legado,
      valorEstimado: Math.round(Number(a.valor_transacao) * Number(a.porc_honorario) * 100) / 100
    }))
    .filter((a) => a.valorEstimado > 0);

  const totalAReceberRateioGerado = despesasPendentes.reduce((soma, m) => soma + Number(m.valor), 0);
  const totalAReceberPrevisao = previsoesTransacao.reduce((soma, p) => soma + p.valorPrevisto, 0);
  const totalAReceber = totalAReceberRateioGerado + totalAReceberPrevisao;
  const totalEstimativas = administracoesEstimativa.reduce((soma, a) => soma + a.valorEstimado, 0);

  const totalAPagar = aPagar.reduce((soma, m) => {
    const parciais = m.pagamentos_pix.map((p) => ({ valor: Number(p.valor), pago: p.pago }));
    return soma + saldoDevido(Number(m.valor), parciais);
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="text-lg font-bold text-gray-900 mb-1">Financeiro</div>
        <p className="text-xs text-gray-500 mb-6">
          O que você recebeu, o que vai receber (previsão de comissão) e o que você precisa pagar (ex.: Fee Corretor
          Remax). Pagamentos são conferidos manualmente pelo administrativo depois de gerado o Pix.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-red-50 border border-red-100 rounded-lg p-3">
            <div className="text-[11px] text-red-600">Você deve</div>
            <div className="text-base font-bold text-red-700">{formatMoeda(totalAPagar)}</div>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-lg p-3">
            <div className="text-[11px] text-green-700">Recebido</div>
            <div className="text-base font-bold text-green-700">{formatMoeda(totalRecebido)}</div>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
            <div className="text-[11px] text-amber-700">A receber (previsão)</div>
            <div className="text-base font-bold text-amber-700">{formatMoeda(totalAReceber)}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Secao titulo="A pagar" sub="Toda dívida vinculada a você — pague aos poucos gerando um Pix por vez.">
            {aPagar.length === 0 && <p className="text-xs text-gray-400">Nenhuma dívida em aberto no momento.</p>}
            <div className="flex flex-col gap-2">
              {aPagar.map((m) => {
                const parciais = m.pagamentos_pix.map((p) => ({ valor: Number(p.valor), pago: p.pago }));
                const saldo = saldoDevido(Number(m.valor), parciais);
                const pendentes = m.pagamentos_pix.filter((p) => !p.pago).length;
                const situacao = situacaoVencimento(m.vencimento, false, DIAS_ALERTA);

                return (
                  <Link
                    key={m.id}
                    href={`/portal/financeiro/${m.id}`}
                    className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2.5 hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-800 truncate">
                        {m.categorias_financeiras.nome}
                        {m.descricao && <span className="text-gray-400 font-normal"> — {m.descricao}</span>}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        Vence em {formatDataCalendario(m.vencimento)}
                        {pendentes > 0 && ` · ${pendentes} Pix aguardando confirmação`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge situacao={situacao} />
                      <span className="text-xs font-bold text-red-600 whitespace-nowrap">{formatMoeda(saldo)}</span>
                      <span className="text-gray-300">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Secao>

          <Secao titulo="Recebido" sub="Repasse de comissão já confirmado (via rateio ou pago direto pelo vendedor).">
            {despesasPagas.length === 0 && pagosDireto.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum repasse recebido ainda.</p>
            )}
            <div className="flex flex-col gap-2">
              {despesasPagas.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 pb-2">
                  <span className="text-gray-600">{m.descricao ?? m.categorias_financeiras.nome}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">{formatDataCalendario(m.data_pagamento)}</span>
                    <span className="font-semibold text-green-700">{formatMoeda(m.valor)}</span>
                  </span>
                </div>
              ))}
              {pagosDireto.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 pb-2">
                  <span className="text-gray-600">{p.parte ?? "Repasse"} — pago direto pelo vendedor</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">{formatDataCalendario(p.created_at)}</span>
                    <span className="font-semibold text-green-700">{formatMoeda(p.valor_parceiro)}</span>
                  </span>
                </div>
              ))}
            </div>
          </Secao>

          <Secao
            titulo="A receber"
            sub="Rateio já gerado (aguardando pagamento) + previsão de negócio já assinado, ainda sem rateio."
          >
            {despesasPendentes.length === 0 && previsoesTransacao.length === 0 && (
              <p className="text-xs text-gray-400">Nada previsto no momento.</p>
            )}
            <div className="flex flex-col gap-2">
              {despesasPendentes.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 pb-2">
                  <span className="text-gray-600">
                    {m.descricao ?? m.categorias_financeiras.nome}
                    <span className="text-[10px] text-gray-400"> — rateio já gerado</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">Previsto {formatDataCalendario(m.vencimento)}</span>
                    <span className="font-semibold text-amber-700">{formatMoeda(m.valor)}</span>
                  </span>
                </div>
              ))}
              {previsoesTransacao.map((p) => (
                <div
                  key={`${p.transacaoId}-${p.condicaoId ?? "total"}`}
                  className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 pb-2"
                >
                  <span className="text-gray-600">
                    {p.tipo} {p.idLegado ?? ""}
                    <span className="text-[10px] text-gray-400"> — previsão, rateio ainda não gerado</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">
                      {p.dataPrevista ? `Previsto ${formatDataCalendario(p.dataPrevista)}` : "Sem data prevista"}
                    </span>
                    <span className="font-semibold text-amber-700">{formatMoeda(p.valorPrevisto)}</span>
                  </span>
                </div>
              ))}
            </div>
          </Secao>

          {administracoesEstimativa.length > 0 && (
            <Secao
              titulo="Estimativas (não garantidas)"
              sub="Administração captada por você que ainda não virou Locação assinada — valor estimado, não entra na soma de 'A receber' acima."
            >
              <div className="flex flex-col gap-2">
                {administracoesEstimativa.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 pb-2">
                    <span className="text-gray-500">
                      Administração {a.idLegado ?? ""}
                      <span className="text-[10px] text-gray-400"> — só vira comissão real quando locar</span>
                    </span>
                    <span className="font-semibold text-gray-500">{formatMoeda(a.valorEstimado)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 text-xs pt-1">
                  <span className="text-gray-400">Total estimado</span>
                  <span className="font-semibold text-gray-500">{formatMoeda(totalEstimativas)}</span>
                </div>
              </div>
            </Secao>
          )}
        </div>
      </div>
    </div>
  );
}
