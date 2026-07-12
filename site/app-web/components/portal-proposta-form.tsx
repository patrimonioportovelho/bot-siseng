"use client";

import { useState } from "react";
import { ESTADOS_CIVIS } from "@/lib/clientes/opcoes";
import { TIPO_CONDICAO_OPCOES, FORMA_PAGAMENTO_CONDICAO_OPCOES, MOMENTO_CONDICAO_OPCOES } from "@/lib/transacoes/opcoes";
import { gerarPropostaAction } from "@/app/portal/proposta/actions";

type ClienteLinha = {
  // Presente só quando o corretor escolheu um cliente já cadastrado — nesse
  // caso os campos ficam travados (só leitura), pra não editar um cadastro
  // existente por aqui.
  clienteId?: string;
  nome: string;
  cpfCnpj: string;
  endereco: string;
  estadoCivil: string;
};

type ClienteDoCorretor = {
  id: string;
  nome: string;
  cpfCnpj: string;
  endereco: string;
  estadoCivil: string;
};

type CondicaoPagamento = {
  tipo: string;
  valor: string;
  forma_pagamento: string;
  parcelas: string;
  momento: string;
  data_pagamento: string;
};

function clienteVazio(): ClienteLinha {
  return { nome: "", cpfCnpj: "", endereco: "", estadoCivil: "" };
}

function condicaoVazia(): CondicaoPagamento {
  return { tipo: TIPO_CONDICAO_OPCOES[0], valor: "", forma_pagamento: "", parcelas: "", momento: "", data_pagamento: "" };
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const CAMPO_TRAVADO = "text-xs border border-gray-200 rounded-lg px-3 py-1.5 w-full bg-gray-100 text-gray-500";
const LABEL = "text-xs text-gray-600 block mb-1";

export function PortalPropostaForm({
  corretor,
  clientesDoCorretor
}: {
  corretor: { id: string; nome: string; creci: string | null; cpf: string | null };
  clientesDoCorretor: ClienteDoCorretor[];
}) {
  const [cliente, setCliente] = useState<ClienteLinha>(clienteVazio());

  const [descricao, setDescricao] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");

  const [valorProposta, setValorProposta] = useState("");
  const [dataFechamento, setDataFechamento] = useState(hojeISO());

  const [condicoes, setCondicoes] = useState<CondicaoPagamento[]>([]);
  const [novaCondicao, setNovaCondicao] = useState<CondicaoPagamento>(condicaoVazia());

  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: true; url: string } | { ok: false; erro: string } | null>(null);

  function atualizarCliente(campo: keyof ClienteLinha, valor: string) {
    setCliente((atual) => ({ ...atual, [campo]: valor }));
  }

  // Ao escolher um cliente já cadastrado, preenche e trava os campos — só
  // reaproveita, não edita cadastro existente por aqui. Voltando pra "+ Novo
  // cliente" limpa a linha.
  function selecionarClienteExistente(clienteId: string) {
    if (!clienteId) {
      setCliente(clienteVazio());
      return;
    }
    const encontrado = clientesDoCorretor.find((c) => c.id === clienteId);
    if (!encontrado) return;
    setCliente({
      clienteId: encontrado.id,
      nome: encontrado.nome,
      cpfCnpj: encontrado.cpfCnpj,
      endereco: encontrado.endereco,
      estadoCivil: encontrado.estadoCivil
    });
  }

  function adicionarCondicao() {
    if (!novaCondicao.valor.trim()) return;
    setCondicoes((atual) => [...atual, novaCondicao]);
    setNovaCondicao(condicaoVazia());
  }

  function removerCondicao(index: number) {
    setCondicoes((atual) => atual.filter((_, i) => i !== index));
  }

  async function handleGerar() {
    setEnviando(true);
    setResultado(null);
    try {
      const formData = new FormData();
      formData.set("clienteJson", JSON.stringify(cliente));
      formData.set("descricao", descricao);
      formData.set("rua", rua);
      formData.set("numero", numero);
      formData.set("complemento", complemento);
      formData.set("bairro", bairro);
      formData.set("cidade", cidade);
      formData.set("estado", estado);
      formData.set("valor_proposta", valorProposta);
      formData.set("data_fechamento", dataFechamento);
      formData.set("condicoesJson", JSON.stringify(condicoes));

      const r = await gerarPropostaAction(formData);
      setResultado(r);
    } finally {
      setEnviando(false);
    }
  }

  const podeGerar = cliente.nome.trim().length > 0 && rua.trim().length > 0 && valorProposta.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">1. Cliente (comprador/interessado)</div>
        <p className="text-[11px] text-gray-400 mb-3">
          Se o cliente já tem cadastro, escolha ele na lista em vez de digitar de novo (evita duplicar).
        </p>

        {clientesDoCorretor.length > 0 && (
          <div className="mb-3">
            <label className={LABEL}>Cliente já cadastrado (opcional)</label>
            <select
              className={CAMPO}
              value={cliente.clienteId ?? ""}
              onChange={(e) => selecionarClienteExistente(e.target.value)}
            >
              <option value="">+ Novo cliente</option>
              {clientesDoCorretor.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.nome}
                  {cc.cpfCnpj ? ` — ${cc.cpfCnpj}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Nome / Razão social</label>
            <input
              className={cliente.clienteId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(cliente.clienteId)}
              value={cliente.nome}
              onChange={(e) => atualizarCliente("nome", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>CPF / CNPJ</label>
            <input
              className={cliente.clienteId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(cliente.clienteId)}
              value={cliente.cpfCnpj}
              onChange={(e) => atualizarCliente("cpfCnpj", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Endereço</label>
            <input
              className={cliente.clienteId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(cliente.clienteId)}
              value={cliente.endereco}
              onChange={(e) => atualizarCliente("endereco", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Estado civil</label>
            <select
              className={cliente.clienteId ? CAMPO_TRAVADO : CAMPO}
              disabled={Boolean(cliente.clienteId)}
              value={cliente.estadoCivil}
              onChange={(e) => atualizarCliente("estadoCivil", e.target.value)}
            >
              <option value="">—</option>
              {ESTADOS_CIVIS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">2. Imóvel</div>
        <p className="text-[11px] text-gray-400 mb-3">
          Não é cadastrado no sistema — só entra no texto da proposta, do jeito que for digitado aqui.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className={LABEL}>Descrição do imóvel</label>
            <input className={CAMPO} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Rua</label>
            <input className={CAMPO} value={rua} onChange={(e) => setRua(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Número</label>
            <input className={CAMPO} value={numero} onChange={(e) => setNumero(e.target.value)} />
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
            <label className={LABEL}>Cidade</label>
            <input className={CAMPO} value={cidade} onChange={(e) => setCidade(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Estado</label>
            <input className={CAMPO} value={estado} onChange={(e) => setEstado(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">3. Valor e condições</div>
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className={LABEL}>Valor da proposta (R$)</label>
            <input
              className={CAMPO}
              placeholder="350.000,00"
              value={valorProposta}
              onChange={(e) => setValorProposta(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Data da proposta</label>
            <input
              type="date"
              className={CAMPO}
              value={dataFechamento}
              onChange={(e) => setDataFechamento(e.target.value)}
            />
          </div>
        </div>

        {condicoes.length > 0 && (
          <div className="flex flex-col gap-2 mb-4">
            {condicoes.map((c, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-2 text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
              >
                <span className="text-gray-700">
                  {c.tipo}: R$ {c.valor}
                  {c.parcelas && <span className="text-gray-500"> · {c.parcelas}x</span>}
                  {c.forma_pagamento && <span className="text-gray-500"> · {c.forma_pagamento}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => removerCondicao(index)}
                  className="text-[11px] text-gray-400 hover:text-red-600"
                >
                  remover
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-3 items-end bg-gray-50/50 border border-dashed border-gray-200 rounded-lg p-3">
          <div>
            <label className={LABEL}>Tipo</label>
            <select
              className={CAMPO}
              value={novaCondicao.tipo}
              onChange={(e) => setNovaCondicao((a) => ({ ...a, tipo: e.target.value }))}
            >
              {TIPO_CONDICAO_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Valor (R$)</label>
            <input
              className={CAMPO}
              placeholder="35.000,00"
              value={novaCondicao.valor}
              onChange={(e) => setNovaCondicao((a) => ({ ...a, valor: e.target.value }))}
            />
          </div>
          <div>
            <label className={LABEL}>Forma de pagamento</label>
            <select
              className={CAMPO}
              value={novaCondicao.forma_pagamento}
              onChange={(e) => setNovaCondicao((a) => ({ ...a, forma_pagamento: e.target.value }))}
            >
              <option value="">—</option>
              {FORMA_PAGAMENTO_CONDICAO_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Parcelas</label>
            <input
              className={CAMPO}
              placeholder="6"
              value={novaCondicao.parcelas}
              onChange={(e) => setNovaCondicao((a) => ({ ...a, parcelas: e.target.value }))}
            />
          </div>
          <div>
            <label className={LABEL}>Momento</label>
            <select
              className={CAMPO}
              value={novaCondicao.momento}
              onChange={(e) => setNovaCondicao((a) => ({ ...a, momento: e.target.value }))}
            >
              <option value="">—</option>
              {MOMENTO_CONDICAO_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Data de pagamento</label>
            <input
              type="date"
              className={CAMPO}
              value={novaCondicao.data_pagamento}
              onChange={(e) => setNovaCondicao((a) => ({ ...a, data_pagamento: e.target.value }))}
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="button"
              onClick={adicionarCondicao}
              className="text-xs bg-white border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 font-semibold"
            >
              + Adicionar condição
            </button>
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
          Preenchido automaticamente com o seu cadastro.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!podeGerar || enviando}
          onClick={handleGerar}
          className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40 hover:opacity-90"
        >
          {enviando ? "Gerando..." : "Gerar proposta"}
        </button>
        {resultado?.ok && (
          <a
            href={resultado.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline font-semibold"
          >
            Baixar proposta gerada
          </a>
        )}
        {resultado && !resultado.ok && <span className="text-xs text-red-600">{resultado.erro}</span>}
      </div>
    </div>
  );
}
