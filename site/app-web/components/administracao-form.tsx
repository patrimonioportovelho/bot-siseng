"use client";

import { useMemo, useState } from "react";
import { STATUS_ADM, AGUA_OPCOES, ENERGIA_OPCOES } from "@/lib/administracoes/opcoes";
import { formatValorEditavel, formatPercentual, formatInscricao } from "@/lib/format";
import { CampoLink } from "@/components/campo-link";

type LojaOpcao = { id: string; nome: string };
type ParceiroOpcao = { id: string; nome: string };
type ClienteOpcao = { id: string; nome: string; id_legado: string | null; parceiro_id: string | null };
type ImovelOpcao = {
  id: string;
  id_legado: string | null;
  endereco: string | null;
  inscricao: string | null;
  proprietarios: { id: string; nome: string }[];
};

type AdministracaoExistente = {
  id: string;
  id_legado: string | null;
  loja_id: string;
  cliente_id: string;
  imovel_id: string;
  parceiro_id: string | null;
  status: string;
  data_entrada: Date | null;
  data_assinatura: Date | null;
  prazo_contrato_meses: number | null;
  valor_transacao: unknown;
  porc_honorario: unknown;
  tx_administracao: unknown;
  valor_cliente: unknown;
  valor_administracao: unknown;
  iptu: unknown;
  tem_vistoria: boolean | null;
  arquivo_vistoria_url: string | null;
  tem_condominio: boolean | null;
  condominio: unknown;
  agua: string | null;
  uc_caerd: string | null;
  energia: string | null;
  uc_energisa: string | null;
  observacao: string | null;
  pasta_url: string | null;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function labelImovel(i: ImovelOpcao): string {
  const insc = formatInscricao(i.inscricao);
  const qtdProprietarios = i.proprietarios.length > 1 ? `${i.proprietarios.length} proprietários` : null;
  const partes = [i.endereco ?? "(sem endereço)", insc ? `Insc. ${insc}` : null, qtdProprietarios].filter(Boolean);
  return partes.join(" — ");
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

export function AdministracaoForm({
  administracao,
  lojas,
  clientes,
  imoveis,
  parceiros,
  action
}: {
  administracao: AdministracaoExistente | null;
  lojas: LojaOpcao[];
  clientes: ClienteOpcao[];
  imoveis: ImovelOpcao[];
  parceiros: ParceiroOpcao[];
  action: (formData: FormData) => void;
}) {
  const a = administracao;

  const clienteInicial = clientes.find((c) => c.id === a?.cliente_id) ?? null;
  const [clienteId, setClienteId] = useState(a?.cliente_id ?? "");
  const [buscaCliente, setBuscaCliente] = useState(clienteInicial ? clienteInicial.nome : "");
  const [listaClienteAberta, setListaClienteAberta] = useState(false);
  const [parceiroId, setParceiroId] = useState(a?.parceiro_id ?? "");

  const imovelInicial = imoveis.find((i) => i.id === a?.imovel_id) ?? null;
  const [imovelId, setImovelId] = useState(a?.imovel_id ?? "");
  const [buscaImovel, setBuscaImovel] = useState(imovelInicial ? labelImovel(imovelInicial) : "");
  const [listaImovelAberta, setListaImovelAberta] = useState(false);

  const [temCondominio, setTemCondominio] = useState(a?.tem_condominio ?? false);
  const [temVistoria, setTemVistoria] = useState(a?.tem_vistoria ?? false);

  const clientesFiltrados = useMemo(() => {
    const t = buscaCliente.trim().toLowerCase();
    if (!t) return clientes.slice(0, 30);
    return clientes.filter((c) => c.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [buscaCliente, clientes]);

  // Depois de escolher o Cliente em Vínculo, a lista de Imóvel só mostra os
  // imóveis vinculados àquele cliente como proprietário — evita ter que
  // procurar entre todos os imóveis cadastrados.
  const imoveisDoCliente = useMemo(() => {
    if (!clienteId) return imoveis;
    return imoveis.filter((i) => i.proprietarios.some((p) => p.id === clienteId));
  }, [clienteId, imoveis]);

  const imoveisFiltrados = useMemo(() => {
    const t = buscaImovel.trim().toLowerCase();
    if (!t) return imoveisDoCliente.slice(0, 30);
    return imoveisDoCliente
      .filter((i) => (i.endereco ?? "").toLowerCase().includes(t) || (i.inscricao ?? "").toLowerCase().includes(t))
      .slice(0, 30);
  }, [buscaImovel, imoveisDoCliente]);

  function selecionarCliente(c: ClienteOpcao) {
    setClienteId(c.id);
    setBuscaCliente(c.nome);
    setListaClienteAberta(false);
    // Mesma lógica de Imóveis: o parceiro captador tende a ser o mesmo
    // parceiro responsável pelo cliente — pré-preenche, mas fica editável.
    if (c.parceiro_id) setParceiroId(c.parceiro_id);
    // Se o imóvel já escolhido não pertence a esse cliente, limpa a escolha
    // para forçar selecionar um dos imóveis vinculados a ele.
    const imovelAtual = imoveis.find((i) => i.id === imovelId);
    if (imovelAtual && !imovelAtual.proprietarios.some((p) => p.id === c.id)) {
      setImovelId("");
      setBuscaImovel("");
    }
  }

  function selecionarImovel(i: ImovelOpcao) {
    setImovelId(i.id);
    setBuscaImovel(labelImovel(i));
    setListaImovelAberta(false);
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {a && <input type="hidden" name="administracaoId" value={a.id} />}
      <input type="hidden" name="cliente_id" value={clienteId} />
      <input type="hidden" name="imovel_id" value={imovelId} />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Identificação</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Loja</label>
            <select className={CAMPO} name="loja_id" defaultValue={a?.loja_id ?? ""} required>
              <option value="" disabled>
                Selecione...
              </option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select className={CAMPO} name="status" defaultValue={a?.status ?? "Captação"}>
              {STATUS_ADM.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
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
          </div>
          <CampoLink label="Pasta (link)" name="pasta_url" defaultValue={a?.pasta_url} />
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
                setListaClienteAberta(true);
              }}
              onFocus={() => setListaClienteAberta(true)}
              onBlur={() => setTimeout(() => setListaClienteAberta(false), 150)}
            />
            {listaClienteAberta && (
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
          <div className="relative">
            <label className={LABEL}>Imóvel</label>
            {clienteId && (
              <p className="text-[11px] text-gray-400 mb-1">Mostrando só os imóveis vinculados a esse cliente.</p>
            )}
            <input
              className={CAMPO}
              placeholder="Digite endereço ou inscrição..."
              value={buscaImovel}
              onChange={(e) => {
                setBuscaImovel(e.target.value);
                setImovelId("");
                setListaImovelAberta(true);
              }}
              onFocus={() => setListaImovelAberta(true)}
              onBlur={() => setTimeout(() => setListaImovelAberta(false), 150)}
            />
            {listaImovelAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                {imoveisFiltrados.length === 0 && (
                  <p className="text-xs text-gray-400 p-3">Nenhum imóvel encontrado.</p>
                )}
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
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Datas e prazo</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Data de entrada</label>
            <input type="date" className={CAMPO} name="data_entrada" defaultValue={inputDate(a?.data_entrada ?? null)} />
          </div>
          <div>
            <label className={LABEL}>Data de assinatura</label>
            <input
              type="date"
              className={CAMPO}
              name="data_assinatura"
              defaultValue={inputDate(a?.data_assinatura ?? null)}
            />
          </div>
          <div>
            <label className={LABEL}>Prazo do contrato (meses)</label>
            <input className={CAMPO} name="prazo_contrato_meses" defaultValue={a?.prazo_contrato_meses ?? ""} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Valores</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Valor da transação (R$)</label>
            <input
              className={CAMPO}
              name="valor_transacao"
              placeholder="1.500,00"
              defaultValue={formatValorEditavel(a?.valor_transacao)}
            />
          </div>
          <div>
            <label className={LABEL}>Honorário na intermediação (%)</label>
            <input
              className={CAMPO}
              name="porc_honorario"
              placeholder="100"
              defaultValue={formatPercentual(a?.porc_honorario)}
            />
          </div>
          <div>
            <label className={LABEL}>Taxa de administração (%)</label>
            <input
              className={CAMPO}
              name="tx_administracao"
              placeholder="10"
              defaultValue={formatPercentual(a?.tx_administracao)}
            />
          </div>
          <div>
            <label className={LABEL}>Valor líquido do cliente (R$)</label>
            <input
              className={CAMPO}
              name="valor_cliente"
              placeholder="1.350,00"
              defaultValue={formatValorEditavel(a?.valor_cliente)}
            />
          </div>
          <div>
            <label className={LABEL}>Valor da administração (R$)</label>
            <input
              className={CAMPO}
              name="valor_administracao"
              placeholder="150,00"
              defaultValue={formatValorEditavel(a?.valor_administracao)}
            />
          </div>
          <div>
            <label className={LABEL}>IPTU (R$)</label>
            <input className={CAMPO} name="iptu" placeholder="80,00" defaultValue={formatValorEditavel(a?.iptu)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Condomínio, água e energia</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tem_condominio"
              name="tem_condominio"
              checked={temCondominio}
              onChange={(e) => setTemCondominio(e.target.checked)}
            />
            <label htmlFor="tem_condominio" className="text-xs text-gray-600">
              Tem condomínio
            </label>
          </div>
          <div>
            <label className={LABEL}>Valor do condomínio (R$)</label>
            <input
              className={CAMPO}
              name="condominio"
              placeholder="300,00"
              defaultValue={formatValorEditavel(a?.condominio)}
            />
          </div>
          <div>
            <label className={LABEL}>Água</label>
            <select className={CAMPO} name="agua" defaultValue={a?.agua ?? ""}>
              <option value="">—</option>
              {AGUA_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>UC Caerd</label>
            <input className={CAMPO} name="uc_caerd" defaultValue={a?.uc_caerd ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Energia</label>
            <select className={CAMPO} name="energia" defaultValue={a?.energia ?? ""}>
              <option value="">—</option>
              {ENERGIA_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>UC Energisa</label>
            <input className={CAMPO} name="uc_energisa" defaultValue={a?.uc_energisa ?? ""} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Vistoria</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tem_vistoria"
              name="tem_vistoria"
              checked={temVistoria}
              onChange={(e) => setTemVistoria(e.target.checked)}
            />
            <label htmlFor="tem_vistoria" className="text-xs text-gray-600">
              Tem vistoria
            </label>
          </div>
          <CampoLink label="Arquivo da vistoria (link)" name="arquivo_vistoria_url" defaultValue={a?.arquivo_vistoria_url} />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Observação</div>
        <textarea className={CAMPO + " min-h-24"} name="observacao" defaultValue={a?.observacao ?? ""} />
      </div>

      <div className="flex justify-end">
        <button type="submit" className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90">
          {a ? "Salvar alterações" : "Cadastrar administração"}
        </button>
      </div>
    </form>
  );
}
