"use client";

import { useMemo, useState } from "react";
import { ESTADOS_CIVIS, TIPOS_CONTA, TIPOS_PIX, TIPOS_CLIENTE, SEXO_OPCOES, CAT_PROFISSAO_OPCOES } from "@/lib/clientes/opcoes";
import type { ClienteBuscaResultado } from "@/lib/transacoes/buscas";
import { criarAvaliacaoCpfAction, prepararUploadDocumentoAvaliacaoAction } from "@/app/portal/avaliacao-cpf/actions";
import { supabaseBrowser, BUCKET_DOCUMENTOS_PORTAL } from "@/lib/supabase-browser";

type Banco = { id: string; nome: string; codigo: string | null };

// Cadastro COMPLETO do cliente — diferente do resto do portal (Compra e
// Venda/Administração só pedem um subconjunto pequeno), porque aqui o
// cliente vai passar por avaliação de crédito de verdade: precisa de renda,
// profissão, estado civil etc. desde o início. Mesmos campos do cadastro
// completo do administrativo (ver components/cliente-form.tsx).
type ClienteAvaliacao = {
  clienteId?: string;
  tipoCliente: string;
  nome: string;
  sexo: string;
  cpf: string;
  cnpj: string;
  rg: string;
  expedicao: string;
  telefone: string;
  email: string;
  estadoCivil: string;
  dataNascimento: string;
  catProfissao: string;
  tipoServidor: string;
  profissao: string;
  rendaBruta: string;
  endereco: string;
  observacao: string;
  bancoId: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  tipoPix: string;
  pix: string;
};

function clienteVazio(): ClienteAvaliacao {
  return {
    tipoCliente: "Pessoa Física",
    nome: "",
    sexo: "",
    cpf: "",
    cnpj: "",
    rg: "",
    expedicao: "",
    telefone: "",
    email: "",
    estadoCivil: "",
    dataNascimento: "",
    catProfissao: "",
    tipoServidor: "",
    profissao: "",
    rendaBruta: "",
    endereco: "",
    observacao: "",
    bancoId: "",
    codigoBanco: "",
    agencia: "",
    conta: "",
    tipoConta: "",
    tipoPix: "",
    pix: ""
  };
}

function clienteDeExistente(c: ClienteBuscaResultado): ClienteAvaliacao {
  return { ...clienteVazio(), clienteId: c.id, nome: c.nome, cpf: c.cpfCnpj ?? "", telefone: c.telefone ?? "", email: c.email ?? "" };
}

function labelCliente(c: ClienteBuscaResultado): string {
  return c.cpfCnpj ? `${c.nome} — ${c.cpfCnpj}` : c.nome;
}

const RESULTADOS_MAXIMO = 200;

const TAMANHO_MAXIMO_TOTAL = 15 * 1024 * 1024;
const TIPOS_ACEITOS = ["application/pdf", "image/"];

function tipoAceito(arquivo: File): boolean {
  return TIPOS_ACEITOS.some((t) => arquivo.type.startsWith(t));
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

export function PortalAvaliacaoCpfForm({
  clientesDisponiveis,
  bancos
}: {
  clientesDisponiveis: ClienteBuscaResultado[];
  bancos: Banco[];
}) {
  const [cliente, setCliente] = useState<ClienteAvaliacao>(clienteVazio());
  const [busca, setBusca] = useState("");
  const [listaAberta, setListaAberta] = useState(false);

  const [documentos, setDocumentos] = useState<File[]>([]);
  const [erroAnexo, setErroAnexo] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [etapaEnvio, setEtapaEnvio] = useState("");
  const [resultado, setResultado] = useState<
    { ok: true; avaliacaoId: string; emailEnviado: boolean; emailErro?: string } | { ok: false; erro: string } | null
  >(null);

  const mostrarCpf = cliente.tipoCliente !== "Pessoa Jurídica";
  const mostrarCnpj = cliente.tipoCliente !== "Pessoa Física";

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return clientesDisponiveis.slice(0, RESULTADOS_MAXIMO);
    return clientesDisponiveis.filter((c) => c.nome.toLowerCase().includes(b)).slice(0, RESULTADOS_MAXIMO);
  }, [busca, clientesDisponiveis]);

  function selecionarExistente(c: ClienteBuscaResultado) {
    setCliente(clienteDeExistente(c));
    setBusca(c.nome);
    setListaAberta(false);
  }

  function comecarCadastroNovo() {
    setCliente(clienteVazio());
    setBusca("");
    setListaAberta(false);
  }

  function atualizar<K extends keyof ClienteAvaliacao>(campo: K, valor: ClienteAvaliacao[K]) {
    setCliente((atual) => ({ ...atual, [campo]: valor }));
  }

  function selecionarBanco(bancoId: string) {
    const banco = bancos.find((b) => b.id === bancoId);
    setCliente((atual) => ({ ...atual, bancoId, codigoBanco: banco?.codigo ?? atual.codigoBanco }));
  }

  function adicionarDocumentos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setErroAnexo("");
    const novos = Array.from(lista);
    const invalido = novos.find((f) => !tipoAceito(f));
    if (invalido) {
      setErroAnexo(`"${invalido.name}" não é PDF nem imagem — só esses dois tipos são aceitos.`);
      return;
    }
    const totalAtual = documentos.reduce((acc, f) => acc + f.size, 0);
    const totalNovo = novos.reduce((acc, f) => acc + f.size, 0);
    if (totalAtual + totalNovo > TAMANHO_MAXIMO_TOTAL) {
      setErroAnexo(`O total dos anexos passaria de ${formatarTamanho(TAMANHO_MAXIMO_TOTAL)} — junte menos arquivos de uma vez ou reduza o tamanho.`);
      return;
    }
    setDocumentos((atual) => [...atual, ...novos]);
  }

  function removerDocumento(indice: number) {
    setDocumentos((atual) => atual.filter((_, i) => i !== indice));
  }

  const tamanhoTotalDocumentos = documentos.reduce((acc, f) => acc + f.size, 0);

  const podeEnviar = cliente.clienteId ? true : cliente.nome.trim().length > 0 && (mostrarCpf ? cliente.cpf.trim().length > 0 : cliente.cnpj.trim().length > 0);

  async function handleEnviar() {
    setEnviando(true);
    setEtapaEnvio("");
    setResultado(null);
    try {
      const documentosEnviados: { caminho: string; nomeOriginal: string }[] = [];
      for (let i = 0; i < documentos.length; i++) {
        const arquivo = documentos[i];
        setEtapaEnvio(`Enviando documento ${i + 1} de ${documentos.length}...`);
        const preparo = await prepararUploadDocumentoAvaliacaoAction(arquivo.name);
        if (!preparo.ok) throw new Error(`Falha ao preparar envio de "${arquivo.name}": ${preparo.erro}`);
        const { error: erroUpload } = await supabaseBrowser()
          .storage.from(BUCKET_DOCUMENTOS_PORTAL)
          .uploadToSignedUrl(preparo.caminho, preparo.token, arquivo, { contentType: arquivo.type });
        if (erroUpload) throw new Error(`Falha ao enviar "${arquivo.name}": ${erroUpload.message}`);
        documentosEnviados.push({ caminho: preparo.caminho, nomeOriginal: arquivo.name });
      }
      setEtapaEnvio("Cadastrando...");

      const formData = new FormData();
      formData.set("clienteJson", JSON.stringify(cliente));
      formData.set("documentosJson", JSON.stringify(documentosEnviados));

      const r = await criarAvaliacaoCpfAction(formData);
      setResultado(r);
      if (r.ok) {
        setCliente(clienteVazio());
        setBusca("");
        setDocumentos([]);
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      setResultado({
        ok: false,
        erro: `Não foi possível concluir o cadastro (${mensagem}). Tente de novo — se continuar acontecendo, avise o administrativo com essa mensagem.`
      });
    } finally {
      setEnviando(false);
      setEtapaEnvio("");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Cliente</div>
        <p className="text-[11px] text-gray-400 mb-3">
          Busque um cliente já cadastrado ou preencha o cadastro completo — é o que o administrativo precisa pra
          rodar a avaliação de crédito.
        </p>

        <div className="relative mb-3">
          <label className={LABEL}>Buscar cliente já cadastrado...</label>
          <input
            className={CAMPO}
            placeholder="Nome do cliente..."
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setListaAberta(true);
              if (cliente.clienteId) setCliente(clienteVazio());
            }}
            onFocus={() => setListaAberta(true)}
            onBlur={() => setTimeout(() => setListaAberta(false), 150)}
          />
          {listaAberta && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
              {filtrados.length === 0 && <p className="text-xs text-gray-400 p-3">Nenhum cliente encontrado.</p>}
              {filtrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={() => selecionarExistente(c)}
                  className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                >
                  {labelCliente(c)}
                </button>
              ))}
            </div>
          )}
        </div>

        {cliente.clienteId ? (
          <div className="border border-gray-100 rounded-lg p-3 flex items-center justify-between">
            <div className="text-xs text-gray-700 font-medium">
              {cliente.nome}
              {cliente.cpf && <span className="text-gray-400 font-normal"> — {cliente.cpf}</span>}
              <span className="block text-[11px] text-primary font-normal mt-0.5">Cliente já cadastrado</span>
            </div>
            <button type="button" onClick={comecarCadastroNovo} className="text-[11px] text-gray-400 hover:text-red-600">
              trocar
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="pt-2 border-t border-gray-100">
              <div className="text-[11px] font-semibold text-gray-500 mb-2">Identificação</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Nome completo *</label>
                  <input className={CAMPO} value={cliente.nome} onChange={(e) => atualizar("nome", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Tipo de cliente</label>
                  <select className={CAMPO} value={cliente.tipoCliente} onChange={(e) => atualizar("tipoCliente", e.target.value)}>
                    {TIPOS_CLIENTE.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                {mostrarCpf && (
                  <div>
                    <label className={LABEL}>CPF *</label>
                    <input className={CAMPO} placeholder="000.000.000-00" value={cliente.cpf} onChange={(e) => atualizar("cpf", e.target.value)} />
                  </div>
                )}
                {mostrarCnpj && (
                  <div>
                    <label className={LABEL}>CNPJ *</label>
                    <input className={CAMPO} placeholder="00.000.000/0000-00" value={cliente.cnpj} onChange={(e) => atualizar("cnpj", e.target.value)} />
                  </div>
                )}
                <div>
                  <label className={LABEL}>RG</label>
                  <input className={CAMPO} value={cliente.rg} onChange={(e) => atualizar("rg", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Estado de expedição</label>
                  <input className={CAMPO} value={cliente.expedicao} onChange={(e) => atualizar("expedicao", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Sexo</label>
                  <select className={CAMPO} value={cliente.sexo} onChange={(e) => atualizar("sexo", e.target.value)}>
                    <option value="">—</option>
                    {SEXO_OPCOES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Estado civil</label>
                  <select className={CAMPO} value={cliente.estadoCivil} onChange={(e) => atualizar("estadoCivil", e.target.value)}>
                    <option value="">—</option>
                    {ESTADOS_CIVIS.map((e2) => (
                      <option key={e2} value={e2}>
                        {e2}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Data de nascimento</label>
                  <input type="date" className={CAMPO} value={cliente.dataNascimento} onChange={(e) => atualizar("dataNascimento", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <div className="text-[11px] font-semibold text-gray-500 mb-2">Contato</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Telefone</label>
                  <input className={CAMPO} placeholder="(69) 99999-9999" value={cliente.telefone} onChange={(e) => atualizar("telefone", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>E-mail</label>
                  <input className={CAMPO} type="email" value={cliente.email} onChange={(e) => atualizar("email", e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className={LABEL}>Endereço</label>
                  <input className={CAMPO} value={cliente.endereco} onChange={(e) => atualizar("endereco", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <div className="text-[11px] font-semibold text-gray-500 mb-2">Profissional (importante pra avaliação)</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Profissão</label>
                  <input className={CAMPO} value={cliente.profissao} onChange={(e) => atualizar("profissao", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Categoria de profissão</label>
                  <select className={CAMPO} value={cliente.catProfissao} onChange={(e) => atualizar("catProfissao", e.target.value)}>
                    <option value="">—</option>
                    {CAT_PROFISSAO_OPCOES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Tipo de servidor</label>
                  <input className={CAMPO} value={cliente.tipoServidor} onChange={(e) => atualizar("tipoServidor", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Renda bruta (R$)</label>
                  <input className={CAMPO} placeholder="2.500,00" value={cliente.rendaBruta} onChange={(e) => atualizar("rendaBruta", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <div className="text-[11px] font-semibold text-gray-500 mb-2">Dados bancários</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Banco</label>
                  <select className={CAMPO} value={cliente.bancoId} onChange={(e) => selecionarBanco(e.target.value)}>
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
                  <input className={CAMPO} value={cliente.codigoBanco} onChange={(e) => atualizar("codigoBanco", e.target.value)} placeholder="Preenchido ao escolher o banco" />
                </div>
                <div>
                  <label className={LABEL}>Agência</label>
                  <input className={CAMPO} value={cliente.agencia} onChange={(e) => atualizar("agencia", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Conta</label>
                  <input className={CAMPO} value={cliente.conta} onChange={(e) => atualizar("conta", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Tipo de conta</label>
                  <select className={CAMPO} value={cliente.tipoConta} onChange={(e) => atualizar("tipoConta", e.target.value)}>
                    <option value="">—</option>
                    {TIPOS_CONTA.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Tipo de PIX</label>
                  <select className={CAMPO} value={cliente.tipoPix} onChange={(e) => atualizar("tipoPix", e.target.value)}>
                    <option value="">—</option>
                    {TIPOS_PIX.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={LABEL}>Chave PIX</label>
                  <input className={CAMPO} value={cliente.pix} onChange={(e) => atualizar("pix", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <label className={LABEL}>Observação</label>
              <textarea className={CAMPO + " min-h-16"} value={cliente.observacao} onChange={(e) => atualizar("observacao", e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Documentos do cliente</div>
        <p className="text-[11px] text-gray-400 mb-3">
          PDF ou imagem (RG, comprovante de renda, comprovante de residência etc.). Vai direto por email pro
          administrativo — não fica guardado no sistema. Total até {formatarTamanho(TAMANHO_MAXIMO_TOTAL)}.
        </p>

        {documentos.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-3">
            {documentos.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-gray-700 truncate">
                  {f.name} <span className="text-gray-400">— {formatarTamanho(f.size)}</span>
                </span>
                <button type="button" onClick={() => removerDocumento(i)} className="text-gray-400 hover:text-red-600 ml-2 shrink-0">
                  remover
                </button>
              </div>
            ))}
            <div className="text-[11px] text-gray-400">Total: {formatarTamanho(tamanhoTotalDocumentos)}</div>
          </div>
        )}

        <label className="inline-block text-xs bg-white border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 font-semibold cursor-pointer hover:bg-gray-50">
          + Adicionar documento
          <input
            type="file"
            accept="application/pdf,image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              adicionarDocumentos(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {erroAnexo && <p className="text-xs text-red-600 mt-2">{erroAnexo}</p>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={!podeEnviar || enviando}
          onClick={handleEnviar}
          className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40 hover:opacity-90"
        >
          {enviando ? etapaEnvio || "Cadastrando..." : "Cadastrar avaliação"}
        </button>
        {resultado?.ok && (
          <span className="text-xs text-green-700 font-semibold">
            Cadastrado com sucesso. O administrativo vai definir a finalidade e dar sequência no Financiamento.
            {!resultado.emailEnviado && (
              <span className="block text-amber-700 font-normal mt-0.5">
                A avaliação foi salva, mas o email com a documentação não saiu{resultado.emailErro ? `: ${resultado.emailErro}` : "."} Avise o
                administrativo por outro canal.
              </span>
            )}
          </span>
        )}
        {resultado && !resultado.ok && <span className="text-xs text-red-600">{resultado.erro}</span>}
      </div>
    </div>
  );
}
