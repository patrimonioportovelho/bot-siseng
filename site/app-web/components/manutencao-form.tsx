"use client";

import { useMemo, useState } from "react";
import {
  TIPOS_SERVICO,
  URGENCIAS,
  URGENCIA_LABEL,
  SOLICITADO_POR,
  SOLICITADO_POR_LABEL,
  CHAVE_POSSE,
  CHAVE_POSSE_LABEL
} from "@/lib/manutencao/opcoes";

type ImovelOpcao = {
  id: string;
  id_legado: string | null;
  endereco: string | null;
  proprietarioId: string | null;
  proprietarioNome: string | null;
};
type ClienteOpcao = { id: string; nome: string };
type PrestadorOpcao = { id: string; nome: string };

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

function labelImovel(i: ImovelOpcao): string {
  const partes = [i.id_legado ?? i.id.slice(0, 8), i.endereco].filter(Boolean);
  return partes.join(" — ");
}

export function ManutencaoForm({
  imoveis,
  clientes,
  prestadores,
  imovelIdInicial,
  action
}: {
  imoveis: ImovelOpcao[];
  clientes: ClienteOpcao[];
  prestadores: PrestadorOpcao[];
  imovelIdInicial?: string | null;
  action: (formData: FormData) => void;
}) {
  // Quando chega de "+ Nova manutenção" na ficha do Imóvel (?imovel_id=),
  // já vem com o imóvel (e o proprietário dele) pré-selecionado.
  const imovelInicial = imovelIdInicial ? imoveis.find((i) => i.id === imovelIdInicial) ?? null : null;

  const [imovelId, setImovelId] = useState(imovelInicial?.id ?? "");
  const [buscaImovel, setBuscaImovel] = useState(imovelInicial ? labelImovel(imovelInicial) : "");
  const [listaImovelAberta, setListaImovelAberta] = useState(false);

  const [clienteProprietarioId, setClienteProprietarioId] = useState(imovelInicial?.proprietarioId ?? "");
  const [buscaClienteProprietario, setBuscaClienteProprietario] = useState(imovelInicial?.proprietarioNome ?? "");
  const [listaProprietarioAberta, setListaProprietarioAberta] = useState(false);

  const [chavePosse, setChavePosse] = useState("imobiliaria");

  const imoveisFiltrados = useMemo(() => {
    const t = buscaImovel.trim().toLowerCase();
    if (!t) return imoveis.slice(0, 30);
    return imoveis.filter((i) => labelImovel(i).toLowerCase().includes(t)).slice(0, 30);
  }, [buscaImovel, imoveis]);

  const clientesFiltrados = useMemo(() => {
    const t = buscaClienteProprietario.trim().toLowerCase();
    if (!t) return clientes.slice(0, 30);
    return clientes.filter((c) => c.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [buscaClienteProprietario, clientes]);

  function selecionarImovel(i: ImovelOpcao) {
    setImovelId(i.id);
    setBuscaImovel(labelImovel(i));
    setListaImovelAberta(false);
    // Pré-preenche o proprietário a partir do imóvel — continua editável,
    // é só o ponto de partida (mesmo padrão do Financeiro).
    if (i.proprietarioId) {
      setClienteProprietarioId(i.proprietarioId);
      setBuscaClienteProprietario(i.proprietarioNome ?? "");
    } else {
      setClienteProprietarioId("");
      setBuscaClienteProprietario("");
    }
  }

  function selecionarClienteProprietario(c: ClienteOpcao) {
    setClienteProprietarioId(c.id);
    setBuscaClienteProprietario(c.nome);
    setListaProprietarioAberta(false);
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="imovel_id" value={imovelId} />
      <input type="hidden" name="cliente_proprietario_id" value={clienteProprietarioId} />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Imóvel</div>
        <div className="relative">
          <label className={LABEL}>Buscar imóvel (Id ou endereço)</label>
          <input
            className={CAMPO}
            placeholder="Digite o Id ou endereço..."
            value={buscaImovel}
            onChange={(e) => {
              setBuscaImovel(e.target.value);
              setImovelId("");
              setListaImovelAberta(true);
            }}
            onFocus={() => setListaImovelAberta(true)}
            onBlur={() => setTimeout(() => setListaImovelAberta(false), 150)}
            required
          />
          {listaImovelAberta && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-56 overflow-auto shadow-lg">
              {imoveisFiltrados.length === 0 && <p className="text-xs text-gray-400 p-3">Nenhum imóvel encontrado.</p>}
              {imoveisFiltrados.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onMouseDown={() => selecionarImovel(i)}
                  className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                >
                  {labelImovel(i)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">O que precisa ser feito</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className={LABEL}>Título</label>
            <input className={CAMPO} name="titulo" placeholder='Ex.: "Troca de telhas"' required />
          </div>
          <div>
            <label className={LABEL}>Tipo de serviço</label>
            <select className={CAMPO} name="tipo_servico" defaultValue="" required>
              <option value="" disabled>
                Selecione...
              </option>
              {TIPOS_SERVICO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.icone} {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Urgência</label>
            <select className={CAMPO} name="urgencia" defaultValue="media">
              {URGENCIAS.map((u) => (
                <option key={u} value={u}>
                  {URGENCIA_LABEL[u]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Solicitado por</label>
            <select className={CAMPO} name="solicitado_por" defaultValue="">
              <option value="">—</option>
              {SOLICITADO_POR.map((s) => (
                <option key={s} value={s}>
                  {SOLICITADO_POR_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Custo estimado</label>
            <input className={CAMPO} name="custo_estimado" placeholder="0,00" />
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
            <label className={LABEL}>Prestador (se já souber)</label>
            <select className={CAMPO} name="prestador_id" defaultValue="">
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
        <div className="text-sm font-bold text-gray-800 mb-3">Chave</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Posse da chave</label>
            <select
              className={CAMPO}
              name="chave_posse"
              value={chavePosse}
              onChange={(e) => setChavePosse(e.target.value)}
            >
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
              <input className={CAMPO} name="chave_com" placeholder="Ex.: João (corretor)" />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold">
          Salvar manutenção
        </button>
      </div>
    </form>
  );
}
