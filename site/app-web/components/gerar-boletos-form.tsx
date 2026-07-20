"use client";

import { useMemo, useState } from "react";
import { formatMoeda, formatValorEditavel, valorEditavelParaDecimal, hojeInputDate, somarMeses } from "@/lib/format";

type CategoriaOpcao = { id: string; nome: string };

type TransacaoBoleto = {
  id: string;
  status: string | null;
  valor_transacao: unknown;
  valor_caucao: unknown;
  dia_vencimento: number | null;
  data_assinatura: Date | string | null;
};

type Linha = {
  categoriaId: string;
  rotulo: string;
  valorTexto: string;
  vencimento: string;
  descricao: string;
};

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

const CATEGORIA_CAUCAO = "Locações - cauções";
const CATEGORIA_HONORARIO = "Locações";
const CATEGORIA_MENSAL = "Administração de Imóveis Locados";

// Soma meses a uma data ISO (YYYY-MM-DD) e, se tiver um dia de vencimento
// combinado no contrato, troca o dia do mês pra ele (limitado ao último dia
// do mês de destino, pra não estourar em fevereiro etc.).
function somarMesesComDia(dataISO: string, meses: number, diaVencimento: number | null): string {
  const d = new Date(dataISO + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + meses);
  if (diaVencimento) {
    const ultimoDiaDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(diaVencimento, ultimoDiaDoMes));
  }
  return d.toISOString().slice(0, 10);
}

// Monta a linha padrão pro índice global do boleto (1 = primeiro Recebimento
// já gerado pra essa transação, contando os que já existem): 1 = caução,
// 2 = honorários, 3 em diante = mensal + administração. É só um chute
// inicial — a tela deixa cada linha 100% editável, porque tem contrato
// atípico (sem caução, já veio direto pro mensal, etc.) que não segue essa
// régua certinha.
function linhaPadrao(
  indiceGlobal: number,
  transacao: TransacaoBoleto,
  categorias: CategoriaOpcao[],
  baseData: string
): Linha {
  const porNome = (nome: string) => categorias.find((c) => c.nome === nome)?.id ?? "";
  const vencimento = somarMesesComDia(baseData, indiceGlobal - 1, transacao.dia_vencimento);

  if (indiceGlobal === 1 && Number(transacao.valor_caucao ?? 0) > 0) {
    return {
      categoriaId: porNome(CATEGORIA_CAUCAO),
      rotulo: `Mês ${indiceGlobal} — Caução`,
      valorTexto: formatValorEditavel(transacao.valor_caucao),
      vencimento,
      descricao: "Caução"
    };
  }
  if (indiceGlobal === 1 || indiceGlobal === 2) {
    return {
      categoriaId: porNome(CATEGORIA_HONORARIO),
      rotulo: `Mês ${indiceGlobal} — Honorários`,
      valorTexto: formatValorEditavel(transacao.valor_transacao),
      vencimento,
      descricao: "Primeiro mês (honorários)"
    };
  }
  return {
    categoriaId: porNome(CATEGORIA_MENSAL),
    rotulo: `Mês ${indiceGlobal} — Mensal`,
    valorTexto: formatValorEditavel(transacao.valor_transacao),
    vencimento,
    descricao: "Aluguel mensal"
  };
}

export function GerarBoletosForm({
  transacao,
  categorias,
  mesesJaGerados,
  action
}: {
  transacao: TransacaoBoleto;
  categorias: CategoriaOpcao[];
  mesesJaGerados: number;
  action: (formData: FormData) => void;
}) {
  const comAdministracao = transacao.status === "Imóvel em Locação";
  const semAdministracao = transacao.status === "Imóvel em locação sem administração";

  const baseData = useMemo(() => {
    if (!transacao.data_assinatura) return hojeInputDate();
    return new Date(transacao.data_assinatura).toISOString().slice(0, 10);
  }, [transacao.data_assinatura]);

  const [qtdMeses, setQtdMeses] = useState(mesesJaGerados === 0 ? 3 : 1);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    Array.from({ length: semAdministracao ? 1 : mesesJaGerados === 0 ? 3 : 1 }, (_, i) =>
      linhaPadrao(mesesJaGerados + i + 1, transacao, categorias, baseData)
    )
  );

  function montarPrevia() {
    const n = semAdministracao ? 1 : Math.max(1, qtdMeses);
    setLinhas(Array.from({ length: n }, (_, i) => linhaPadrao(mesesJaGerados + i + 1, transacao, categorias, baseData)));
  }

  function atualizarLinha(indice: number, campo: keyof Linha, valor: string) {
    setLinhas((prev) => prev.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
  }

  function removerLinha(indice: number) {
    setLinhas((prev) => prev.filter((_, i) => i !== indice));
  }

  // Linha extra manual — com opção de Recorrência pra quando a movimentação
  // vier parcelada (ex.: um acordo de 12x). Ligando a Recorrência e
  // informando a quantidade, divide o Valor total em N parcelas (mesma conta
  // em centavos de criarMovimentacaoAction, resto na última) e lança uma
  // linha por mês a partir do Vencimento informado — igual ao parcelamento
  // do Financeiro.
  const [novaLinha, setNovaLinha] = useState({
    categoriaId: "",
    descricao: "",
    valorTexto: "",
    vencimento: hojeInputDate(),
    recorrente: false,
    parcelasTexto: ""
  });

  function adicionarLinhaExtra() {
    const valorTotal = valorEditavelParaDecimal(novaLinha.valorTexto) ?? 0;
    const qtd = novaLinha.recorrente ? Math.max(1, Number(novaLinha.parcelasTexto) || 1) : 1;

    const totalCentavos = Math.round(valorTotal * 100);
    const baseCentavos = Math.floor(totalCentavos / qtd);
    const restoCentavos = totalCentavos - baseCentavos * qtd;

    const categoriaId = novaLinha.categoriaId || categorias.find((c) => c.nome === CATEGORIA_MENSAL)?.id || "";

    const novasLinhas: Linha[] = Array.from({ length: qtd }, (_, indice) => {
      const i = indice + 1;
      const vencimentoParcela = i === 1 ? novaLinha.vencimento : somarMeses(novaLinha.vencimento, i - 1) || novaLinha.vencimento;
      const valorParcela = (baseCentavos + (i === qtd ? restoCentavos : 0)) / 100;
      return {
        categoriaId,
        rotulo: qtd > 1 ? `Extra — parcela ${i}/${qtd}` : "Extra",
        valorTexto: formatValorEditavel(valorParcela),
        vencimento: vencimentoParcela,
        descricao: novaLinha.descricao
      };
    });

    setLinhas((prev) => [...prev, ...novasLinhas]);
    setNovaLinha({ categoriaId: "", descricao: "", valorTexto: "", vencimento: hojeInputDate(), recorrente: false, parcelasTexto: "" });
  }

  const linhasParaEnviar = useMemo(
    () =>
      linhas.map((l) => ({
        categoria_id: l.categoriaId,
        valor: valorEditavelParaDecimal(l.valorTexto) ?? 0,
        vencimento: l.vencimento,
        descricao: l.descricao
      })),
    [linhas]
  );

  const totalPrevia = linhasParaEnviar.reduce((acc, l) => acc + l.valor, 0);

  if (!comAdministracao && !semAdministracao) return null;

  if (semAdministracao && mesesJaGerados > 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Movimentação</div>
        <p className="text-xs text-gray-400">
          Essa Locação sem administração já teve a movimentação gerada — veja a lista de movimentações abaixo. Sem
          administração só gera 1 (pra rodar o rateio uma vez).
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">
          Gerar movimentação {mesesJaGerados > 0 && <span className="text-gray-400 font-normal">(continuando do mês {mesesJaGerados + 1})</span>}
        </div>
        {comAdministracao && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Quantos meses gerar agora</label>
            <input
              type="number"
              min={1}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1 w-16"
              value={qtdMeses}
              onChange={(e) => setQtdMeses(Number(e.target.value) || 1)}
            />
            <button
              type="button"
              onClick={montarPrevia}
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50"
            >
              Montar prévia
            </button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400 mb-3">
        Prévia editável — confira categoria, valor e vencimento de cada linha antes de confirmar (contrato atípico?
        ajusta aqui mesmo, sem problema).
      </p>

      <div className="flex flex-col gap-2">
        {linhas.map((linha, indice) => (
          <div
            key={indice}
            className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_110px_130px_36px] md:items-center border border-gray-100 rounded-lg p-2"
          >
            <div>
              <label className={LABEL}>{linha.rotulo}</label>
              <select
                className={CAMPO}
                value={linha.categoriaId}
                onChange={(e) => atualizarLinha(indice, "categoriaId", e.target.value)}
              >
                <option value="">—</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Descrição</label>
              <input
                className={CAMPO}
                value={linha.descricao}
                onChange={(e) => atualizarLinha(indice, "descricao", e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Valor</label>
              <input
                className={CAMPO}
                value={linha.valorTexto}
                onChange={(e) => atualizarLinha(indice, "valorTexto", e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className={LABEL}>Vencimento</label>
              <input
                type="date"
                className={CAMPO}
                value={linha.vencimento}
                onChange={(e) => atualizarLinha(indice, "vencimento", e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => removerLinha(indice)}
              className="text-xs text-red-500 hover:text-red-700 self-end pb-2"
              title="Remover linha"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_110px_130px_auto] md:items-end bg-gray-50/50 border border-dashed border-gray-200 rounded-lg p-3">
        <div>
          <label className={LABEL}>Categoria</label>
          <select
            className={CAMPO}
            value={novaLinha.categoriaId}
            onChange={(e) => setNovaLinha((a) => ({ ...a, categoriaId: e.target.value }))}
          >
            <option value="">—</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Descrição</label>
          <input
            className={CAMPO}
            value={novaLinha.descricao}
            onChange={(e) => setNovaLinha((a) => ({ ...a, descricao: e.target.value }))}
          />
        </div>
        <div>
          <label className={LABEL}>{novaLinha.recorrente ? "Valor total da dívida" : "Valor"}</label>
          <input
            className={CAMPO}
            placeholder="0,00"
            value={novaLinha.valorTexto}
            onChange={(e) => setNovaLinha((a) => ({ ...a, valorTexto: e.target.value }))}
          />
        </div>
        <div>
          <label className={LABEL}>{novaLinha.recorrente ? "Vencimento da 1ª parcela" : "Vencimento"}</label>
          <input
            type="date"
            className={CAMPO}
            value={novaLinha.vencimento}
            onChange={(e) => setNovaLinha((a) => ({ ...a, vencimento: e.target.value }))}
          />
        </div>
        <button
          type="button"
          onClick={adicionarLinhaExtra}
          className="text-xs bg-white border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 font-semibold h-fit"
        >
          + Adicionar linha
        </button>

        <div className="md:col-span-5 flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={novaLinha.recorrente}
              onChange={(e) => setNovaLinha((a) => ({ ...a, recorrente: e.target.checked }))}
            />
            Recorrência (recebemos parcelado)
          </label>
          {novaLinha.recorrente && (
            <>
              <label className="text-xs text-gray-600">Quantas parcelas</label>
              <input
                type="number"
                min={2}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1 w-20"
                value={novaLinha.parcelasTexto}
                onChange={(e) => setNovaLinha((a) => ({ ...a, parcelasTexto: e.target.value }))}
              />
              <span className="text-[11px] text-gray-400">
                Divide o valor total em N parcelas iguais (resto na última) — uma por mês a partir do vencimento
                acima.
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-gray-500">
          Total da prévia: <span className="font-semibold text-gray-800">{formatMoeda(totalPrevia)}</span> em{" "}
          {linhas.length} movimentação(ões)
        </span>
        <form
          action={action}
          onSubmit={(e) => {
            if (linhas.length === 0) {
              e.preventDefault();
              return;
            }
            if (!window.confirm(`Gerar ${linhas.length} movimentação(ões) conforme a prévia acima?`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="transacao_id" value={transacao.id} />
          <input type="hidden" name="linhas" value={JSON.stringify(linhasParaEnviar)} />
          <button type="submit" className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold">
            Confirmar e gerar movimentação
          </button>
        </form>
      </div>
    </div>
  );
}
