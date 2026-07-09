"use client";

import { useMemo, useState } from "react";
import { TIPOS_IMOVEL } from "@/lib/imoveis/opcoes";
import { ESTADOS_CIVIS } from "@/lib/clientes/opcoes";
import { gerarContratoGestaoAction } from "@/app/portal/gestao/actions";

type ClienteLinha = {
  nome: string;
  rg: string;
  cpfCnpj: string;
  endereco: string;
  nacionalidade: string;
  estadoCivil: string;
  email: string;
  telefone: string;
};

function clienteVazio(): ClienteLinha {
  return {
    nome: "",
    rg: "",
    cpfCnpj: "",
    endereco: "",
    nacionalidade: "Brasileira",
    estadoCivil: "",
    email: "",
    telefone: ""
  };
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

export function PortalGestaoForm({
  corretor,
  estados,
  cidades
}: {
  corretor: { id: string; nome: string; creci: string | null; cpf: string | null };
  estados: { id: string; nome: string }[];
  cidades: { id: string; nome: string; estado_id: string }[];
}) {
  const [clientes, setClientes] = useState<ClienteLinha[]>([clienteVazio()]);

  const [tipoImovel, setTipoImovel] = useState("");
  const [rua, setRua] = useState("");
  const [nPredial, setNPredial] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [estadoId, setEstadoId] = useState("");
  const [cidadeId, setCidadeId] = useState("");
  const [valorVenda, setValorVenda] = useState("");
  const [matricula, setMatricula] = useState("");
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState("");

  const [prazoDias, setPrazoDias] = useState("");
  const [porcHonorario, setPorcHonorario] = useState("");
  const [dataFechamento, setDataFechamento] = useState(hojeISO());

  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: true; url: string } | { ok: false; erro: string } | null>(null);

  const cidadesDoEstado = useMemo(() => cidades.filter((c) => c.estado_id === estadoId), [cidades, estadoId]);

  function atualizarCliente(index: number, campo: keyof ClienteLinha, valor: string) {
    setClientes((atual) => atual.map((c, i) => (i === index ? { ...c, [campo]: valor } : c)));
  }

  function adicionarCliente() {
    setClientes((atual) => [...atual, clienteVazio()]);
  }

  function removerCliente(index: number) {
    setClientes((atual) => atual.filter((_, i) => i !== index));
  }

  async function handleGerar() {
    setEnviando(true);
    setResultado(null);
    try {
      const formData = new FormData();
      formData.set("clientesJson", JSON.stringify(clientes));
      formData.set("tipo_imovel", tipoImovel);
      formData.set("rua", rua);
      formData.set("n_predial", nPredial);
      formData.set("complemento", complemento);
      formData.set("bairro", bairro);
      formData.set("estado_id", estadoId);
      formData.set("cidade_id", cidadeId);
      formData.set("valor_venda", valorVenda);
      formData.set("matricula", matricula);
      formData.set("inscricao_municipal", inscricaoMunicipal);
      formData.set("prazo_gestao_dias", prazoDias);
      formData.set("porc_honorario", porcHonorario);
      formData.set("data_fechamento", dataFechamento);

      const r = await gerarContratoGestaoAction(formData);
      setResultado(r);
    } finally {
      setEnviando(false);
    }
  }

  const podeGerar =
    clientes.some((c) => c.nome.trim().length > 0) && tipoImovel && rua.trim().length > 0 && prazoDias.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">1. Cliente(s)</div>
        <p className="text-[11px] text-gray-400 mb-3">
          Só o primeiro cliente aparece no corpo do contrato — os demais (se houver) só assinam.
        </p>

        <div className="flex flex-col gap-4">
          {clientes.map((c, index) => (
            <div key={index} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">
                  {index === 0 ? "Cliente principal" : `Cliente adicional ${index + 1}`}
                </span>
                {clientes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removerCliente(index)}
                    className="text-[11px] text-gray-400 hover:text-red-600"
                  >
                    remover
                  </button>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Nome / Razão social</label>
                  <input
                    className={CAMPO}
                    value={c.nome}
                    onChange={(e) => atualizarCliente(index, "nome", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>RG</label>
                  <input className={CAMPO} value={c.rg} onChange={(e) => atualizarCliente(index, "rg", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>CPF / CNPJ</label>
                  <input
                    className={CAMPO}
                    value={c.cpfCnpj}
                    onChange={(e) => atualizarCliente(index, "cpfCnpj", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Endereço</label>
                  <input
                    className={CAMPO}
                    value={c.endereco}
                    onChange={(e) => atualizarCliente(index, "endereco", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Nacionalidade</label>
                  <input
                    className={CAMPO}
                    value={c.nacionalidade}
                    onChange={(e) => atualizarCliente(index, "nacionalidade", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Estado civil</label>
                  <select
                    className={CAMPO}
                    value={c.estadoCivil}
                    onChange={(e) => atualizarCliente(index, "estadoCivil", e.target.value)}
                  >
                    <option value="">—</option>
                    {ESTADOS_CIVIS.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Email</label>
                  <input
                    className={CAMPO}
                    value={c.email}
                    onChange={(e) => atualizarCliente(index, "email", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Telefone</label>
                  <input
                    className={CAMPO}
                    value={c.telefone}
                    onChange={(e) => atualizarCliente(index, "telefone", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={adicionarCliente}
          className="text-xs text-primary font-semibold mt-3 hover:opacity-80"
        >
          + Adicionar outro cliente
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">2. Imóvel</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Tipo de imóvel</label>
            <select className={CAMPO} value={tipoImovel} onChange={(e) => setTipoImovel(e.target.value)}>
              <option value="">—</option>
              {TIPOS_IMOVEL.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Rua</label>
            <input className={CAMPO} value={rua} onChange={(e) => setRua(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Número</label>
            <input className={CAMPO} value={nPredial} onChange={(e) => setNPredial(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Complemento</label>
            <input className={CAMPO} value={complemento} onChange={(e) => setComplemento(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Bairro</label>
            <input className={CAMPO} value={bairro} onChange={(e) => setBairro(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Estado</label>
            <select
              className={CAMPO}
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
            <select className={CAMPO} value={cidadeId} onChange={(e) => setCidadeId(e.target.value)}>
              <option value="">—</option>
              {cidadesDoEstado.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Valor de venda (R$)</label>
            <input
              className={CAMPO}
              placeholder="350.000,00"
              value={valorVenda}
              onChange={(e) => setValorVenda(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Matrícula</label>
            <input
              className={CAMPO}
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Inscrição municipal</label>
            <input
              className={CAMPO}
              value={inscricaoMunicipal}
              onChange={(e) => setInscricaoMunicipal(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">3. Cláusulas</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Prazo da gestão (dias)</label>
            <input
              className={CAMPO}
              placeholder="90"
              value={prazoDias}
              onChange={(e) => setPrazoDias(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Porcentagem honorários (%)</label>
            <input
              className={CAMPO}
              placeholder="6"
              value={porcHonorario}
              onChange={(e) => setPorcHonorario(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Data do fechamento</label>
            <input
              type="date"
              className={CAMPO}
              value={dataFechamento}
              onChange={(e) => setDataFechamento(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">4. Corretor responsável</div>
        <div className="grid md:grid-cols-2 gap-3 text-xs text-gray-700">
          <div>
            <span className="text-gray-400">Corretor: </span>
            {corretor.nome}
          </div>
          <div>
            <span className="text-gray-400">CRECI: </span>
            {corretor.creci ?? "não cadastrado"}
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Só corretores podem assinar este contrato — preenchido automaticamente com o seu cadastro.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!podeGerar || enviando}
          onClick={handleGerar}
          className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40 hover:opacity-90"
        >
          {enviando ? "Gerando..." : "Gerar contrato"}
        </button>
        {resultado?.ok && (
          <a
            href={resultado.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline font-semibold"
          >
            Baixar contrato gerado
          </a>
        )}
        {resultado && !resultado.ok && <span className="text-xs text-red-600">{resultado.erro}</span>}
      </div>
    </div>
  );
}
