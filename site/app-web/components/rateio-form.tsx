"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoeda, formatPercentual, hojeInputDate } from "@/lib/format";

type ParceiroInfo = { id: string; nome: string } | null;

// Condição de pagamento marcada como "honorário devido aqui" (ver
// components/transacao-form.tsx / portal-compra-venda-form.tsx) — usada
// pra saber qual fatia do honorário total esse Recebimento específico
// representa, em vez de sempre assumir 100% (o que pagaria o honorário
// inteiro de novo a cada Recebimento, quando o negócio tem mais de uma
// condição gerando comissão).
type CondicaoComComissao = {
  id: string;
  tipo: string | null;
  porc_comissao: unknown;
  desconto_comissao: unknown;
  data_pagamento: string | null;
  jaGerado: boolean;
};

type ParticipanteExtra = {
  id: string;
  nome: string;
  papel: string | null;
  porcentagem: unknown;
};

type TransacaoRateio = {
  id: string;
  id_legado: string | null;
  valor_transacao: unknown;
  porc_honorario: unknown;
  tem_parceria: boolean | null;
  porc_parceria: unknown;
  porc_corretor_proprietario: unknown;
  porc_corretor_contraparte: unknown;
  parceiro_externo: ParceiroInfo;
  corretor_proprietario: ParceiroInfo;
  corretor_contraparte: ParceiroInfo;
  extras: ParticipanteExtra[];
  condicoesComComissao: CondicaoComComissao[];
};

type Linha = {
  // Rótulo mostrado na tela — pode ser o papel customizado que o admin
  // digitou pro participante extra (ex.: "Coordenador João").
  parte: string;
  // Valor de verdade gravado em pagamentos.parte — essa coluna tem uma
  // CHECK constraint no banco (herdada do AppSheet) que só aceita 'Parte
  // proprietária', 'Parte interessada', 'Parte proprietária / Interessada'
  // e 'Coordenação de vendas'. Qualquer outro texto (o rótulo customizado
  // acima, por exemplo) quebraria o insert — por isso os dois campos são
  // separados: parte é só exibição, parteBanco é o que de fato é gravado.
  parteBanco: string;
  parceiroId: string;
  parceiroNome: string;
  porcentagem: number;
  valorBase: number;
  desconto: number;
  observacao: string;
  // Anotação fixa (ex.: o papel customizado do participante extra) que vai
  // junto no observacao final, sem se misturar com o motivo do desconto
  // que o admin pode preencher depois (ver aplicarDesconto).
  notaFixa: string;
};

function inputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function RateioForm({
  transacao,
  recebimentoId,
  vencimentoSugerido,
  action
}: {
  transacao: TransacaoRateio;
  recebimentoId: string;
  vencimentoSugerido: Date | string | null;
  action: (formData: FormData) => void;
}) {
  const valorTransacao = Number(transacao.valor_transacao);
  const porcHonorario = Number(transacao.porc_honorario ?? 0);
  const porcParceria = Number(transacao.porc_parceria ?? 0);
  const porcCorretorProprietario = Number(transacao.porc_corretor_proprietario ?? 0);
  const porcCorretorContraparte = Number(transacao.porc_corretor_contraparte ?? 0);

  const condicoesDisponiveis = transacao.condicoesComComissao.filter((c) => !c.jaGerado);

  // Qual condição/fatia do honorário está sendo paga agora — se a
  // transação tem condições marcadas (Entrada, Parcelado etc.), o admin
  // escolhe qual delas corresponde a este Recebimento; começa já
  // pré-selecionada quando só sobra uma pendente. Sem nenhuma condição
  // configurada (transações antigas), cai no comportamento de sempre:
  // honorário total inteiro nesse único rateio.
  const [condicaoId, setCondicaoId] = useState(condicoesDisponiveis.length === 1 ? condicoesDisponiveis[0].id : "");
  const condicaoSelecionada = condicoesDisponiveis.find((c) => c.id === condicaoId) ?? null;
  const porcFatia = condicaoSelecionada ? (Number(condicaoSelecionada.porc_comissao ?? 0) || 0) / 100 : 1;
  const descontoCondicaoRS = condicaoSelecionada ? Number(condicaoSelecionada.desconto_comissao ?? 0) || 0 : 0;

  // Mesma conta em cascata de components/transacao-form.tsx: honorário
  // total -> pega só a fatia da condição selecionada (ou 100%, sem
  // condição configurada) -> desconta a parceria (se houver) -> o restante
  // é rateado entre os corretores e eventuais participantes extra. A fatia
  // da imobiliária não vira despesa (fica em casa). A fatia da parceria
  // externa também não vira despesa aqui — na prática ela já cai direto na
  // conta do parceiro (o valor nunca passa pela nossa movimentação), então
  // ela só serve pra reduzir a base rateada, sem gerar repasse nosso.
  const honorarioTotal = valorTransacao * porcHonorario * porcFatia;
  const valorParceria = transacao.tem_parceria ? honorarioTotal * porcParceria : 0;
  const restante = honorarioTotal - valorParceria;
  const valorCorretorProprietario = restante * porcCorretorProprietario;
  const valorCorretorContraparte = restante * porcCorretorContraparte;

  const linhasBase = useMemo(() => {
    const linhas: Linha[] = [];
    if (transacao.corretor_proprietario && valorCorretorProprietario > 0) {
      linhas.push({
        parte: "Proprietário",
        parteBanco: "Parte proprietária",
        parceiroId: transacao.corretor_proprietario.id,
        parceiroNome: transacao.corretor_proprietario.nome,
        porcentagem: porcCorretorProprietario,
        valorBase: valorCorretorProprietario,
        desconto: 0,
        observacao: "",
        notaFixa: ""
      });
    }
    if (transacao.corretor_contraparte && valorCorretorContraparte > 0) {
      linhas.push({
        parte: "Contraparte",
        parteBanco: "Parte interessada",
        parceiroId: transacao.corretor_contraparte.id,
        parceiroNome: transacao.corretor_contraparte.nome,
        porcentagem: porcCorretorContraparte,
        valorBase: valorCorretorContraparte,
        desconto: 0,
        observacao: "",
        notaFixa: ""
      });
    }
    for (const extra of transacao.extras) {
      const fracExtra = (Number(extra.porcentagem ?? 0) || 0) / 100;
      const valorExtra = restante * fracExtra;
      if (valorExtra > 0) {
        linhas.push({
          parte: extra.papel || "Coordenação de vendas",
          // Coluna parte no banco só aceita esses 4 valores fixos — o papel
          // customizado (se houver) vai como anotação no observacao, não
          // como valor da coluna.
          parteBanco: "Coordenação de vendas",
          parceiroId: extra.id,
          parceiroNome: extra.nome,
          porcentagem: fracExtra,
          valorBase: valorExtra,
          desconto: 0,
          observacao: "",
          notaFixa: extra.papel && extra.papel !== "Coordenação de vendas" ? extra.papel : ""
        });
      }
    }
    return linhas;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condicaoId, valorCorretorProprietario, valorCorretorContraparte, restante]);

  const [linhas, setLinhas] = useState<Linha[]>(linhasBase);
  // Troca de condição/fatia recalcula a base (o desconto por linha, quando
  // já tinha sido preenchido, é zerado de propósito — a fatia mudou, o
  // desconto anterior não necessariamente vale pra essa).
  useEffect(() => {
    setLinhas(linhasBase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasBase]);

  const [descontoAberto, setDescontoAberto] = useState<number | null>(null);
  const [descontoValor, setDescontoValor] = useState("");
  const [descontoMotivo, setDescontoMotivo] = useState("");

  function abrirDesconto(indice: number) {
    setDescontoAberto(indice);
    setDescontoValor("");
    setDescontoMotivo("");
  }

  function aplicarDesconto(indice: number) {
    const valor = Number(descontoValor.replace(/\./g, "").replace(",", ".")) || 0;
    setLinhas((prev) =>
      prev.map((l, i) =>
        i === indice
          ? { ...l, desconto: valor, observacao: descontoMotivo.trim() }
          : l
      )
    );
    setDescontoAberto(null);
  }

  function removerDesconto(indice: number) {
    setLinhas((prev) => prev.map((l, i) => (i === indice ? { ...l, desconto: 0, observacao: "" } : l)));
  }

  const linhasParaEnviar = useMemo(
    () =>
      linhas.map((l) => ({
        parte: l.parteBanco,
        parceiro_id: l.parceiroId,
        parceiro_nome: l.parceiroNome,
        porcentagem: l.porcentagem,
        valor_final: Math.max(0, l.valorBase - l.desconto),
        desconto: l.desconto,
        observacao: [l.notaFixa, l.observacao].filter(Boolean).join(" — ") || null
      })),
    [linhas]
  );

  if (linhasBase.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-2">Rateio de pagamentos</div>
        <p className="text-xs text-gray-400">
          Essa transação não tem corretor/parceiro com percentual de comissionamento cadastrado — nada pra ratear.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="bg-white border border-gray-200 rounded-xl p-4">
      <input type="hidden" name="transacao_id" value={transacao.id} />
      <input type="hidden" name="recebimento_id" value={recebimentoId} />
      <input type="hidden" name="condicao_pagamento_id" value={condicaoId} />
      <input
        type="hidden"
        name="vencimento"
        value={vencimentoSugerido ? inputDate(new Date(vencimentoSugerido)) : hojeInputDate()}
      />
      <input type="hidden" name="linhas" value={JSON.stringify(linhasParaEnviar)} />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Rateio de pagamentos</div>
        <div className="text-xs text-gray-500">
          Honorário desta fatia: <span className="font-semibold text-gray-700">{formatMoeda(honorarioTotal)}</span>
        </div>
      </div>

      {condicoesDisponiveis.length > 0 && (
        <div className="mb-3">
          <label className="text-xs text-gray-600 block mb-1">Qual parcela do honorário está sendo paga agora?</label>
          <select
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white"
            value={condicaoId}
            onChange={(e) => setCondicaoId(e.target.value)}
          >
            <option value="">Honorário total (sem vincular a uma condição específica)</option>
            {condicoesDisponiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.tipo ?? "Condição"} — {formatPercentual(c.porc_comissao)}% do honorário
                {c.data_pagamento ? ` · previsto ${c.data_pagamento}` : ""}
              </option>
            ))}
          </select>
          {condicaoSelecionada && descontoCondicaoRS > 0 && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1.5">
              Essa condição tem um desconto de {formatMoeda(descontoCondicaoRS)} configurado no comissionamento da
              transação — aplique manualmente em alguma linha abaixo se ainda não estiver refletido.
            </p>
          )}
        </div>
      )}

      {transacao.tem_parceria && (
        <p className="text-[11px] text-gray-400 mb-3">
          Parceria ({formatPercentual(porcParceria)}%, {formatMoeda(valorParceria)}) descontada do honorário desta
          fatia — ela recebe direto na conta dela, sem gerar despesa aqui. O restante ({formatMoeda(restante)}) é
          rateado entre os corretores/participantes abaixo.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {linhas.map((linha, indice) => {
          const valorFinal = Math.max(0, linha.valorBase - linha.desconto);
          return (
            <div key={indice} className="border border-gray-100 rounded-lg p-3">
              <div className="grid grid-cols-1 gap-1 md:grid-cols-[1fr_1fr_90px_100px_100px] md:gap-3 md:items-center">
                <span className="text-xs font-medium text-gray-800">{linha.parte}</span>
                <span className="text-xs text-gray-600 truncate">{linha.parceiroNome}</span>
                <span className="text-xs text-gray-500 whitespace-nowrap">{formatPercentual(linha.porcentagem)}%</span>
                <span className="text-xs text-gray-500 whitespace-nowrap">{formatMoeda(linha.valorBase)}</span>
                <span className="text-xs font-semibold text-gray-800 whitespace-nowrap">{formatMoeda(valorFinal)}</span>
              </div>

              {linha.desconto > 0 && (
                <div className="mt-2 flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <span className="text-[11px] text-amber-800">
                    Desconto de {formatMoeda(linha.desconto)}
                    {linha.observacao ? ` — ${linha.observacao}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => removerDesconto(indice)}
                    className="text-[11px] text-amber-700 underline shrink-0"
                  >
                    remover
                  </button>
                </div>
              )}

              {descontoAberto === indice ? (
                <div className="mt-2 flex flex-col md:flex-row gap-2 items-start md:items-center bg-gray-50 rounded-lg p-2">
                  <input
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1 w-28"
                    placeholder="Valor"
                    value={descontoValor}
                    onChange={(e) => setDescontoValor(e.target.value)}
                  />
                  <input
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1 flex-1 w-full md:w-auto"
                    placeholder="Motivo do desconto/débito"
                    value={descontoMotivo}
                    onChange={(e) => setDescontoMotivo(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => aplicarDesconto(indice)}
                      className="text-[11px] bg-primary text-white rounded-lg px-3 py-1 font-semibold"
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescontoAberto(null)}
                      className="text-[11px] text-gray-500 px-2 py-1"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => abrirDesconto(indice)}
                  className="mt-2 text-[11px] text-primary underline"
                >
                  {linha.desconto > 0 ? "Editar desconto/débito" : "+ Adicionar desconto/débito"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end mt-4">
        <button type="submit" className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold">
          Gerar rateio (lançar despesas)
        </button>
      </div>
    </form>
  );
}
