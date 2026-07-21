import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMoeda } from "@/lib/format";
import { STATUS_AVALIACAO_OPCOES } from "@/lib/financiamento/opcoes";

// Seção "Saúde da operação" do Dashboard — nasceu da revisão geral de
// 21/07/2026 (ver RELATORIO_REVISAO_SISTEMA_2026-07-21.md): consolida os
// indicadores de acompanhamento que não apareciam em lugar nenhum:
// inadimplência com aging, locações ativas sem a próxima cobrança lançada,
// contratos com condições/comissão que não fecham, funil do Financiamento e
// qualidade da base de clientes. Tudo calculado ao vivo, direto do banco —
// nenhuma tabela nova, nenhum job: se o número está errado aqui, está errado
// na origem (e é exatamente pra isso que a seção existe: apontar onde ir
// arrumar, com link).
//
// Componente servidor separado do page.tsx do Dashboard de propósito: o
// page.tsx já tem 1300+ linhas e um "Promise.all" gigante; isso aqui roda as
// próprias queries e pode ser movido/reordenado sem mexer no resto.

const STATUS_TRANSACAO_ATIVAS = [
  "Elaboração do Contrato de Compra e Venda",
  "Elaboração de Contrato de Locação",
  "Imóvel em Locação"
];

function hojeSemHora(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function DashboardSaude() {
  const hoje = hojeSemHora();

  const [
    movsVencidas,
    locacoesAtivas,
    movsFuturasPendentes,
    cvsAtivas,
    transacoesAtivasComissao,
    avaliacoesTodas,
    andamentosTotais,
    totalPF,
    pfSemCpf,
    pfSemTelefone,
    duplicadosRaw
  ] = await Promise.all([
    prisma.movimentacoes.findMany({
      where: { pago: false, vencimento: { lt: hoje } },
      select: {
        id: true,
        valor: true,
        vencimento: true,
        descricao: true,
        tipo: true,
        cliente_interessado_id: true
      }
    }),
    prisma.transacoes.findMany({
      where: { tipo: "Locação", status: "Imóvel em Locação" },
      select: { id: true, id_legado: true, imoveis: { select: { endereco: true } } }
    }),
    prisma.movimentacoes.findMany({
      where: { pago: false, vencimento: { gte: hoje }, transacao_id: { not: null } },
      select: { transacao_id: true },
      distinct: ["transacao_id"]
    }),
    prisma.transacoes.findMany({
      where: { tipo: "Compra e Venda", status: "Elaboração do Contrato de Compra e Venda" },
      select: {
        id: true,
        id_legado: true,
        valor_transacao: true,
        condicoes_pagamento: { select: { valor: true } }
      }
    }),
    prisma.transacoes.findMany({
      where: { status: { in: STATUS_TRANSACAO_ATIVAS } },
      select: {
        id: true,
        id_legado: true,
        tipo: true,
        tem_parceria: true,
        porc_corretor_proprietario: true,
        porc_corretor_contraparte: true,
        porc_imobiliaria: true,
        porc_parceria: true
      }
    }),
    prisma.avaliacoes.findMany({
      where: { excluido: false },
      select: { status: true }
    }),
    prisma.andamentos.findMany({ where: { excluido: false }, select: { status_andamento: true } }),
    prisma.clientes.count({ where: { tipo_cliente: "Pessoa Física" } }),
    prisma.clientes.count({ where: { tipo_cliente: "Pessoa Física", cpf: null } }),
    prisma.clientes.count({ where: { tipo_cliente: "Pessoa Física", telefone: null } }),
    prisma.$queryRaw<Array<{ cpf_dup: bigint; nome_dup: bigint }>>`
      select
        (select count(*) from (select cpf from clientes where cpf is not null group by cpf having count(*) > 1) a) as cpf_dup,
        (select count(*) from (select lower(nome) from clientes group by lower(nome) having count(*) > 1) b) as nome_dup
    `
  ]);

  // ---- Inadimplência (recebimentos e despesas vencidos, com aging) ----
  const diaMs = 24 * 60 * 60 * 1000;
  type Bucket = { qtd: number; total: number };
  const aging: Record<"ate30" | "de31a90" | "mais90", Bucket> = {
    ate30: { qtd: 0, total: 0 },
    de31a90: { qtd: 0, total: 0 },
    mais90: { qtd: 0, total: 0 }
  };
  let vencidoTotal = 0;
  for (const m of movsVencidas) {
    const valor = Number(m.valor ?? 0);
    vencidoTotal += valor;
    const dias = Math.floor((hoje.getTime() - new Date(m.vencimento).getTime()) / diaMs);
    const b = dias <= 30 ? aging.ate30 : dias <= 90 ? aging.de31a90 : aging.mais90;
    b.qtd += 1;
    b.total += valor;
  }
  const maioresVencidas = [...movsVencidas].sort((a, b) => Number(b.valor ?? 0) - Number(a.valor ?? 0)).slice(0, 5);
  const idsClientes = maioresVencidas.map((m) => m.cliente_interessado_id).filter((v): v is string => Boolean(v));
  const clientesDasMaiores = idsClientes.length
    ? await prisma.clientes.findMany({ where: { id: { in: idsClientes } }, select: { id: true, nome: true } })
    : [];
  const nomeCliente = new Map(clientesDasMaiores.map((c) => [c.id, c.nome]));

  // ---- Locações ativas sem a próxima cobrança lançada ----
  const comCobrancaFutura = new Set(movsFuturasPendentes.map((m) => m.transacao_id));
  const locacoesSemCobranca = locacoesAtivas.filter((t) => !comCobrancaFutura.has(t.id));

  // ---- Consistência de contratos ----
  const cvsForaDoValor = cvsAtivas.filter((t) => {
    const soma = t.condicoes_pagamento.reduce((acc, c) => acc + Number(c.valor ?? 0), 0);
    return Math.abs(soma - Number(t.valor_transacao ?? 0)) > 0.01;
  });
  const comissaoNaoFecha = transacoesAtivasComissao.filter((t) => {
    const soma =
      Number(t.porc_corretor_proprietario ?? 0) +
      Number(t.porc_corretor_contraparte ?? 0) +
      Number(t.porc_imobiliaria ?? 0) +
      (t.tem_parceria ? Number(t.porc_parceria ?? 0) : 0);
    // 0 = divisão ainda não preenchida (ok, o ADM preenche depois);
    // diferente de 0 e de 100% = sobra/falta comissão implícita.
    return soma > 0.0001 && Math.abs(soma - 1) > 0.0001;
  });

  // ---- Funil do Financiamento ----
  const porStatus = new Map<string, number>();
  for (const a of avaliacoesTodas) porStatus.set(a.status, (porStatus.get(a.status) ?? 0) + 1);
  const totalAvaliacoes = avaliacoesTodas.length;
  const funil = [
    { etapa: "Consulta de CPF", qtd: porStatus.get("Consulta de CPF") ?? 0 },
    { etapa: "Montagem de processo", qtd: porStatus.get("Montagem de processo") ?? 0 },
    { etapa: "Aprovado", qtd: porStatus.get("Aprovado") ?? 0 },
    {
      etapa: "Andamento em curso",
      qtd: andamentosTotais.filter((a) => a.status_andamento !== "Concluído").length
    },
    { etapa: "Concluído", qtd: porStatus.get("Concluído") ?? 0 }
  ];
  const encerradasSemNegocio = STATUS_AVALIACAO_OPCOES.filter((s) =>
    ["Reprovação", "Avaliação cancelada", "Avaliação vencida"].includes(s)
  ).reduce((acc, s) => acc + (porStatus.get(s) ?? 0), 0);

  // ---- Qualidade da base de clientes ----
  const dup = duplicadosRaw[0];
  const cpfDuplicados = Number(dup?.cpf_dup ?? 0);
  const nomesDuplicados = Number(dup?.nome_dup ?? 0);
  const pctComCpf = totalPF > 0 ? Math.round(((totalPF - pfSemCpf) / totalPF) * 100) : 100;
  const pctComTelefone = totalPF > 0 ? Math.round(((totalPF - pfSemTelefone) / totalPF) * 100) : 100;

  const maiorEtapaFunil = Math.max(1, ...funil.map((f) => f.qtd));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mt-5">
      <div className="text-sm font-bold text-gray-800 mb-1">Saúde da operação</div>
      <p className="text-[11px] text-gray-400 mb-4">
        Indicadores de acompanhamento calculados ao vivo — cada número aponta onde precisa de ação. Não dependem
        do filtro de período acima: mostram a foto de hoje.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Inadimplência */}
        <div className="border border-red-100 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-red-700">Inadimplência (vencido e não pago)</div>
            <Link href="/financeiro?situacao=vencidas" className="text-[11px] text-primary font-semibold hover:underline">
              Ver no Financeiro →
            </Link>
          </div>
          <div className="text-xl font-bold text-red-700">{formatMoeda(vencidoTotal)}</div>
          <div className="text-[11px] text-gray-500 mb-2">{movsVencidas.length} movimentação(ões) em atraso</div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-red-50/60 rounded-lg p-2">
              <div className="text-[10px] text-gray-500">até 30 dias</div>
              <div className="text-xs font-bold text-gray-800">{formatMoeda(aging.ate30.total)}</div>
              <div className="text-[10px] text-gray-400">{aging.ate30.qtd}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-2">
              <div className="text-[10px] text-gray-500">31–90 dias</div>
              <div className="text-xs font-bold text-gray-800">{formatMoeda(aging.de31a90.total)}</div>
              <div className="text-[10px] text-gray-400">{aging.de31a90.qtd}</div>
            </div>
            <div className="bg-red-100/70 rounded-lg p-2">
              <div className="text-[10px] text-red-700">+90 dias</div>
              <div className="text-xs font-bold text-red-800">{formatMoeda(aging.mais90.total)}</div>
              <div className="text-[10px] text-red-500">{aging.mais90.qtd}</div>
            </div>
          </div>
          {maioresVencidas.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-semibold text-gray-600">Maiores em aberto</div>
              {maioresVencidas.map((m) => (
                <Link
                  key={m.id}
                  href={`/financeiro/${m.id}`}
                  className="flex items-center justify-between text-[11px] text-gray-700 hover:bg-gray-50 rounded px-1.5 py-1"
                >
                  <span className="truncate">
                    {(m.cliente_interessado_id && nomeCliente.get(m.cliente_interessado_id)) || m.descricao || m.tipo}
                  </span>
                  <span className="font-semibold text-red-700 shrink-0 ml-2">{formatMoeda(m.valor)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Locações sem cobrança */}
        <div className="border border-amber-100 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-amber-700">Locações ativas sem a próxima cobrança lançada</div>
            <Link href="/transacoes/locacao" className="text-[11px] text-primary font-semibold hover:underline">
              Ver Locações →
            </Link>
          </div>
          <div className="text-xl font-bold text-amber-700">
            {locacoesSemCobranca.length}
            <span className="text-xs font-normal text-gray-400"> de {locacoesAtivas.length} em locação</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-2">
            &quot;Imóvel em Locação&quot; sem nenhuma movimentação futura em aberto no Financeiro — o próximo aluguel
            ainda não tem cobrança gerada (a inadimplência real pode ser maior que a registrada).
          </p>
          <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
            {locacoesSemCobranca.slice(0, 12).map((t) => (
              <Link
                key={t.id}
                href={`/transacoes/${t.id}`}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-amber-50/60 bg-white"
              >
                <span className="shrink-0 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                  {t.id_legado ?? "sem código"}
                </span>
                <span className="text-[11px] leading-snug text-gray-700 truncate">
                  {t.imoveis?.endereco ?? "imóvel sem endereço"}
                </span>
              </Link>
            ))}
            {locacoesSemCobranca.length > 12 && (
              <div className="text-[11px] text-gray-400 px-2 py-1.5 bg-white">
                + {locacoesSemCobranca.length - 12} outras — abra a lista de Locações pra ver todas
              </div>
            )}
          </div>
        </div>

        {/* Consistência de contratos */}
        <div className="border border-gray-200 rounded-xl p-3">
          <div className="text-xs font-bold text-gray-800 mb-2">Consistência de contratos</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className={`rounded-lg p-2 ${cvsForaDoValor.length > 0 ? "bg-amber-50" : "bg-green-50"}`}>
              <div className="text-[10px] text-gray-500">CV: condições ≠ valor da transação</div>
              <div className={`text-lg font-bold ${cvsForaDoValor.length > 0 ? "text-amber-700" : "text-green-700"}`}>
                {cvsForaDoValor.length}
              </div>
            </div>
            <div className={`rounded-lg p-2 ${comissaoNaoFecha.length > 0 ? "bg-amber-50" : "bg-green-50"}`}>
              <div className="text-[10px] text-gray-500">Comissão não fecha 100%</div>
              <div className={`text-lg font-bold ${comissaoNaoFecha.length > 0 ? "text-amber-700" : "text-green-700"}`}>
                {comissaoNaoFecha.length}
              </div>
            </div>
          </div>
          <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
            {cvsForaDoValor.slice(0, 4).map((t) => (
              <Link key={t.id} href={`/transacoes/${t.id}`} className="flex items-center gap-2 px-2 py-1.5 hover:bg-amber-50/60 bg-white">
                <span className="shrink-0 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                  {t.id_legado ?? "sem código"}
                </span>
                <span className="text-[11px] leading-snug text-gray-700 truncate">
                  condições não fecham {formatMoeda(t.valor_transacao)}
                </span>
              </Link>
            ))}
            {comissaoNaoFecha.slice(0, 4).map((t) => (
              <Link key={t.id} href={`/transacoes/${t.id}`} className="flex items-center gap-2 px-2 py-1.5 hover:bg-amber-50/60 bg-white">
                <span className="shrink-0 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                  {t.id_legado ?? "sem código"}
                </span>
                <span className="text-[11px] leading-snug text-gray-700 truncate">{t.tipo} — divisão de comissão incompleta</span>
              </Link>
            ))}
            {cvsForaDoValor.length + comissaoNaoFecha.length > 8 && (
              <div className="text-[11px] text-gray-400 px-2 py-1.5 bg-white">
                + {cvsForaDoValor.length + comissaoNaoFecha.length - 8} outras
              </div>
            )}
          </div>
        </div>

        {/* Funil do Financiamento + qualidade da base */}
        <div className="border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-gray-800">Funil do Financiamento (carteira atual)</div>
            <Link href="/financiamento" className="text-[11px] text-primary font-semibold hover:underline">
              Ver Financiamento →
            </Link>
          </div>
          <div className="flex flex-col gap-1 mb-3">
            {funil.map((f) => (
              <div key={f.etapa} className="flex items-center gap-2">
                <div className="text-[11px] text-gray-600 w-36 shrink-0 truncate">{f.etapa}</div>
                <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
                  <div
                    className="bg-primary/70 h-3 rounded"
                    style={{ width: `${Math.max(3, Math.round((f.qtd / maiorEtapaFunil) * 100))}%` }}
                  />
                </div>
                <div className="text-[11px] font-semibold text-gray-800 w-8 text-right">{f.qtd}</div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-gray-400 mb-3">
            {totalAvaliacoes} avaliações no total · {encerradasSemNegocio} encerradas sem negócio (reprovada /
            cancelada / vencida)
          </div>

          <div className="text-xs font-bold text-gray-800 mb-1.5">Qualidade da base de clientes</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-[10px] text-gray-500">PF com CPF preenchido</div>
              <div className={`text-sm font-bold ${pctComCpf >= 90 ? "text-green-700" : "text-amber-700"}`}>{pctComCpf}%</div>
              <div className="text-[10px] text-gray-400">{pfSemCpf} sem CPF</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-[10px] text-gray-500">PF com telefone</div>
              <div className={`text-sm font-bold ${pctComTelefone >= 90 ? "text-green-700" : "text-amber-700"}`}>
                {pctComTelefone}%
              </div>
              <div className="text-[10px] text-gray-400">{pfSemTelefone} sem telefone</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 col-span-2">
              <div className="text-[10px] text-gray-500">Cadastros duplicados (pra revisar e unificar)</div>
              <div className={`text-sm font-bold ${cpfDuplicados + nomesDuplicados > 0 ? "text-amber-700" : "text-green-700"}`}>
                {cpfDuplicados} CPF(s) · {nomesDuplicados} nome(s)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
