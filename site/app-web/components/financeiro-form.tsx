"use client";

import { useMemo, useState } from "react";
import { formatMoeda, formatValorEditavel } from "@/lib/format";

type CategoriaOpcao = { id: string; nome: string; tipo: string | null };
type ClienteOpcao = { id: string; nome: string };
type ParceiroOpcao = { id: string; nome: string };
type TransacaoOpcao = {
  id: string;
  id_legado: string | null;
  tipo: string;
  valor_transacao: unknown;
  valor_caucao: unknown;
  porc_honorario: unknown;
  tem_parceria: boolean | null;
  porc_parceria: unknown;
  proprietarioId: string | null;
  proprietarioNome: string | null;
  interessadoId: string | null;
  interessadoNome: string | null;
  imovelEndereco: string | null;
  corretorProprietarioNome: string | null;
  corretorContraparteNome: string | null;
};

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Nomes exatos das categorias que disparam o seletor de contrato — precisam
// combinar com os nomes já importados da planilha, ver levantamento em
// categorias_financeiras. Compra e venda busca contrato tipo "Compra e
// Venda"; as três de locação buscam contrato tipo "Locação".
const CATEGORIA_COMPRA_E_VENDA = "Compra e venda";
const CATEGORIA_LOCACAO_CAUCAO = "Locações - cauções";
const CATEGORIAS_LOCACAO = ["Administração de Imóveis Locados", "Locações", "Locações - cauções"];

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function labelTransacao(t: TransacaoOpcao): string {
  const partes = [
    t.id_legado ?? t.id,
    t.imovelEndereco,
    t.proprietarioNome ? `Propr.: ${t.proprietarioNome}` : null,
    t.interessadoNome ? `Interess.: ${t.interessadoNome}` : null,
    formatMoeda(t.valor_transacao)
  ].filter(Boolean);
  return partes.join(" — ");
}

export function FinanceiroForm({
  categorias,
  clientes,
  parceiros,
  transacoes,
  action
}: {
  categorias: CategoriaOpcao[];
  clientes: ClienteOpcao[];
  parceiros: ParceiroOpcao[];
  transacoes: TransacaoOpcao[];
  action: (formData: FormData) => void;
}) {
  const [tipo, setTipo] = useState<"Despesa" | "Recebimento">("Despesa");
  const [categoriaId, setCategoriaId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<"À vista" | "Parcelado">("À vista");
  const [pago, setPago] = useState(false);

  const [valor, setValor] = useState("");
  const [parcelasQtd, setParcelasQtd] = useState("");

  const [transacaoId, setTransacaoId] = useState("");
  const [buscaTransacao, setBuscaTransacao] = useState("");
  const [listaTransacaoAberta, setListaTransacaoAberta] = useState(false);

  const [clienteInteressadoId, setClienteInteressadoId] = useState("");
  const [buscaClienteInteressado, setBuscaClienteInteressado] = useState("");
  const [listaInteressadoAberta, setListaInteressadoAberta] = useState(false);

  const [clienteProprietarioId, setClienteProprietarioId] = useState("");
  const [buscaClienteProprietario, setBuscaClienteProprietario] = useState("");
  const [listaProprietarioAberta, setListaProprietarioAberta] = useState(false);

  const categoriasFiltradas = useMemo(() => categorias.filter((c) => c.tipo === tipo), [categorias, tipo]);

  const categoriaSelecionada = categorias.find((c) => c.id === categoriaId) ?? null;
  const ehCategoriaCompraVenda = categoriaSelecionada?.nome === CATEGORIA_COMPRA_E_VENDA;
  const ehCategoriaLocacao = CATEGORIAS_LOCACAO.includes(categoriaSelecionada?.nome ?? "");
  const mostrarPickerTransacao = tipo === "Recebimento" && (ehCategoriaCompraVenda || ehCategoriaLocacao);

  // O contrato mostrado no picker depende da categoria: Compra e venda só
  // mostra contratos tipo Compra e Venda; as categorias de locação só
  // mostram contratos tipo Locação.
  const transacoesDoTipoCerto = useMemo(() => {
    const tipoContrato = ehCategoriaCompraVenda ? "Compra e Venda" : "Locação";
    return transacoes.filter((tr) => tr.tipo === tipoContrato);
  }, [transacoes, ehCategoriaCompraVenda]);

  const transacoesFiltradas = useMemo(() => {
    const t = buscaTransacao.trim().toLowerCase();
    if (!t) return transacoesDoTipoCerto.slice(0, 30);
    return transacoesDoTipoCerto
      .filter((tr) => labelTransacao(tr).toLowerCase().includes(t))
      .slice(0, 30);
  }, [buscaTransacao, transacoesDoTipoCerto]);

  const transacaoSelecionada = transacoes.find((tr) => tr.id === transacaoId) ?? null;

  const clientesFiltradosInteressado = useMemo(() => {
    const t = buscaClienteInteressado.trim().toLowerCase();
    if (!t) return clientes.slice(0, 30);
    return clientes.filter((c) => c.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [buscaClienteInteressado, clientes]);

  const clientesFiltradosProprietario = useMemo(() => {
    const t = buscaClienteProprietario.trim().toLowerCase();
    if (!t) return clientes.slice(0, 30);
    return clientes.filter((c) => c.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [buscaClienteProprietario, clientes]);

  function mudarTipo(novoTipo: "Despesa" | "Recebimento") {
    setTipo(novoTipo);
    setCategoriaId("");
    setTransacaoId("");
    setBuscaTransacao("");
  }

  function selecionarTransacao(t: TransacaoOpcao) {
    setTransacaoId(t.id);
    setBuscaTransacao(labelTransacao(t));
    setListaTransacaoAberta(false);

    // Pré-preenche os dois clientes a partir do contrato — tudo continua
    // editável depois, é só um ponto de partida.
    if (t.proprietarioId) {
      setClienteProprietarioId(t.proprietarioId);
      setBuscaClienteProprietario(t.proprietarioNome ?? "");
    }
    if (t.interessadoId) {
      setClienteInteressadoId(t.interessadoId);
      setBuscaClienteInteressado(t.interessadoNome ?? "");
    }

    // Em Compra e venda o valor do Recebimento é o honorário da imobiliária
    // (valor da transação x % de honorário), não o valor cheio do imóvel —
    // é isso que efetivamente entra na conta, o resto nunca passa por aqui.
    // Se tem parceria externa, a parte do parceiro já cai direto na conta
    // dele (não passa pela nossa movimentação) — então desconta ela também,
    // ficando só com o que a gente de fato recebe.
    if (t.tipo === "Compra e Venda" && t.valor_transacao) {
      let honorario = Number(t.valor_transacao) * Number(t.porc_honorario ?? 0);
      if (t.tem_parceria) honorario *= 1 - Number(t.porc_parceria ?? 0);
      setValor(formatValorEditavel(honorario));
    } else if (t.tipo === "Locação" && categoriaSelecionada?.nome === CATEGORIA_LOCACAO_CAUCAO) {
      // Cauções recebemos o valor de garantia combinado no contrato, não o
      // valor do aluguel.
      if (t.valor_caucao) setValor(formatValorEditavel(t.valor_caucao));
    } else if (t.valor_transacao) {
      // Administração de Imóveis Locados e Locações: mantém o valor cheio
      // do contrato (ex.: aluguel total parcelado) — o repasse ao
      // proprietário (aluguel menos a taxa de administração) é uma despesa
      // separada, gerada na hora que a parcela é recebida.
      setValor(formatValorEditavel(t.valor_transacao));
    }
  }

  function selecionarClienteInteressado(c: ClienteOpcao) {
    setClienteInteressadoId(c.id);
    setBuscaClienteInteressado(c.nome);
    setListaInteressadoAberta(false);
  }

  function selecionarClienteProprietario(c: ClienteOpcao) {
    setClienteProprietarioId(c.id);
    setBuscaClienteProprietario(c.nome);
    setListaProprietarioAberta(false);
  }

  // Aqui "Valor" é sempre o valor total da dívida (à vista ou parcelada) —
  // no modo Parcelado, o valor de cada parcela é o total dividido pela
  // quantidade informada, não um valor digitado à parte. O preview abaixo é
  // só ilustrativo; quem calcula de verdade (com o resto da divisão jogado
  // na última parcela) é criarMovimentacaoAction, no servidor.
  const valorTotalNum = Number(valor.replace(/\./g, "").replace(",", ".")) || 0;
  const parcelasNum = Number(parcelasQtd) || 0;
  const valorParcelaPreview = parcelasNum > 0 ? valorTotalNum / parcelasNum : null;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="cliente_interessado_id" value={clienteInteressadoId} />
      <input type="hidden" name="cliente_proprietario_id" value={clienteProprietarioId} />
      <input type="hidden" name="transacao_id" value={transacaoId} />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Tipo</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => mudarTipo("Despesa")}
            className={`text-xs px-4 py-2 rounded-lg border font-semibold ${
              tipo === "Despesa" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 bg-white"
            }`}
          >
            Despesa
          </button>
          <button
            type="button"
            onClick={() => mudarTipo("Recebimento")}
            className={`text-xs px-4 py-2 rounded-lg border font-semibold ${
              tipo === "Recebimento" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 bg-white"
            }`}
          >
            Recebimento
          </button>
          <input type="hidden" name="tipo" value={tipo} />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Categoria</div>
        <select
          className={CAMPO}
          name="categoria_id"
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          required
        >
          <option value="" disabled>
            Selecione...
          </option>
          {categoriasFiltradas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>

        {mostrarPickerTransacao && (
          <div className="relative mt-3">
            <label className={LABEL}>{ehCategoriaCompraVenda ? "Contrato de Compra e Venda" : "Contrato de Locação"}</label>
            <input
              className={CAMPO}
              placeholder="Digite pra buscar o contrato (Id, imóvel ou cliente)..."
              value={buscaTransacao}
              onChange={(e) => {
                setBuscaTransacao(e.target.value);
                setTransacaoId("");
                setListaTransacaoAberta(true);
              }}
              onFocus={() => setListaTransacaoAberta(true)}
              onBlur={() => setTimeout(() => setListaTransacaoAberta(false), 150)}
            />
            {listaTransacaoAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-56 overflow-auto shadow-lg">
                {transacoesFiltradas.length === 0 && (
                  <p className="text-xs text-gray-400 p-3">Nenhum contrato encontrado.</p>
                )}
                {transacoesFiltradas.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onMouseDown={() => selecionarTransacao(t)}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {labelTransacao(t)}
                  </button>
                ))}
              </div>
            )}

            {transacaoSelecionada && (transacaoSelecionada.corretorProprietarioNome || transacaoSelecionada.corretorContraparteNome) && (
              <p className="text-[11px] text-gray-400 mt-2">
                Corretor do proprietário: {transacaoSelecionada.corretorProprietarioNome ?? "—"} · Corretor da
                contraparte: {transacaoSelecionada.corretorContraparteNome ?? "—"}. O repasse de comissão pra eles é
                gerado depois, na tela desta movimentação (rateio de honorários).
              </p>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Envolvidos (quando for o caso)</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="relative">
            <label className={LABEL}>Cliente (interessado)</label>
            <input
              className={CAMPO}
              placeholder="Digite para buscar..."
              value={buscaClienteInteressado}
              onChange={(e) => {
                setBuscaClienteInteressado(e.target.value);
                setClienteInteressadoId("");
                setListaInteressadoAberta(true);
              }}
              onFocus={() => setListaInteressadoAberta(true)}
              onBlur={() => setTimeout(() => setListaInteressadoAberta(false), 150)}
            />
            {listaInteressadoAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                {clientesFiltradosInteressado.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => selecionarClienteInteressado(c)}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {c.nome}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <label className={LABEL}>Cliente (proprietário)</label>
            <input
              className={CAMPO}
              placeholder="Digite para buscar..."
              value={buscaClienteProprietario}
              onChange={(e) => {
                setBuscaClienteProprietario(e.target.value);
                setClienteProprietarioId("");
                setListaProprietarioAberta(true);
              }}
              onFocus={() => setListaProprietarioAberta(true)}
              onBlur={() => setTimeout(() => setListaProprietarioAberta(false), 150)}
            />
            {listaProprietarioAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                {clientesFiltradosProprietario.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => selecionarClienteProprietario(c)}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {c.nome}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={LABEL}>Parceiro</label>
            <select className={CAMPO} name="parceiro_id" defaultValue="">
              <option value="">—</option>
              {parceiros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Valor e forma de pagamento</div>

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setFormaPagamento("À vista")}
            className={`text-xs px-4 py-2 rounded-lg border font-semibold ${
              formaPagamento === "À vista" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 bg-white"
            }`}
          >
            À vista
          </button>
          <button
            type="button"
            onClick={() => setFormaPagamento("Parcelado")}
            className={`text-xs px-4 py-2 rounded-lg border font-semibold ${
              formaPagamento === "Parcelado" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 bg-white"
            }`}
          >
            Parcelado
          </button>
          <input type="hidden" name="forma_pagamento" value={formaPagamento} />
        </div>

        {formaPagamento === "À vista" ? (
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Valor</label>
              <input
                className={CAMPO}
                name="valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                required
              />
            </div>
            <div>
              <label className={LABEL}>Vencimento</label>
              <input className={CAMPO} type="date" name="vencimento" defaultValue={hoje()} required />
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>Valor total da dívida</label>
              <input
                className={CAMPO}
                name="valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                required
              />
            </div>
            <div>
              <label className={LABEL}>Quantidade de parcelas</label>
              <input
                className={CAMPO}
                name="parcelas"
                type="number"
                min={2}
                value={parcelasQtd}
                onChange={(e) => setParcelasQtd(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={LABEL}>Vencimento da 1ª parcela</label>
              <input className={CAMPO} type="date" name="vencimento" defaultValue={hoje()} required />
            </div>
            {valorParcelaPreview !== null && (
              <p className="text-[11px] text-gray-500 md:col-span-3">
                {parcelasQtd || 0} parcelas de {formatMoeda(valorParcelaPreview)} (a última pode variar poucos centavos
                por causa do arredondamento), uma por mês a partir do vencimento informado.
              </p>
            )}
          </div>
        )}
      </div>

      {formaPagamento === "À vista" && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Situação</div>
          <label className="flex items-center gap-2 text-xs text-gray-700 mb-3">
            <input
              type="checkbox"
              name="pago"
              checked={pago}
              onChange={(e) => setPago(e.target.checked)}
              className="rounded"
            />
            Já está {tipo === "Despesa" ? "pago" : "recebido"}
          </label>
          {!pago && (
            <p className="text-[11px] text-gray-400">
              Fica registrado como Pendente — dá pra marcar como {tipo === "Despesa" ? "pago" : "recebido"} depois, no
              detalhe.
            </p>
          )}
          {pago && (
            <div className="max-w-xs">
              <label className={LABEL}>Data do pagamento</label>
              <input className={CAMPO} type="date" name="data_pagamento" defaultValue={hoje()} />
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Descrição</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Descrição</label>
            <input className={CAMPO} name="descricao" placeholder="Ex.: repasse aluguel, conta de luz..." />
          </div>
          <div>
            <label className={LABEL}>Comprovante (link)</label>
            <input className={CAMPO} name="comprovante_url" placeholder="Link do Drive, se tiver" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold">
          Salvar movimentação
        </button>
      </div>
    </form>
  );
}
