"use client";

import { useMemo, useState } from "react";
import { formatValorEditavel } from "@/lib/format";

type CategoriaOpcao = { id: string; nome: string; tipo: string | null };
type ClienteOpcao = { id: string; nome: string };
type ParceiroOpcao = { id: string; nome: string };

type MovimentacaoExistente = {
  id: string;
  tipo: string;
  categoria_id: string;
  cliente_interessado_id: string | null;
  cliente_proprietario_id: string | null;
  parceiro_id: string | null;
  contraparte_nome: string | null;
  descricao: string | null;
  comprovante_url: string | null;
  valor: unknown;
  vencimento: Date | string;
  pago: boolean;
  data_pagamento: Date | string | null;
  parcelas: number | null;
  num_parcela: number | null;
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
  action
}: {
  movimentacao: MovimentacaoExistente;
  categorias: CategoriaOpcao[];
  clientes: ClienteOpcao[];
  parceiros: ParceiroOpcao[];
  action: (formData: FormData) => void;
}) {
  const m = movimentacao;
  const rotuloPago = m.tipo === "Despesa" ? "pago" : "recebido";

  const categoriasFiltradas = useMemo(() => categorias.filter((c) => c.tipo === m.tipo), [categorias, m.tipo]);

  const clienteInteressadoInicial = clientes.find((c) => c.id === m.cliente_interessado_id) ?? null;
  const [clienteInteressadoId, setClienteInteressadoId] = useState(m.cliente_interessado_id ?? "");
  const [buscaClienteInteressado, setBuscaClienteInteressado] = useState(clienteInteressadoInicial?.nome ?? "");
  const [listaInteressadoAberta, setListaInteressadoAberta] = useState(false);

  const clienteProprietarioInicial = clientes.find((c) => c.id === m.cliente_proprietario_id) ?? null;
  const [clienteProprietarioId, setClienteProprietarioId] = useState(m.cliente_proprietario_id ?? "");
  const [buscaClienteProprietario, setBuscaClienteProprietario] = useState(clienteProprietarioInicial?.nome ?? "");
  const [listaProprietarioAberta, setListaProprietarioAberta] = useState(false);

  const [pago, setPago] = useState(m.pago);

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
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="movimentacaoId" value={m.id} />
      <input type="hidden" name="cliente_interessado_id" value={clienteInteressadoId} />
      <input type="hidden" name="cliente_proprietario_id" value={clienteProprietarioId} />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">{m.tipo}</div>
          {m.parcelas && m.parcelas > 1 && (
            <span className="text-xs text-gray-500">
              Parcela {m.num_parcela} de {m.parcelas}
            </span>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Categoria</label>
            <select className={CAMPO} name="categoria_id" defaultValue={m.categoria_id} required>
              {categoriasFiltradas.map((c) => (
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
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Envolvidos</div>
        {m.contraparte_nome && !m.cliente_interessado_id && !m.cliente_proprietario_id && (
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
        <div className="text-sm font-bold text-gray-800 mb-3">Situação</div>
        <label className="flex items-center gap-2 text-xs text-gray-700 mb-3">
          <input type="checkbox" name="pago" checked={pago} onChange={(e) => setPago(e.target.checked)} className="rounded" />
          Está {rotuloPago}
        </label>
        {pago && (
          <div className="max-w-xs">
            <label className={LABEL}>Data do pagamento</label>
            <input
              className={CAMPO}
              type="date"
              name="data_pagamento"
              defaultValue={inputDate(m.data_pagamento) || new Date().toISOString().slice(0, 10)}
            />
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Descrição</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Descrição</label>
            <input className={CAMPO} name="descricao" defaultValue={m.descricao ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Comprovante (link)</label>
            <input className={CAMPO} name="comprovante_url" defaultValue={m.comprovante_url ?? ""} />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold">
          Salvar alterações
        </button>
      </div>
    </form>
  );
}
