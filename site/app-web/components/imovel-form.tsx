"use client";

import { useMemo, useState } from "react";
import { TIPOS_IMOVEL, STATUS_IMOVEL, TIPOS_OFERTA } from "@/lib/imoveis/opcoes";
import { formatValorEditavel, formatInscricao } from "@/lib/format";
import { BotaoSubmit } from "@/components/botao-submit";
import { CampoLink } from "@/components/campo-link";
import { buscarCep, UF_PARA_ESTADO } from "@/lib/enderecos";

// Mesmo helper de máscara duplicado em todo formulário com CEP (ver
// components/cliente-form.tsx e components/parceiro-form.tsx).
function formatCep(v: string | null | undefined): string {
  const d = (v ?? "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

type ClienteOpcao = { id: string; nome: string; id_legado: string | null; parceiro_id: string | null };
type ParceiroOpcao = { id: string; nome: string };
type EstadoOpcao = { id: string; nome: string };
type CidadeOpcao = { id: string; nome: string; estado_id: string };
type BairroCadastrado = { cidade_id: string | null; bairro: string | null };
type LojaOpcao = { id: string; nome: string };

type ImovelExistente = {
  id: string;
  id_legado: string | null;
  tipo_imovel: string | null;
  parceiro_id: string | null;
  loja_id: string | null;
  pasta_url: string | null;
  inscricao: string | null;
  cep: string | null;
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
  proprietariosIniciais,
  parceiros,
  estados,
  cidades,
  bairrosCadastrados,
  lojas,
  action,
  embutido
}: {
  imovel: ImovelExistente | null;
  clientes: ClienteOpcao[];
  proprietariosIniciais: ClienteOpcao[];
  parceiros: ParceiroOpcao[];
  estados: EstadoOpcao[];
  cidades: CidadeOpcao[];
  bairrosCadastrados: BairroCadastrado[];
  lojas: LojaOpcao[];
  action: (formData: FormData) => void;
  embutido?: boolean;
}) {
  const i = imovel;

  // Um imóvel pode ter mais de um proprietário (ex.: herdeiros) — cada um é
  // um Cliente cadastrado separadamente, adicionado aqui à lista.
  const [proprietarios, setProprietarios] = useState<ClienteOpcao[]>(proprietariosIniciais);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [mostrarLista, setMostrarLista] = useState(false);
  const [parceiroId, setParceiroId] = useState(i?.parceiro_id ?? "");
  const [estadoId, setEstadoId] = useState(i?.estado_id ?? "");
  const [cidadeId, setCidadeId] = useState(i?.cidade_id ?? "");

  // Endereço com busca automática por CEP (ViaCEP) — mesmo padrão já usado
  // em Clientes e Parceiros (pedido explícito do usuário para os cadastros
  // de imóvel também). rua/n_predial/complemento/bairro precisam ser
  // controlados (não mais defaultValue) pra poder ser preenchidos pelo
  // resultado da busca.
  const [cep, setCep] = useState(i?.cep ? formatCep(i.cep) : "");
  const [rua, setRua] = useState(i?.rua ?? "");
  const [nPredial, setNPredial] = useState(i?.n_predial ?? "");
  const [complemento, setComplemento] = useState(i?.complemento ?? "");
  const [bairro, setBairro] = useState(i?.bairro ?? "");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepAvisoCidade, setCepAvisoCidade] = useState<string | null>(null);

  async function aoSairDoCep() {
    const digitos = cep.replace(/\D/g, "");
    if (digitos.length !== 8) return;
    setBuscandoCep(true);
    setCepAvisoCidade(null);
    try {
      const encontrado = await buscarCep(digitos);
      if (!encontrado) {
        setCepAvisoCidade("CEP não encontrado — preencha o endereço manualmente.");
        return;
      }
      setRua(encontrado.logradouro || rua);
      setBairro(encontrado.bairro || bairro);

      const nomeEstado = UF_PARA_ESTADO[encontrado.uf] ?? "";
      const estadoEncontrado = estados.find((e) => e.nome.toLowerCase() === nomeEstado.toLowerCase());
      if (estadoEncontrado) {
        setEstadoId(estadoEncontrado.id);
        const cidadeEncontrada = cidades.find(
          (cid) => cid.estado_id === estadoEncontrado.id && cid.nome.toLowerCase() === encontrado.localidade.toLowerCase()
        );
        if (cidadeEncontrada) {
          setCidadeId(cidadeEncontrada.id);
        } else {
          setCidadeId("");
          setCepAvisoCidade(`Cidade "${encontrado.localidade}" não está cadastrada — selecione manualmente abaixo.`);
        }
      } else {
        setCepAvisoCidade("Selecione o estado e a cidade manualmente abaixo.");
      }
    } finally {
      setBuscandoCep(false);
    }
  }

  // Autocomplete de Bairro "que vai aprendendo sozinho" (tipo EnumList do
  // AppSheet, pedido do usuário): em vez de uma lista fixa cadastrada à mão,
  // sugere os bairros que já foram digitados em outros imóveis da MESMA
  // cidade — a lista cresce sozinha conforme o cadastro vai enchendo. Como é
  // um <datalist>, continua sendo um campo de texto livre — a sugestão só
  // ajuda a digitar mais rápido e a manter o nome do bairro consistente
  // (evita "Centro" e "centro" virando dois bairros diferentes).
  const bairrosDaCidade = useMemo(() => {
    const set = new Set(
      bairrosCadastrados
        .filter((b) => b.cidade_id === cidadeId && b.bairro && b.bairro.trim())
        .map((b) => b.bairro!.trim())
    );
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [bairrosCadastrados, cidadeId]);

  const clientesFiltrados = useMemo(() => {
    const t = buscaCliente.trim().toLowerCase();
    const idsJaAdicionados = new Set(proprietarios.map((p) => p.id));
    const disponiveis = clientes.filter((c) => !idsJaAdicionados.has(c.id));
    if (!t) return disponiveis.slice(0, 30);
    return disponiveis.filter((c) => c.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [buscaCliente, clientes, proprietarios]);

  const cidadesDoEstado = useMemo(() => cidades.filter((c) => c.estado_id === estadoId), [cidades, estadoId]);

  function adicionarProprietario(c: ClienteOpcao) {
    const eraOPrimeiro = proprietarios.length === 0;
    setProprietarios((atual) => [...atual, c]);
    setBuscaCliente("");
    setMostrarLista(false);
    // Todo imóvel tende a ter o mesmo parceiro do primeiro cliente
    // adicionado — pré-preenche, mas continua editável caso precise ajustar.
    if (eraOPrimeiro && c.parceiro_id) setParceiroId(c.parceiro_id);
  }

  function removerProprietario(id: string) {
    setProprietarios((atual) => atual.filter((p) => p.id !== id));
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {i && <input type="hidden" name="imovelId" value={i.id} />}
      {embutido && <input type="hidden" name="_embed" value="1" />}
      {proprietarios.map((p) => (
        <input key={p.id} type="hidden" name="proprietario_id" value={p.id} />
      ))}

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
            <label className={LABEL}>Loja *</label>
            {/* Obrigatório (pedido do usuário em 01/08/2026) — dá suporte ao
                filtro de Loja no Topbar (ver lib/lojas/filtro.ts). Cadastro
                anterior a essa data sem loja definida aparece nos dois
                filtros até alguém abrir e escolher aqui. */}
            <select className={CAMPO} name="loja_id" defaultValue={i?.loja_id ?? ""} required>
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
          <CampoLink label="Pasta (link)" name="pasta_url" defaultValue={i?.pasta_url} />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Localização</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>CEP</label>
            <input
              className={CAMPO}
              name="cep"
              value={cep}
              onChange={(e) => setCep(formatCep(e.target.value))}
              onBlur={aoSairDoCep}
              placeholder="00000-000"
              maxLength={9}
            />
            {buscandoCep && <p className="text-[11px] text-gray-400 mt-1">Buscando endereço...</p>}
            {cepAvisoCidade && <p className="text-[11px] text-amber-600 mt-1">{cepAvisoCidade}</p>}
          </div>
          <div>
            <label className={LABEL}>Estado</label>
            <select
              className={CAMPO}
              name="estado_id"
              value={estadoId}
              onChange={(e) => {
                setEstadoId(e.target.value);
                setCidadeId("");
              }}
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
            <select className={CAMPO} name="cidade_id" value={cidadeId} onChange={(e) => setCidadeId(e.target.value)}>
              <option value="">—</option>
              {cidadesDoEstado.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Rua</label>
            <input className={CAMPO} name="rua" value={rua} onChange={(e) => setRua(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Número</label>
            <input className={CAMPO} name="n_predial" value={nPredial} onChange={(e) => setNPredial(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Complemento</label>
            <input
              className={CAMPO}
              name="complemento"
              value={complemento}
              onChange={(e) => setComplemento(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Bairro</label>
            <input
              className={CAMPO}
              name="bairro"
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
              list="lista-bairros"
            />
            <datalist id="lista-bairros">
              {bairrosDaCidade.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            {cidadeId && bairrosDaCidade.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-1">
                {bairrosDaCidade.length} bairro(s) já cadastrado(s) nessa cidade aparecem como sugestão ao digitar.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Vínculo</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="relative">
            <label className={LABEL}>Cliente (proprietário)</label>
            <p className="text-[11px] text-gray-400 mb-1">
              Pode ter mais de um proprietário (ex.: herdeiros) — adicione quantos forem necessários.
            </p>
            {proprietarios.length > 0 && (
              <div className="flex flex-col gap-1 mb-2">
                {proprietarios.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5"
                  >
                    <span className="text-gray-800 font-medium truncate">{p.nome}</span>
                    <button
                      type="button"
                      onClick={() => removerProprietario(p.id)}
                      className="text-gray-400 hover:text-red-600 ml-2"
                    >
                      remover
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              className={CAMPO}
              placeholder="+ Adicionar proprietário — digite para buscar..."
              value={buscaCliente}
              onChange={(e) => {
                setBuscaCliente(e.target.value);
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
                    onMouseDown={() => adicionarProprietario(c)}
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
              Preenchido automaticamente com o parceiro do primeiro proprietário adicionado — pode ajustar se necessário.
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
        <BotaoSubmit carregandoTexto="Salvando..." className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90">
          {i ? "Salvar alterações" : "Cadastrar imóvel"}
        </BotaoSubmit>
      </div>
    </form>
  );
}
