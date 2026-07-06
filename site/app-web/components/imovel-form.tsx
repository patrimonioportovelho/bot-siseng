"use client";

import { useMemo, useState } from "react";
import { TIPOS_IMOVEL, STATUS_IMOVEL, TIPOS_OFERTA } from "@/lib/imoveis/opcoes";
import { formatValorEditavel, formatInscricao } from "@/lib/format";

type ClienteOpcao = { id: string; nome: string; id_legado: string | null; parceiro_id: string | null };
type ParceiroOpcao = { id: string; nome: string };
type EstadoOpcao = { id: string; nome: string };
type CidadeOpcao = { id: string; nome: string; estado_id: string };

type ImovelExistente = {
  id: string;
  id_legado: string | null;
  tipo_imovel: string | null;
  parceiro_id: string | null;
  cliente_vendedor_id: string | null;
  pasta_url: string | null;
  inscricao: string | null;
  rua: string | null;
  n_predial: string | null;
  complemento: string | null;
  bairro: string | null;
  estado_id: string | null;
  cidade_id: string | null;
  endereco: string | null;
  matricula: string | null;
  status_imovel: string | null;
  tipo_oferta: string | null;
  valor_venda: unknown;
  valor_avaliacao: unknown;
  validade_avaliacao: Date | null;
  descricao: string | null;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

export function ImovelForm({
  imovel,
  clientes,
  parceiros,
  estados,
  cidades,
  action
}: {
  imovel: ImovelExistente | null;
  clientes: ClienteOpcao[];
  parceiros: ParceiroOpcao[];
  estados: EstadoOpcao[];
  cidades: CidadeOpcao[];
  action: (formData: FormData) => void;
}) {
  const i = imovel;

  const clienteInicial = clientes.find((c) => c.id === i?.cliente_vendedor_id) ?? null;
  const [clienteId, setClienteId] = useState(i?.cliente_vendedor_id ?? "");
  const [buscaCliente, setBuscaCliente] = useState(clienteInicial ? clienteInicial.nome : "");
  const [mostrarLista, setMostrarLista] = useState(false);
  const [parceiroId, setParceiroId] = useState(i?.parceiro_id ?? "");
  const [estadoId, setEstadoId] = useState(i?.estado_id ?? "");

  const clientesFiltrados = useMemo(() => {
    const t = buscaCliente.trim().toLowerCase();
    if (!t) return clientes.slice(0, 30);
    return clientes.filter((c) => c.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [buscaCliente, clientes]);

  const cidadesDoEstado = useMemo(() => cidades.filter((c) => c.estado_id === estadoId), [cidades, estadoId]);

  function selecionarCliente(c: ClienteOpcao) {
    setClienteId(c.id);
    setBuscaCliente(c.nome);
    setMostrarLista(false);
    // Todo imóvel tem o mesmo parceiro do cliente que trouxe — pré-preenche,
    // mas continua editável caso precise de ajuste manual.
    if (c.parceiro_id) setParceiroId(c.parceiro_id);
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {i && <input type="hidden" name="imovelId" value={i.id} />}
      <input type="hidden" name="cliente_vendedor_id" value={clienteId} />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Identificação</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Tipo de imóvel</label>
            <select className={CAMPO} name="tipo_imovel" defaultValue={i?.tipo_imovel ?? ""}>
              <option value="">—</option>
              {TIPOS_IMOVEL.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Status do imóvel</label>
            <select className={CAMPO} name="status_imovel" defaultValue={i?.status_imovel ?? ""}>
              <option value="">—</option>
              {STATUS_IMOVEL.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Tipo de oferta</label>
            <select className={CAMPO} name="tipo_oferta" defaultValue={i?.tipo_oferta ?? ""}>
              <option value="">—</option>
              {TIPOS_OFERTA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Inscrição</label>
            <input
              className={CAMPO}
              name="inscricao"
              placeholder="01.23.456.7890.123"
              defaultValue={formatInscricao(i?.inscricao)}
            />
          </div>
          <div>
            <label className={LABEL}>Matrícula</label>
            <input className={CAMPO} name="matricula" defaultValue={i?.matricula ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Pasta (link)</label>
            <input className={CAMPO} name="pasta_url" defaultValue={i?.pasta_url ?? ""} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Localização</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Rua</label>
            <input className={CAMPO} name="rua" defaultValue={i?.rua ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Número</label>
            <input className={CAMPO} name="n_predial" defaultValue={i?.n_predial ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Complemento</label>
            <input className={CAMPO} name="complemento" defaultValue={i?.complemento ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Bairro</label>
            <input className={CAMPO} name="bairro" defaultValue={i?.bairro ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Estado</label>
            <select
              className={CAMPO}
              name="estado_id"
              value={estadoId}
              onChange={(e) => setEstadoId(e.target.value)}
            >
              <option value="">—</option>
              {estados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Cidade</label>
            <select className={CAMPO} name="cidade_id" defaultValue={i?.cidade_id ?? ""}>
              <option value="">—</option>
              {cidadesDoEstado.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Vínculo</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="relative">
            <label className={LABEL}>Cliente (proprietário)</label>
            <input
              className={CAMPO}
              placeholder="Digite para buscar..."
              value={buscaCliente}
              onChange={(e) => {
                setBuscaCliente(e.target.value);
                setClienteId("");
                setMostrarLista(true);
              }}
              onFocus={() => setMostrarLista(true)}
              onBlur={() => setTimeout(() => setMostrarLista(false), 150)}
            />
            {mostrarLista && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                {clientesFiltrados.length === 0 && (
                  <p className="text-xs text-gray-400 p-3">Nenhum cliente encontrado.</p>
                )}
                {clientesFiltrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => selecionarCliente(c)}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {c.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className={LABEL}>Parceiro (captador)</label>
            <select
              className={CAMPO}
              name="parceiro_id"
              value={parceiroId}
              onChange={(e) => setParceiroId(e.target.value)}
            >
              <option value="">—</option>
              {parceiros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Preenchido automaticamente com o parceiro do cliente selecionado — pode ajustar se necessário.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Valores</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Valor de venda (R$)</label>
            <input
              className={CAMPO}
              name="valor_venda"
              placeholder="350.000,00"
              defaultValue={formatValorEditavel(i?.valor_venda)}
            />
          </div>
          <div>
            <label className={LABEL}>Valor de avaliação (R$)</label>
            <input
              className={CAMPO}
              name="valor_avaliacao"
              placeholder="350.000,00"
              defaultValue={formatValorEditavel(i?.valor_avaliacao)}
            />
          </div>
          <div>
            <label className={LABEL}>Validade da avaliação</label>
            <input
              type="date"
              className={CAMPO}
              name="validade_avaliacao"
              defaultValue={inputDate(i?.validade_avaliacao ?? null)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Descrição</div>
        <textarea className={CAMPO + " min-h-24"} name="descricao" defaultValue={i?.descricao ?? ""} />
      </div>

      <div className="flex justify-end">
        <button type="submit" className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90">
          {i ? "Salvar alterações" : "Cadastrar imóvel"}
        </button>
      </div>
    </form>
  );
}
