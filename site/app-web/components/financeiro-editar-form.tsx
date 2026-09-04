"use client";

import { useActionState, useMemo, useState } from "react";
import { formatValorEditavel } from "@/lib/format";
import { BotaoSubmit } from "@/components/botao-submit";
import { CampoLink } from "@/components/campo-link";

type CategoriaOpcao = { id: string; nome: string; tipo: string | null };
type ClienteOpcao = { id: string; nome: string };
type ParceiroOpcao = { id: string; nome: string };
type TransacaoOpcao = { id: string; id_legado: string | null; tipo: string };

// Categoria fixa que exige Transação vinculada — mesma checagem do servidor
// (app/financeiro/actions.ts), só pra mostrar o aviso na hora certa aqui.
const CATEGORIA_REPASSE_HONORARIO = "Repasse de Honorários Transações";

type MovimentacaoExistente = {
  id: string;
  tipo: string;
  categoria_id: string;
  cliente_interessado_id: string | null;
  cliente_proprietario_id: string | null;
  parceiro_id: string | null;
  transacao_id: string | null;
  contraparte_nome: string | null;
  descricao: string | null;
  comprovante_url: string | null;
  valor: unknown;
  vencimento: Date | string;
  pago: boolean;
  data_pagamento: Date | string | null;
  parcelas: number | null;
  num_parcela: number | null;
  forma_pagamento: string | null;
  gerado_automaticamente: boolean;
};

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

function inputDate(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function FinanceiroEditarForm({
  movimentacao,
  categorias,
  clientes,
  parceiros,
  transacoes,
  action
}: {
  movimentacao: MovimentacaoExistente;
  categorias: CategoriaOpcao[];
  clientes: ClienteOpcao[];
  parceiros: ParceiroOpcao[];
  transacoes: TransacaoOpcao[];
  // Retorna { erro } em vez de lançar — erro aparece inline sem apagar o
  // formulário (ver app/financeiro/actions.ts).
  action: (prevState: unknown, formData: FormData) => Promise<{ erro: string } | undefined | void>;
}) {
  const [resultado, formAction] = useActionState(action, undefined);
  const m = movimentacao;

  // Categoria vira estado controlado (era defaultValue) só pra saber, na
  // hora, se a categoria escolhida é Repasse de Honorários — pra mostrar o
  // aviso de "Transação obrigatória" reagindo à troca, sem precisar salvar
  // pra descobrir que faltou vincular.
  const [categoriaId, setCategoriaId] = useState(m.categoria_id);
  const categoriaSelecionada = categorias.find((c) => c.id === categoriaId) ?? null;
  const ehRepasseHonorario = categoriaSelecionada?.nome === CATEGORIA_REPASSE_HONORARIO;

  const categoriasFiltradas = useMemo(() => categorias.filter((c) => c.tipo === m.tipo), [categorias, m.tipo]);
  // Defensiva: se por algum motivo a categoria já salva na movimentação não
  // estiver na lista filtrada por tipo (ex.: dado antigo inconsistente), ela
  // ainda aparece selecionada em vez de o <select> cair silenciosamente na
  // primeira opção da lista (o que faria parecer que a categoria "sumiu").
  const categoriaAtual = categorias.find((c) => c.id === m.categoria_id) ?? null;
  const categoriasParaExibir =
    categoriaAtual && !categoriasFiltradas.some((c) => c.id === m.categoria_id)
      ? [categoriaAtual, ...categoriasFiltradas]
      : categoriasFiltradas;

  const clienteInteressadoInicial = clientes.find((c) => c.id === m.cliente_interessado_id) ?? null;
  const [clienteInteressadoId, setClienteInteressadoId] = useState(m.cliente_interessado_id ?? "");
  const [buscaClienteInteressado, setBuscaClienteInteressado] = useState(clienteInteressadoInicial?.nome ?? "");
  const [listaInteressadoAberta, setListaInteressadoAberta] = useState(false);

  const clienteProprietarioInicial = clientes.find((c) => c.id === m.cliente_proprietario_id) ?? null;
  const [clienteProprietarioId, setClienteProprietarioId] = useState(m.cliente_proprietario_id ?? "");
  const [buscaClienteProprietario, setBuscaClienteProprietario] = useState(clienteProprietarioInicial?.nome ?? "");
  const [listaProprietarioAberta, setListaProprietarioAberta] = useState(false);

  // Vínculo com a Transação (Locação/Compra e Venda) — achado de auditoria
  // de 04/09/2026 (transação e6eba069): o campo nem existia neste formulário,
  // então uma Despesa lançada sem transação vinculada (ex.: buscador da tela
  // de "Nova movimentação" digitado sem clicar numa sugestão) não tinha como
  // ser corrigida depois — ficava pra sempre invisível na aba "Movimentações"
  // da transação, mesmo já tendo parceiro e valor certos.
  function labelTransacao(t: TransacaoOpcao): string {
    return `${t.id_legado ?? t.id.slice(0, 8)} — ${t.tipo}`;
  }
  const transacaoInicial = transacoes.find((t) => t.id === m.transacao_id) ?? null;
  const [transacaoId, setTransacaoId] = useState(m.transacao_id ?? "");
  const [buscaTransacao, setBuscaTransacao] = useState(transacaoInicial ? labelTransacao(transacaoInicial) : "");
  const [listaTransacaoAberta, setListaTransacaoAberta] = useState(false);

  const transacoesFiltradas = useMemo(() => {
    const t = buscaTransacao.trim().toLowerCase();
    if (!t) return transacoes.slice(0, 30);
    return transacoes.filter((tr) => labelTransacao(tr).toLowerCase().includes(t)).slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaTransacao, transacoes]);

  function selecionarTransacao(t: TransacaoOpcao) {
    setTransacaoId(t.id);
    setBuscaTransacao(labelTransacao(t));
    setListaTransacaoAberta(false);
  }

  function removerTransacaoVinculada() {
    setTransacaoId("");
    setBuscaTransacao("");
  }

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

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="movimentacaoId" value={m.id} />
      <input type="hidden" name="cliente_interessado_id" value={clienteInteressadoId} />
      <input type="hidden" name="cliente_proprietario_id" value={clienteProprietarioId} />
      <input type="hidden" name="transacao_id" value={transacaoId} />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">{m.tipo}</div>
          <div className="flex items-center gap-2 flex-wrap">
            {m.forma_pagamento && <span className="text-xs text-gray-500">{m.forma_pagamento}</span>}
            {(m.parcelas ?? 0) > 1 && (
              <span className="text-xs text-gray-500">
                Parcela {m.num_parcela} de {m.parcelas}
              </span>
            )}
          </div>
        </div>
        {m.gerado_automaticamente && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mb-3 inline-block">
            Gerada automaticamente pelo rateio de honorários da transação vinculada.
          </p>
        )}

        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div>
            <label className={LABEL}>Categoria</label>
            <select
              className={CAMPO}
              name="categoria_id"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              required
            >
              {categoriasParaExibir.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Parceiro</label>
            <select className={CAMPO} name="parceiro_id" defaultValue={m.parceiro_id ?? ""}>
              <option value="">—</option>
              {parceiros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(ehRepasseHonorario || m.transacao_id) && (
          <div className="relative mt-3">
            <label className={LABEL}>
              Transação vinculada {ehRepasseHonorario && <span className="text-red-500">*</span>}
            </label>
            <div className="flex gap-2">
              <input
                className={CAMPO}
                placeholder="Digite pra buscar (Id ou tipo)..."
                value={buscaTransacao}
                onChange={(e) => {
                  setBuscaTransacao(e.target.value);
                  setTransacaoId("");
                  setListaTransacaoAberta(true);
                }}
                onFocus={() => setListaTransacaoAberta(true)}
                onBlur={() => setTimeout(() => setListaTransacaoAberta(false), 150)}
              />
              {transacaoId && (
                <button
                  type="button"
                  onClick={removerTransacaoVinculada}
                  className="text-xs text-gray-500 hover:text-red-600 px-2 whitespace-nowrap"
                >
                  Remover
                </button>
              )}
            </div>
            {listaTransacaoAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                {transacoesFiltradas.length === 0 && (
                  <p className="text-xs text-gray-400 p-3">Nenhuma transação encontrada.</p>
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
            {ehRepasseHonorario && !transacaoId && (
              <p className="text-[11px] text-red-600 mt-1">
                Obrigatório pra repasse de honorário — busque e clique numa opção da lista (não basta digitar), senão
                este lançamento fica invisível na aba "Movimentações" da transação.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Envolvidos</div>
        {m.contraparte_nome && !m.cliente_interessado_id && !m.cliente_proprietario_id && !m.parceiro_id && (
          <p className="text-[11px] text-gray-400 mb-2">
            Registro antigo importado da planilha, sem cliente vinculado: "{m.contraparte_nome}".
          </p>
        )}
        <div className="grid md:grid-cols-2 gap-3">
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
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Valor e vencimento</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Valor</label>
            <input className={CAMPO} name="valor" defaultValue={formatValorEditavel(m.valor)} required />
          </div>
          <div>
            <label className={LABEL}>Vencimento</label>
            <input className={CAMPO} type="date" name="vencimento" defaultValue={inputDate(m.vencimento)} required />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-2">Situação do pagamento</div>
        <p className="text-[11px] text-gray-500">
          A situação ({m.tipo === "Despesa" ? "Pendente → Conferido → Pago" : "Pendente → Conferido → Recebido"}) é
          alterada pelos botões na tela da movimentação — sai deste formulário de propósito, pra não pular etapa sem
          querer.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Descrição</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Descrição</label>
            <input className={CAMPO} name="descricao" defaultValue={m.descricao ?? ""} />
          </div>
          <div>
            <CampoLink label="Comprovante (link)" name="comprovante_url" defaultValue={m.comprovante_url} />
          </div>
        </div>
      </div>

      {resultado?.erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
          {resultado.erro} — o que você preencheu continua aí em cima, é só corrigir e salvar de novo.
        </div>
      )}

      <div className="flex justify-end">
        <BotaoSubmit carregandoTexto="Salvando..." className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold">
          Salvar alterações
        </BotaoSubmit>
      </div>
    </form>
  );
}
