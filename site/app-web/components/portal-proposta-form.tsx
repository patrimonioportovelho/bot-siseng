"use client";

import { useEffect, useState } from "react";
import {
  ESTADOS_CIVIS,
  ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL,
  TIPOS_CONTA,
  TIPOS_PIX,
  TIPOS_CLIENTE
} from "@/lib/clientes/opcoes";
import { TIPO_CONDICAO_OPCOES, FORMA_PAGAMENTO_CONDICAO_OPCOES, MOMENTO_CONDICAO_OPCOES } from "@/lib/transacoes/opcoes";
import { validarCpfCnpj } from "@/lib/clientes/validacao";
import { buscarCep, UF_PARA_ESTADO } from "@/lib/enderecos";
import { gerarPropostaAction } from "@/app/portal/proposta/actions";

type Banco = { id: string; nome: string; codigo: string | null };

type ClienteLinha = {
  // Presente só quando o corretor escolheu um cliente já cadastrado — nesse
  // caso mostra só um resumo (não edita cadastro existente por aqui).
  clienteId?: string;
  // Sempre perguntado antes do resto — Pessoa Física ou Pessoa Jurídica
  // (mesmo pente-fino da Central de Clientes, ver components/cliente-form.tsx).
  tipoCliente: string;
  nome: string;
  rg: string;
  cpfCnpj: string;
  // Endereço de Pessoa Física é dividido (CEP/logradouro/número/complemento/
  // bairro/cidade/estado); Pessoa Jurídica usa "endereco" como Sede em texto
  // livre solto.
  endereco: string;
  cep: string;
  rua: string;
  nPredial: string;
  complemento: string;
  bairro: string;
  estadoId: string;
  cidadeId: string;
  nomeMae: string;
  nomePai: string;
  estadoCivil: string;
  // "" (não perguntado), "true" ou "false" — só perguntado/mostrado quando
  // estadoCivil é um dos que pedem (ver ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL).
  uniaoEstavel: string;
  profissao: string;
  // Dados bancários — mesmo cadastro completo do administrativo (ver
  // components/cliente-form.tsx), liberado aqui pro corretor já deixar o
  // cliente novo com a conta certinha desde o cadastro.
  bancoId: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  tipoPix: string;
  pix: string;
};

type ClienteDoCorretor = {
  id: string;
  nome: string;
  cpfCnpj: string;
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
  return {
    tipoCliente: "",
    nome: "",
    rg: "",
    cpfCnpj: "",
    endereco: "",
    cep: "",
    rua: "",
    nPredial: "",
    complemento: "",
    bairro: "",
    estadoId: "",
    cidadeId: "",
    nomeMae: "",
    nomePai: "",
    estadoCivil: "",
    uniaoEstavel: "",
    profissao: "",
    bancoId: "",
    codigoBanco: "",
    agencia: "",
    conta: "",
    tipoConta: "",
    tipoPix: "",
    pix: ""
  };
}

function condicaoVazia(): CondicaoPagamento {
  return { tipo: TIPO_CONDICAO_OPCOES[0], valor: "", forma_pagamento: "", parcelas: "", momento: "", data_pagamento: "" };
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Rascunho salvo no navegador (localStorage) — mesmo padrão dos demais
// formulários do portal.
const RASCUNHO_KEY = "sis_rascunho_proposta";

type RascunhoProposta = {
  salvoEm: number;
  cliente: ClienteLinha;
  descricao: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  valorProposta: string;
  dataFechamento: string;
  condicoes: CondicaoPagamento[];
};

function formatarDataHoraRascunho(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const CAMPO_TRAVADO = "text-xs border border-gray-200 rounded-lg px-3 py-1.5 w-full bg-gray-100 text-gray-500";
const LABEL = "text-xs text-gray-600 block mb-1";

export function PortalPropostaForm({
  corretor,
  clientesDoCorretor,
  bancos,
  estados,
  cidades
}: {
  corretor: { id: string; nome: string; creci: string | null; cpf: string | null };
  clientesDoCorretor: ClienteDoCorretor[];
  bancos: Banco[];
  estados: { id: string; nome: string }[];
  cidades: { id: string; nome: string; estado_id: string }[];
}) {
  const [cliente, setCliente] = useState<ClienteLinha>(clienteVazio());

  const [descricao, setDescricao] = useState("");
  const [cep, setCep] = useState("");
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

  const [rascunhoEncontrado, setRascunhoEncontrado] = useState<RascunhoProposta | null>(null);
  const [rascunhoSalvoAgora, setRascunhoSalvoAgora] = useState(false);

  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(RASCUNHO_KEY);
      if (bruto) setRascunhoEncontrado(JSON.parse(bruto));
    } catch {
      // rascunho corrompido — ignora
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function montarRascunho(): RascunhoProposta {
    return {
      salvoEm: Date.now(),
      cliente,
      descricao,
      cep,
      rua,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      valorProposta,
      dataFechamento,
      condicoes
    };
  }

  useEffect(() => {
    const temAlgumDado = cliente.nome.trim().length > 0 || rua.trim().length > 0;
    if (!temAlgumDado) return;
    try {
      window.localStorage.setItem(RASCUNHO_KEY, JSON.stringify(montarRascunho()));
    } catch {
      // localStorage indisponível — segue sem rascunho
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, descricao, cep, rua, numero, complemento, bairro, cidade, estado, valorProposta, dataFechamento, condicoes]);

  function restaurarRascunho() {
    if (!rascunhoEncontrado) return;
    const r = rascunhoEncontrado;
    setCliente(r.cliente);
    setDescricao(r.descricao);
    setCep(r.cep ?? "");
    setRua(r.rua);
    setNumero(r.numero);
    setComplemento(r.complemento);
    setBairro(r.bairro);
    setCidade(r.cidade);
    setEstado(r.estado);
    setValorProposta(r.valorProposta);
    setDataFechamento(r.dataFechamento);
    setCondicoes(r.condicoes);
    setRascunhoEncontrado(null);
  }

  function descartarRascunho() {
    try {
      window.localStorage.removeItem(RASCUNHO_KEY);
    } catch {
      // ignora
    }
    setRascunhoEncontrado(null);
  }

  function salvarRascunhoManual() {
    try {
      window.localStorage.setItem(RASCUNHO_KEY, JSON.stringify(montarRascunho()));
      setRascunhoSalvoAgora(true);
      setTimeout(() => setRascunhoSalvoAgora(false), 2500);
    } catch {
      // ignora
    }
  }

  function atualizarCliente(campo: keyof ClienteLinha, valor: string) {
    setCliente((atual) => ({ ...atual, [campo]: valor }));
  }

  // Código do banco vem automaticamente ao escolher o Banco — mesmo
  // comportamento do cadastro administrativo (ver components/cliente-form.tsx).
  function selecionarBanco(bancoId: string) {
    const banco = bancos.find((b) => b.id === bancoId);
    setCliente((atual) => ({ ...atual, bancoId, codigoBanco: banco?.codigo ?? atual.codigoBanco }));
  }

  // Ao escolher um cliente já cadastrado, mostra só um resumo — não edita
  // cadastro existente por aqui. Voltando pra "+ Novo cliente" limpa a linha.
  function selecionarClienteExistente(clienteId: string) {
    if (!clienteId) {
      setCliente(clienteVazio());
      return;
    }
    const encontrado = clientesDoCorretor.find((c) => c.id === clienteId);
    if (!encontrado) return;
    setCliente({
      ...clienteVazio(),
      clienteId: encontrado.id,
      nome: encontrado.nome,
      cpfCnpj: encontrado.cpfCnpj
    });
  }

  // Busca automática de CEP (ViaCEP) — mesmo comportamento do cadastro
  // administrativo (ver components/cliente-form.tsx).
  async function buscarEnderecoPorCep() {
    const encontrado = await buscarCep(cliente.cep);
    if (!encontrado) return;

    const nomeEstado = UF_PARA_ESTADO[encontrado.uf] ?? "";
    const estadoEncontrado = estados.find((e) => e.nome.toLowerCase() === nomeEstado.toLowerCase());
    const cidadeEncontrada = estadoEncontrado
      ? cidades.find(
          (cid) => cid.estado_id === estadoEncontrado.id && cid.nome.toLowerCase() === encontrado.localidade.toLowerCase()
        )
      : undefined;

    setCliente((atual) => ({
      ...atual,
      rua: encontrado.logradouro || atual.rua,
      bairro: encontrado.bairro || atual.bairro,
      estadoId: estadoEncontrado?.id ?? atual.estadoId,
      cidadeId: cidadeEncontrada?.id ?? ""
    }));
  }

  // Busca automática de CEP (ViaCEP) pro imóvel da proposta — mesmo serviço
  // usado no resto do sistema (lib/enderecos.ts), mas aqui Cidade/Estado são
  // texto livre (o imóvel não é cadastrado no sistema, só entra no texto da
  // proposta), diferente do padrão com select por estadoId/cidadeId usado em
  // Compra e Venda/Locação/Administração/Gestão.
  async function buscarEnderecoImovelPorCep() {
    const encontrado = await buscarCep(cep);
    if (!encontrado) return;

    setRua((atual) => encontrado.logradouro || atual);
    setBairro((atual) => encontrado.bairro || atual);
    setCidade((atual) => encontrado.localidade || atual);
    setEstado((atual) => UF_PARA_ESTADO[encontrado.uf] ?? encontrado.uf ?? atual);
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
      if (r.ok) {
        try {
          window.localStorage.removeItem(RASCUNHO_KEY);
        } catch {
          // ignora
        }
      }
    } catch (erro) {
      // Sem isso, qualquer erro que escape do try acima desaparecia sem
      // avisar nada na tela.
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      setResultado({
        ok: false,
        erro: `Não foi possível concluir o cadastro (${mensagem}). Tente de novo — se continuar acontecendo, avise o administrativo com essa mensagem.`
      });
    } finally {
      setEnviando(false);
    }
  }

  const podeGerar = cliente.nome.trim().length > 0 && rua.trim().length > 0 && valorProposta.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      {rascunhoEncontrado && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex-wrap">
          <span className="text-xs text-amber-800">
            Você tem um rascunho salvo neste navegador em{" "}
            <strong>{formatarDataHoraRascunho(rascunhoEncontrado.salvoEm)}</strong>.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={restaurarRascunho}
              className="text-xs font-semibold text-amber-700 hover:opacity-80"
            >
              Continuar rascunho
            </button>
            <button type="button" onClick={descartarRascunho} className="text-xs text-gray-400 hover:text-red-600">
              descartar
            </button>
          </div>
        </div>
      )}

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

        {cliente.clienteId ? (
          <div className="text-xs text-gray-700 font-medium">
            {cliente.nome}
            {cliente.cpfCnpj && <span className="text-gray-400 font-normal"> — {cliente.cpfCnpj}</span>}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Tipo de cliente</label>
              <select
                className={CAMPO}
                value={cliente.tipoCliente}
                onChange={(e) => atualizarCliente("tipoCliente", e.target.value)}
              >
                <option value="" disabled>
                  Selecione...
                </option>
                {TIPOS_CLIENTE.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>{cliente.tipoCliente === "Pessoa Jurídica" ? "Razão social" : "Nome completo"}</label>
              <input className={CAMPO} value={cliente.nome} onChange={(e) => atualizarCliente("nome", e.target.value)} />
            </div>
            {cliente.tipoCliente !== "Pessoa Jurídica" && (
              <div>
                <label className={LABEL}>RG</label>
                <input className={CAMPO} value={cliente.rg} onChange={(e) => atualizarCliente("rg", e.target.value)} />
              </div>
            )}
            <div>
              <label className={LABEL}>{cliente.tipoCliente === "Pessoa Jurídica" ? "CNPJ" : "CPF"}</label>
              <input
                className={CAMPO}
                value={cliente.cpfCnpj}
                onChange={(e) => atualizarCliente("cpfCnpj", e.target.value)}
                onBlur={(e) => {
                  const erro = e.target.value ? validarCpfCnpj(e.target.value) : null;
                  if (erro) alert(erro);
                }}
              />
            </div>
            {cliente.tipoCliente === "Pessoa Jurídica" ? (
              <div className="md:col-span-2">
                <label className={LABEL}>Sede (endereço completo)</label>
                <input className={CAMPO} value={cliente.endereco} onChange={(e) => atualizarCliente("endereco", e.target.value)} />
              </div>
            ) : (
              <>
                <div>
                  <label className={LABEL}>CEP</label>
                  <input
                    className={CAMPO}
                    value={cliente.cep}
                    onChange={(e) => atualizarCliente("cep", e.target.value)}
                    onBlur={buscarEnderecoPorCep}
                  />
                </div>
                <div>
                  <label className={LABEL}>Logradouro</label>
                  <input className={CAMPO} value={cliente.rua} onChange={(e) => atualizarCliente("rua", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Número predial</label>
                  <input className={CAMPO} value={cliente.nPredial} onChange={(e) => atualizarCliente("nPredial", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Complemento</label>
                  <input
                    className={CAMPO}
                    value={cliente.complemento}
                    onChange={(e) => atualizarCliente("complemento", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Bairro</label>
                  <input className={CAMPO} value={cliente.bairro} onChange={(e) => atualizarCliente("bairro", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Estado</label>
                  <select
                    className={CAMPO}
                    value={cliente.estadoId}
                    onChange={(e) => {
                      atualizarCliente("estadoId", e.target.value);
                      atualizarCliente("cidadeId", "");
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
                  <select className={CAMPO} value={cliente.cidadeId} onChange={(e) => atualizarCliente("cidadeId", e.target.value)}>
                    <option value="">—</option>
                    {cidades
                      .filter((c) => c.estado_id === cliente.estadoId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                  </select>
                </div>
              </>
            )}
            {cliente.tipoCliente !== "Pessoa Jurídica" && (
              <>
                <div>
                  <label className={LABEL}>Nome da mãe</label>
                  <input className={CAMPO} value={cliente.nomeMae} onChange={(e) => atualizarCliente("nomeMae", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Nome do pai</label>
                  <input className={CAMPO} value={cliente.nomePai} onChange={(e) => atualizarCliente("nomePai", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Estado civil</label>
                  <select
                    className={CAMPO}
                    value={cliente.estadoCivil}
                    onChange={(e) => {
                      atualizarCliente("estadoCivil", e.target.value);
                      if (!ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(e.target.value)) atualizarCliente("uniaoEstavel", "");
                    }}
                  >
                    <option value="">—</option>
                    {ESTADOS_CIVIS.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                </div>
                {ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(cliente.estadoCivil) && (
                  <div>
                    <label className={LABEL}>Convive em união estável?</label>
                    <select
                      className={CAMPO}
                      value={cliente.uniaoEstavel}
                      onChange={(e) => atualizarCliente("uniaoEstavel", e.target.value)}
                    >
                      <option value="">Não perguntado ainda</option>
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className={LABEL}>Profissão</label>
                  <input className={CAMPO} value={cliente.profissao} onChange={(e) => atualizarCliente("profissao", e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}

        {!cliente.clienteId && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="text-[11px] font-semibold text-gray-500 mb-2">Dados bancários</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Banco</label>
              <select
                className={CAMPO}
                value={cliente.bancoId}
                onChange={(e) => selecionarBanco(e.target.value)}
              >
                <option value="">—</option>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Código do banco</label>
              <input
                className={CAMPO}
                value={cliente.codigoBanco}
                onChange={(e) => atualizarCliente("codigoBanco", e.target.value)}
                placeholder="Preenchido ao escolher o banco"
              />
            </div>
            <div>
              <label className={LABEL}>Agência</label>
              <input className={CAMPO} value={cliente.agencia} onChange={(e) => atualizarCliente("agencia", e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Conta</label>
              <input className={CAMPO} value={cliente.conta} onChange={(e) => atualizarCliente("conta", e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Tipo de conta</label>
              <select className={CAMPO} value={cliente.tipoConta} onChange={(e) => atualizarCliente("tipoConta", e.target.value)}>
                <option value="">—</option>
                {TIPOS_CONTA.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Tipo de PIX</label>
              <select className={CAMPO} value={cliente.tipoPix} onChange={(e) => atualizarCliente("tipoPix", e.target.value)}>
                <option value="">—</option>
                {TIPOS_PIX.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={LABEL}>Chave PIX</label>
              <input className={CAMPO} value={cliente.pix} onChange={(e) => atualizarCliente("pix", e.target.value)} />
            </div>
          </div>
        </div>
        )}
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
            <label className={LABEL}>CEP</label>
            <input
              className={CAMPO}
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              onBlur={buscarEnderecoImovelPorCep}
              placeholder="00000-000"
            />
          </div>
          <div>
            <label className={LABEL}>Número</label>
            <input className={CAMPO} value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Rua</label>
            <input className={CAMPO} value={rua} onChange={(e) => setRua(e.target.value)} />
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

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={!podeGerar || enviando}
          onClick={handleGerar}
          className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40 hover:opacity-90"
        >
          {enviando ? "Gerando..." : "Gerar proposta"}
        </button>
        <button
          type="button"
          onClick={salvarRascunhoManual}
          className="text-xs text-gray-500 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50"
        >
          Salvar rascunho
        </button>
        {rascunhoSalvoAgora && <span className="text-xs text-green-700">Rascunho salvo.</span>}
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
