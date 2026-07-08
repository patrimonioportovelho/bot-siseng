"use client";

import { useMemo, useState } from "react";
import { formatValorEditavel } from "@/lib/format";
import {
  TIPOS_SERVICO,
  URGENCIAS,
  URGENCIA_LABEL,
  SOLICITADO_POR,
  SOLICITADO_POR_LABEL,
  AUTORIZADO_POR,
  AUTORIZADO_POR_LABEL,
  CHAVE_POSSE,
  CHAVE_POSSE_LABEL,
  COLUNAS_KANBAN
} from "@/lib/manutencao/opcoes";

type ClienteOpcao = { id: string; nome: string };
type PrestadorOpcao = { id: string; nome: string };

type ManutencaoExistente = {
  id: string;
  titulo: string;
  tipo_servico: string;
  urgencia: string;
  solicitado_por: string | null;
  cliente_proprietario_id: string | null;
  prestador_id: string | null;
  custo_estimado: unknown;
  custo_final: unknown;
  autorizado_por: string;
  chave_posse: string;
  chave_com: string | null;
  coluna: string;
};

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

export function ManutencaoEditarForm({
  manutencao,
  clientes,
  prestadores,
  clienteProprietarioNomeInicial,
  action
}: {
  manutencao: ManutencaoExistente;
  clientes: ClienteOpcao[];
  prestadores: PrestadorOpcao[];
  clienteProprietarioNomeInicial: string | null;
  action: (formData: FormData) => void;
}) {
  const m = manutencao;

  const [clienteProprietarioId, setClienteProprietarioId] = useState(m.cliente_proprietario_id ?? "");
  const [buscaClienteProprietario, setBuscaClienteProprietario] = useState(clienteProprietarioNomeInicial ?? "");
  const [listaProprietarioAberta, setListaProprietarioAberta] = useState(false);
  const [chavePosse, setChavePosse] = useState(m.chave_posse);

  const clientesFiltrados = useMemo(() => {
    const t = buscaClienteProprietario.trim().toLowerCase();
    if (!t) return clientes.slice(0, 30);
    return clientes.filter((c) => c.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [buscaClienteProprietario, clientes]);

  function selecionarClienteProprietario(c: ClienteOpcao) {
    setClienteProprietarioId(c.id);
    setBuscaClienteProprietario(c.nome);
    setListaProprietarioAberta(false);
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="manutencaoId" value={m.id} />
      <input type="hidden" name="cliente_proprietario_id" value={clienteProprietarioId} />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">O que precisa ser feito</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className={LABEL}>Título</label>
            <input className={CAMPO} name="titulo" defaultValue={m.titulo} required />
          </div>
          <div>
            <label className={LABEL}>Tipo de serviço</label>
            <select className={CAMPO} name="tipo_servico" defaultValue={m.tipo_servico}>
              {TIPOS_SERVICO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.icone} {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Urgência</label>
            <select className={CAMPO} name="urgencia" defaultValue={m.urgencia}>
              {URGENCIAS.map((u) => (
                <option key={u} value={u}>
                  {URGENCIA_LABEL[u]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Solicitado por</label>
            <select className={CAMPO} name="solicitado_por" defaultValue={m.solicitado_por ?? ""}>
              <option value="">—</option>
              {SOLICITADO_POR.map((s) => (
                <option key={s} value={s}>
                  {SOLICITADO_POR_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Coluna (etapa)</label>
            <select className={CAMPO} name="coluna" defaultValue={m.coluna}>
              {COLUNAS_KANBAN.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Envolvidos</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="relative">
            <label className={LABEL}>Proprietário</label>
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
                {clientesFiltrados.map((c) => (
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
            <label className={LABEL}>Prestador</label>
            <select className={CAMPO} name="prestador_id" defaultValue={m.prestador_id ?? ""}>
              <option value="">—</option>
              {prestadores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Custo e autorização</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Custo estimado</label>
            <input className={CAMPO} name="custo_estimado" defaultValue={formatValorEditavel(m.custo_estimado)} placeholder="0,00" />
          </div>
          <div>
            <label className={LABEL}>Custo final</label>
            <input className={CAMPO} name="custo_final" defaultValue={formatValorEditavel(m.custo_final)} placeholder="0,00" />
          </div>
          <div>
            <label className={LABEL}>Autorizado por</label>
            <select className={CAMPO} name="autorizado_por" defaultValue={m.autorizado_por}>
              {AUTORIZADO_POR.map((a) => (
                <option key={a} value={a}>
                  {AUTORIZADO_POR_LABEL[a]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Chave</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Posse da chave</label>
            <select className={CAMPO} name="chave_posse" value={chavePosse} onChange={(e) => setChavePosse(e.target.value)}>
              {CHAVE_POSSE.map((c) => (
                <option key={c} value={c}>
                  {CHAVE_POSSE_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          {chavePosse !== "imobiliaria" && (
            <div>
              <label className={LABEL}>Com quem (nome)</label>
              <input className={CAMPO} name="chave_com" defaultValue={m.chave_com ?? ""} placeholder="Ex.: João (corretor)" />
            </div>
          )}
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
