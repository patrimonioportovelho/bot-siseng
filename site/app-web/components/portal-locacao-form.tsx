"use client";

import { useMemo, useState } from "react";
import {
  GARANTIA_OPCOES,
  FORMA_PAGAMENTO_OPCOES,
  FINALIDADE_LOCACAO_OPCOES,
  ENCARGOS_OPCOES
} from "@/lib/transacoes/opcoes";
import { TIPOS_IMOVEL } from "@/lib/imoveis/opcoes";
import { ESTADOS_CIVIS, TIPOS_CONTA, TIPOS_PIX } from "@/lib/clientes/opcoes";
import { formatInscricao, somarMeses } from "@/lib/format";
import type { ImovelBuscaResultado, ClienteBuscaResultado } from "@/lib/transacoes/buscas";
import { gerarLocacaoAction, prepararUploadDocumentoAction } from "@/app/portal/locacao/actions";
import { supabaseBrowser, BUCKET_DOCUMENTOS_PORTAL } from "@/lib/supabase-browser";

// Administrações com status "Ativo" — só essas podem virar uma locação em
// "Elaboração de Contrato de Locação" (imóvel e proprietário vêm delas).
// Mesmo tipo usado no formulário de Transações do admin
// (components/transacao-form.tsx).
type AdministracaoOpcao = {
  id: string;
  id_legado: string | null;
  parceiroId: string | null;
  imovelId: string;
  imovelEndereco: string | null;
  imovelInscricao: string | null;
  clienteNome: string;
};

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const TAMANHO_MAXIMO_TOTAL = 15 * 1024 * 1024;
const TIPOS_ACEITOS = ["application/pdf", "image/"];

function tipoAceito(arquivo: File): boolean {
  return TIPOS_ACEITOS.some((t) => arquivo.type.startsWith(t));
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function labelImovel(i: ImovelBuscaResultado): string {
  const idExibicao = i.id_legado ?? i.id;
  const nomesProprietarios = i.proprietarios.map((p) => p.nome).join(", ") || "sem proprietário";
  const partes = [`${idExibicao} - ${nomesProprietarios}`, i.endereco ?? null].filter(Boolean);
  return partes.join(" — ");
}

function labelAdministracao(a: AdministracaoOpcao): string {
  const insc = formatInscricao(a.imovelInscricao);
  const partes = [a.imovelEndereco ?? "(sem endereço)", insc ? `Insc. ${insc}` : null, a.clienteNome].filter(Boolean);
  return partes.join(" — ");
}

function labelCliente(c: ClienteBuscaResultado): string {
  return c.cpfCnpj ? `${c.nome} — ${c.cpfCnpj}` : c.nome;
}

const RESULTADOS_MAXIMO = 200;

type Banco = { id: string; nome: string; codigo: string | null };

// Uma pessoa do formulário (locatário ou proprietário do imóvel novo) — ou
// já cadastrada (clienteId presente, campos travados) ou nova (digitada na
// hora, com checagem de duplicidade no servidor). Mesmo padrão dos demais
// formulários do portal.
type PessoaLinha = {
  clienteId?: string;
  nome: string;
  rg: string;
  cpfCnpj: string;
  endereco: string;
  nacionalidade: string;
  estadoCivil: string;
  profissao: string;
  email: string;
  telefone: string;
  bancoId: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  tipoPix: string;
  pix: string;
};

function pessoaVazia(): PessoaLinha {
  return {
    nome: "",
    rg: "",
    cpfCnpj: "",
    endereco: "",
    nacionalidade: "Brasileira",
    estadoCivil: "",
    profissao: "",
    email: "",
    telefone: "",
    bancoId: "",
    codigoBanco: "",
    agencia: "",
    conta: "",
    tipoConta: "",
    tipoPix: "",
    pix: ""
  };
}

function pessoaDeClienteExistente(c: ClienteBuscaResultado): PessoaLinha {
  return {
    clienteId: c.id,
    nome: c.nome,
    rg: "",
    cpfCnpj: c.cpfCnpj ?? "",
    endereco: "",
    nacionalidade: "",
    estadoCivil: "",
    profissao: "",
    email: c.email ?? "",
    telefone: c.telefone ?? "",
    bancoId: "",
    codigoBanco: "",
    agencia: "",
    conta: "",
    tipoConta: "",
    tipoPix: "",
    pix: ""
  };
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Bloco reutilizado pra locatário(s) e proprietário(s) do imóvel novo —
// busca+escolhe cliente já cadastrado (de qualquer corretor) ou cadastra um
// novo na hora, mesmos campos usados no cadastro de Clientes. Mesmo
// componente (copiado) usado em components/portal-compra-venda-form.tsx.
function BlocoPessoas({
  titulo,
  ajuda,
  pessoas,
  setPessoas,
  clientesDisponiveis,
  busca,
  setBusca,
  listaAberta,
  setListaAberta,
  bancos
}: {
  titulo: string;
  ajuda: string;
  pessoas: PessoaLinha[];
  setPessoas: (fn: (atual: PessoaLinha[]) => PessoaLinha[]) => void;
  clientesDisponiveis: ClienteBuscaResultado[];
  busca: string;
  setBusca: (v: string) => void;
  listaAberta: boolean;
  setListaAberta: (v: boolean) => void;
  bancos: Banco[];
}) {
  const idsJaAdicionados = new Set(pessoas.map((p) => p.clienteId).filter(Boolean));

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const disponiveis = clientesDisponiveis.filter((c) => !idsJaAdicionados.has(c.id));
    if (!b) return disponiveis.slice(0, RESULTADOS_MAXIMO);
    return disponiveis.filter((c) => c.nome.toLowerCase().includes(b)).slice(0, RESULTADOS_MAXIMO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, clientesDisponiveis, pessoas]);

  function adicionarExistente(c: ClienteBuscaResultado) {
    setPessoas((atual) => [...atual, pessoaDeClienteExistente(c)]);
    setBusca("");
    setListaAberta(false);
  }

  function adicionarNovo() {
    setPessoas((atual) => [...atual, pessoaVazia()]);
  }

  function remover(index: number) {
    setPessoas((atual) => atual.filter((_, i) => i !== index));
  }

  function atualizar(index: number, campo: keyof PessoaLinha, valor: string) {
    setPessoas((atual) => atual.map((p, i) => (i === index ? { ...p, [campo]: valor } : p)));
  }

  function selecionarBanco(index: number, bancoId: string) {
    const banco = bancos.find((b) => b.id === bancoId);
    setPessoas((atual) =>
      atual.map((p, i) => (i === index ? { ...p, bancoId, codigoBanco: banco?.codigo ?? p.codigoBanco } : p))
    );
  }

  return (
    <div>
      <div className="text-sm font-bold text-gray-800 mb-1">{titulo}</div>
      <p className="text-[11px] text-gray-400 mb-3">{ajuda}</p>

      {pessoas.length > 0 && (
        <div className="flex flex-col gap-3 mb-3">
          {pessoas.map((p, index) => (
            <div key={index} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">
                  {p.clienteId ? "Cliente já cadastrado" : "Cliente novo"}
                </span>
                <button type="button" onClick={() => remover(index)} className="text-[11px] text-gray-400 hover:text-red-600">
                  remover
                </button>
              </div>

              {p.clienteId ? (
                <div className="text-xs text-gray-700 font-medium">
                  {p.nome}
                  {p.cpfCnpj && <span className="text-gray-400 font-normal"> — {p.cpfCnpj}</span>}
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Nome</label>
                    <input className={CAMPO} value={p.nome} onChange={(e) => atualizar(index, "nome", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>RG</label>
                    <input className={CAMPO} value={p.rg} onChange={(e) => atualizar(index, "rg", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>CPF / CNPJ</label>
                    <input className={CAMPO} value={p.cpfCnpj} onChange={(e) => atualizar(index, "cpfCnpj", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>Endereço</label>
                    <input className={CAMPO} value={p.endereco} onChange={(e) => atualizar(index, "endereco", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>Nacionalidade</label>
                    <input
                      className={CAMPO}
                      value={p.nacionalidade}
                      onChange={(e) => atualizar(index, "nacionalidade", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Estado civil</label>
                    <select
                      className={CAMPO}
                      value={p.estadoCivil}
                      onChange={(e) => atualizar(index, "estadoCivil", e.target.value)}
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
                    <label className={LABEL}>Profissão</label>
                    <input className={CAMPO} value={p.profissao} onChange={(e) => atualizar(index, "profissao", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>Email</label>
                    <input className={CAMPO} value={p.email} onChange={(e) => atualizar(index, "email", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>Telefone</label>
                    <input className={CAMPO} value={p.telefone} onChange={(e) => atualizar(index, "telefone", e.target.value)} />
                  </div>
                </div>
              )}

              {!p.clienteId && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-[11px] font-semibold text-gray-500 mb-2">Dados bancários</div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Banco</label>
                      <select className={CAMPO} value={p.bancoId} onChange={(e) => selecionarBanco(index, e.target.value)}>
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
                        value={p.codigoBanco}
                        onChange={(e) => atualizar(index, "codigoBanco", e.target.value)}
                        placeholder="Preenchido ao escolher o banco"
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Agência</label>
                      <input className={CAMPO} value={p.agencia} onChange={(e) => atualizar(index, "agencia", e.target.value)} />
                    </div>
                    <div>
                      <label className={LABEL}>Conta</label>
                      <input className={CAMPO} value={p.conta} onChange={(e) => atualizar(index, "conta", e.target.value)} />
                    </div>
                    <div>
                      <label className={LABEL}>Tipo de conta</label>
                      <select className={CAMPO} value={p.tipoConta} onChange={(e) => atualizar(index, "tipoConta", e.target.value)}>
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
                      <select className={CAMPO} value={p.tipoPix} onChange={(e) => atualizar(index, "tipoPix", e.target.value)}>
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
                      <input className={CAMPO} value={p.pix} onChange={(e) => atualizar(index, "pix", e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <label className={LABEL}>+ Adicionar cliente já cadastrado — digite para buscar...</label>
        <input
          className={CAMPO}
          placeholder="Nome do cliente..."
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setListaAberta(true);
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
                onMouseDown={() => adicionarExistente(c)}
                className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
              >
                {labelCliente(c)}
              </button>
            ))}
          </div>
        )}
      </div>

      <button type="button" onClick={adicionarNovo} className="text-xs text-primary font-semibold mt-3 hover:opacity-80">
        + Cadastrar cliente novo
      </button>
    </div>
  );
}

export function PortalLocacaoForm({
  corretorLogadoId,
  lojas,
  corretores,
  parceirosTodos,
  imoveis,
  clientes,
  administracoes,
  imoveisComAdmAtivaIds,
  estados,
  cidades,
  bancos
}: {
  corretorLogadoId: string;
  lojas: { id: string; nome: string }[];
  corretores: { id: string; nome: string }[];
  parceirosTodos: { id: string; nome: string }[];
  imoveis: ImovelBuscaResultado[];
  clientes: ClienteBuscaResultado[];
  administracoes: AdministracaoOpcao[];
  imoveisComAdmAtivaIds: string[];
  estados: { id: string; nome: string }[];
  cidades: { id: string; nome: string; estado_id: string }[];
  bancos: Banco[];
}) {
  const [lojaId, setLojaId] = useState("");

  // Via administração (padrão quando existe ao menos uma Ativa) ou sem
  // administração.
  const [viaAdministracao, setViaAdministracao] = useState(administracoes.length > 0);

  const [admImovelId, setAdmImovelId] = useState("");
  const [buscaAdministracao, setBuscaAdministracao] = useState("");
  const [listaAdministracaoAberta, setListaAdministracaoAberta] = useState(false);

  const [imovelId, setImovelId] = useState("");
  const [buscaImovel, setBuscaImovel] = useState("");
  const [listaImovelAberta, setListaImovelAberta] = useState(false);

  const [imovelNovo, setImovelNovo] = useState(false);
  const [tipoImovelNovo, setTipoImovelNovo] = useState("");
  const [ruaNovo, setRuaNovo] = useState("");
  const [nPredialNovo, setNPredialNovo] = useState("");
  const [complementoNovo, setComplementoNovo] = useState("");
  const [bairroNovo, setBairroNovo] = useState("");
  const [estadoIdNovo, setEstadoIdNovo] = useState("");
  const [cidadeIdNovo, setCidadeIdNovo] = useState("");
  const [matriculaNovo, setMatriculaNovo] = useState("");
  const [inscricaoNovo, setInscricaoNovo] = useState("");
  const [proprietarios, setProprietarios] = useState<PessoaLinha[]>([]);
  const [buscaProprietario, setBuscaProprietario] = useState("");
  const [listaProprietarioAberta, setListaProprietarioAberta] = useState(false);

  const [locatarios, setLocatarios] = useState<PessoaLinha[]>([]);
  const [buscaLocatario, setBuscaLocatario] = useState("");
  const [listaLocatarioAberta, setListaLocatarioAberta] = useState(false);

  const [dataAssinatura, setDataAssinatura] = useState(hojeISO());
  const [valorTransacaoTexto, setValorTransacaoTexto] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("");
  const [prazoContratoMesesTexto, setPrazoContratoMesesTexto] = useState("");
  const [dataVencimento, setDataVencimento] = useState("");
  const [vencimentoEditadoManual, setVencimentoEditadoManual] = useState(false);

  const [finalidadeLocacao, setFinalidadeLocacao] = useState("");
  const [garantia, setGarantia] = useState("");
  const [valorCaucaoTexto, setValorCaucaoTexto] = useState("");
  const [pgCaucao, setPgCaucao] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [encargos, setEncargos] = useState<string[]>([]);

  const [porcHonorarioTexto, setPorcHonorarioTexto] = useState("");
  const [temParceria, setTemParceria] = useState(false);
  const [parceiroExternoId, setParceiroExternoId] = useState("");
  const [porcParceriaTexto, setPorcParceriaTexto] = useState("");

  const [corretorProprietarioId, setCorretorProprietarioId] = useState(corretorLogadoId);
  const [corretorContraparteId, setCorretorContraparteId] = useState("");

  const [documentos, setDocumentos] = useState<File[]>([]);
  const [erroAnexo, setErroAnexo] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [etapaEnvio, setEtapaEnvio] = useState("");
  const [resultado, setResultado] = useState<
    | { ok: true; idLegado: string | null; emailEnviado: boolean; emailErro?: string }
    | { ok: false; erro: string }
    | null
  >(null);

  const idsComAdmAtiva = useMemo(() => new Set(imoveisComAdmAtivaIds), [imoveisComAdmAtivaIds]);
  const cidadesDoEstadoNovo = useMemo(() => cidades.filter((c) => c.estado_id === estadoIdNovo), [cidades, estadoIdNovo]);

  const administracoesFiltradas = useMemo(() => {
    const b = buscaAdministracao.trim().toLowerCase();
    if (!b) return administracoes.slice(0, RESULTADOS_MAXIMO);
    return administracoes
      .filter((a) => (a.imovelEndereco ?? "").toLowerCase().includes(b) || a.clienteNome.toLowerCase().includes(b))
      .slice(0, RESULTADOS_MAXIMO);
  }, [buscaAdministracao, administracoes]);

  const imoveisFiltrados = useMemo(() => {
    const b = buscaImovel.trim().toLowerCase();
    const base = imoveis.filter((i) => !idsComAdmAtiva.has(i.id));
    if (!b) return base.slice(0, RESULTADOS_MAXIMO);
    return base
      .filter(
        (i) =>
          (i.id_legado ?? "").toLowerCase().includes(b) ||
          i.proprietarios.some((p) => p.nome.toLowerCase().includes(b)) ||
          (i.endereco ?? "").toLowerCase().includes(b) ||
          (i.inscricao ?? "").toLowerCase().includes(b)
      )
      .slice(0, RESULTADOS_MAXIMO);
  }, [buscaImovel, imoveis, idsComAdmAtiva]);

  // Data de vencimento calculada sozinha (assinatura + prazo em meses),
  // igual ao formulário do admin — mas fica editável, e uma vez que o
  // corretor mexer na mão, para de recalcular sozinha.
  useMemo(() => {
    if (vencimentoEditadoManual) return;
    const calculada = somarMeses(dataAssinatura, Number(prazoContratoMesesTexto) || null);
    if (calculada) setDataVencimento(calculada);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataAssinatura, prazoContratoMesesTexto]);

  function selecionarAdministracao(a: AdministracaoOpcao) {
    setAdmImovelId(a.id);
    setBuscaAdministracao(labelAdministracao(a));
    setListaAdministracaoAberta(false);
    if (a.parceiroId) setCorretorProprietarioId(a.parceiroId);
  }

  function selecionarImovel(i: ImovelBuscaResultado) {
    setImovelId(i.id);
    setBuscaImovel(labelImovel(i));
    setListaImovelAberta(false);
    if (i.parceiroId) setCorretorProprietarioId(i.parceiroId);
  }

  function ativarImovelNovo() {
    setImovelId("");
    setBuscaImovel("");
    setImovelNovo(true);
    if (proprietarios.length === 0) setProprietarios([pessoaVazia()]);
  }

  function cancelarImovelNovo() {
    setImovelNovo(false);
    setTipoImovelNovo("");
    setRuaNovo("");
    setNPredialNovo("");
    setComplementoNovo("");
    setBairroNovo("");
    setEstadoIdNovo("");
    setCidadeIdNovo("");
    setMatriculaNovo("");
    setInscricaoNovo("");
    setProprietarios([]);
  }

  function alternarViaAdministracao(valor: boolean) {
    setViaAdministracao(valor);
    // Zera o que não se aplica ao outro modo, pra não mandar dado velho de
    // um jeito escondido no formulário.
    setAdmImovelId("");
    setBuscaAdministracao("");
    setImovelId("");
    setBuscaImovel("");
    setImovelNovo(false);
    cancelarImovelNovo();
  }

  function adicionarLocatario(c: ClienteBuscaResultado) {
    const eraOPrimeiro = locatarios.length === 0;
    setLocatarios((atual) => [...atual, pessoaDeClienteExistente(c)]);
    setBuscaLocatario("");
    setListaLocatarioAberta(false);
    if (eraOPrimeiro && c.parceiroId) setCorretorContraparteId(c.parceiroId);
  }

  function toggleEncargo(op: string) {
    setEncargos((atual) => (atual.includes(op) ? atual.filter((e) => e !== op) : [...atual, op]));
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

  async function handleGerar() {
    setEnviando(true);
    setEtapaEnvio("");
    setResultado(null);
    try {
      const documentosEnviados: { caminho: string; nomeOriginal: string }[] = [];
      for (let i = 0; i < documentos.length; i++) {
        const arquivo = documentos[i];
        setEtapaEnvio(`Enviando documento ${i + 1} de ${documentos.length}...`);
        const preparo = await prepararUploadDocumentoAction(arquivo.name);
        if (!preparo.ok) {
          throw new Error(`Falha ao preparar envio de "${arquivo.name}": ${preparo.erro}`);
        }
        const { error: erroUpload } = await supabaseBrowser()
          .storage.from(BUCKET_DOCUMENTOS_PORTAL)
          .uploadToSignedUrl(preparo.caminho, preparo.token, arquivo, { contentType: arquivo.type });
        if (erroUpload) {
          throw new Error(`Falha ao enviar "${arquivo.name}": ${erroUpload.message}`);
        }
        documentosEnviados.push({ caminho: preparo.caminho, nomeOriginal: arquivo.name });
      }
      setEtapaEnvio("Cadastrando...");

      const formData = new FormData();
      formData.set("loja_id", lojaId);
      formData.set("adm_imovel_id", viaAdministracao ? admImovelId : "");
      formData.set("imovel_id", viaAdministracao || imovelNovo ? "" : imovelId);
      formData.set("locatariosJson", JSON.stringify(locatarios));
      if (!viaAdministracao && imovelNovo) {
        formData.set("proprietariosJson", JSON.stringify(proprietarios));
        formData.set("tipo_imovel", tipoImovelNovo);
        formData.set("rua", ruaNovo);
        formData.set("n_predial", nPredialNovo);
        formData.set("complemento", complementoNovo);
        formData.set("bairro", bairroNovo);
        formData.set("estado_id", estadoIdNovo);
        formData.set("cidade_id", cidadeIdNovo);
        formData.set("matricula", matriculaNovo);
        formData.set("inscricao", inscricaoNovo);
      }
      formData.set("data_assinatura", dataAssinatura);
      formData.set("valor_transacao", valorTransacaoTexto);
      formData.set("dia_vencimento", diaVencimento);
      formData.set("prazo_contrato_meses", prazoContratoMesesTexto);
      formData.set("data_vencimento", dataVencimento);
      formData.set("finalidade_locacao", finalidadeLocacao);
      formData.set("garantia", garantia);
      formData.set("valor_caucao", valorCaucaoTexto);
      formData.set("pg_caucao", pgCaucao);
      formData.set("forma_pagamento", formaPagamento);
      encargos.forEach((e) => formData.append("encargos", e));
      formData.set("porc_honorario", porcHonorarioTexto);
      formData.set("tem_parceria", temParceria ? "on" : "");
      formData.set("parceiro_externo_id", parceiroExternoId);
      formData.set("porc_parceria", porcParceriaTexto);
      formData.set("corretor_proprietario_id", corretorProprietarioId);
      formData.set("corretor_contraparte_id", corretorContraparteId);
      formData.set("documentosJson", JSON.stringify(documentosEnviados));

      const r = await gerarLocacaoAction(formData);
      setResultado(r);
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

  const podeGerar =
    lojaId.length > 0 &&
    (viaAdministracao
      ? admImovelId.length > 0
      : imovelNovo
      ? tipoImovelNovo.length > 0 && ruaNovo.trim().length > 0 && proprietarios.length > 0
      : imovelId.length > 0) &&
    locatarios.length > 0 &&
    valorTransacaoTexto.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">1. Identificação</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Loja</label>
            <select className={CAMPO} value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
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
            <input
              className={CAMPO + " bg-gray-50 text-gray-500"}
              readOnly
              value={viaAdministracao ? "Elaboração de Contrato de Locação" : "Imóvel em locação sem administração"}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">2. Origem do imóvel</div>
        <p className="text-[11px] text-gray-400 mb-3">
          Se o imóvel já tem uma Administração Ativa, use essa opção — o imóvel e o proprietário vêm dela
          automaticamente e, ao cadastrar, a administração passa sozinha de Ativo para Locado.
        </p>

        <div className="flex flex-col gap-2 mb-4">
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="radio"
              name="origem"
              checked={viaAdministracao}
              onChange={() => alternarViaAdministracao(true)}
            />
            Através de uma Administração (status Ativo)
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="radio"
              name="origem"
              checked={!viaAdministracao}
              onChange={() => alternarViaAdministracao(false)}
            />
            Sem administração
          </label>
        </div>

        {viaAdministracao ? (
          <div className="relative">
            <label className={LABEL}>Administração</label>
            <input
              className={CAMPO}
              placeholder="Digite endereço ou nome do proprietário..."
              value={buscaAdministracao}
              onChange={(e) => {
                setBuscaAdministracao(e.target.value);
                setAdmImovelId("");
                setListaAdministracaoAberta(true);
              }}
              onFocus={() => setListaAdministracaoAberta(true)}
              onBlur={() => setTimeout(() => setListaAdministracaoAberta(false), 150)}
            />
            {listaAdministracaoAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                {administracoesFiltradas.length === 0 && (
                  <p className="text-xs text-gray-400 p-3">Nenhuma administração ativa encontrada.</p>
                )}
                {administracoesFiltradas.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onMouseDown={() => selecionarAdministracao(a)}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {labelAdministracao(a)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : !imovelNovo ? (
          <>
            <div className="relative">
              <label className={LABEL}>Imóvel</label>
              <p className="text-[11px] text-gray-400 mb-1">
                Não mostra imóveis com administração ativa — esses precisam ser vinculados por lá.
              </p>
              <input
                className={CAMPO}
                placeholder="Digite endereço, inscrição ou nome do proprietário..."
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

            <button type="button" onClick={ativarImovelNovo} className="text-xs text-primary font-semibold mt-3 hover:opacity-80">
              + Cadastrar imóvel novo (não existe no sistema ainda)
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-700">Imóvel novo</span>
              <button type="button" onClick={cancelarImovelNovo} className="text-[11px] text-gray-400 hover:text-red-600">
                cancelar e buscar imóvel existente
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className={LABEL}>Tipo de imóvel</label>
                <select className={CAMPO} value={tipoImovelNovo} onChange={(e) => setTipoImovelNovo(e.target.value)}>
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
                <input className={CAMPO} value={ruaNovo} onChange={(e) => setRuaNovo(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Número</label>
                <input className={CAMPO} value={nPredialNovo} onChange={(e) => setNPredialNovo(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Complemento</label>
                <input className={CAMPO} value={complementoNovo} onChange={(e) => setComplementoNovo(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Bairro</label>
                <input className={CAMPO} value={bairroNovo} onChange={(e) => setBairroNovo(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Estado</label>
                <select
                  className={CAMPO}
                  value={estadoIdNovo}
                  onChange={(e) => {
                    setEstadoIdNovo(e.target.value);
                    setCidadeIdNovo("");
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
                <select className={CAMPO} value={cidadeIdNovo} onChange={(e) => setCidadeIdNovo(e.target.value)}>
                  <option value="">—</option>
                  {cidadesDoEstadoNovo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Matrícula</label>
                <input className={CAMPO} value={matriculaNovo} onChange={(e) => setMatriculaNovo(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Inscrição</label>
                <input className={CAMPO} value={inscricaoNovo} onChange={(e) => setInscricaoNovo(e.target.value)} />
              </div>
            </div>

            <BlocoPessoas
              titulo="Proprietário(s) do imóvel"
              ajuda="Pode ter mais de um (ex.: casal, herdeiros). Se já tem cadastro, busque em vez de digitar de novo."
              pessoas={proprietarios}
              setPessoas={setProprietarios}
              clientesDisponiveis={clientes}
              busca={buscaProprietario}
              setBusca={setBuscaProprietario}
              listaAberta={listaProprietarioAberta}
              setListaAberta={setListaProprietarioAberta}
              bancos={bancos}
            />
          </>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <BlocoPessoas
          titulo="3. Locatário(s)"
          ajuda="Pode ter mais de um locatário. Se já tem cadastro (de qualquer corretor), busque em vez de digitar de novo."
          pessoas={locatarios}
          setPessoas={setLocatarios}
          clientesDisponiveis={clientes}
          busca={buscaLocatario}
          setBusca={setBuscaLocatario}
          listaAberta={listaLocatarioAberta}
          setListaAberta={setListaLocatarioAberta}
          bancos={bancos}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">4. Datas e valor</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Data de assinatura</label>
            <input type="date" className={CAMPO} value={dataAssinatura} onChange={(e) => setDataAssinatura(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Valor do aluguel (R$)</label>
            <input
              className={CAMPO}
              placeholder="1.500,00"
              value={valorTransacaoTexto}
              onChange={(e) => setValorTransacaoTexto(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Dia de vencimento (aluguel)</label>
            <input className={CAMPO} placeholder="10" value={diaVencimento} onChange={(e) => setDiaVencimento(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Tempo de contrato (meses)</label>
            <input
              className={CAMPO}
              placeholder="30"
              value={prazoContratoMesesTexto}
              onChange={(e) => setPrazoContratoMesesTexto(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Data de vencimento (fim do contrato)</label>
            <input
              type="date"
              className={CAMPO}
              value={dataVencimento}
              onChange={(e) => {
                setVencimentoEditadoManual(true);
                setDataVencimento(e.target.value);
              }}
            />
            <p className="text-[11px] text-gray-400 mt-1">Preenchida automaticamente ao definir Assinatura e Prazo.</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">5. Detalhes da locação</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Finalidade da locação</label>
            <select className={CAMPO} value={finalidadeLocacao} onChange={(e) => setFinalidadeLocacao(e.target.value)}>
              <option value="">—</option>
              {FINALIDADE_LOCACAO_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Garantia</label>
            <select className={CAMPO} value={garantia} onChange={(e) => setGarantia(e.target.value)}>
              <option value="">—</option>
              {GARANTIA_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Valor da caução (R$)</label>
            <input className={CAMPO} placeholder="1.500,00" value={valorCaucaoTexto} onChange={(e) => setValorCaucaoTexto(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Forma de pagamento da caução</label>
            <input className={CAMPO} value={pgCaucao} onChange={(e) => setPgCaucao(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Forma de pagamento</label>
            <select className={CAMPO} value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
              <option value="">—</option>
              {FORMA_PAGAMENTO_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Encargos</label>
            <div className="flex flex-col gap-1 mt-1">
              {ENCARGOS_OPCOES.map((op) => (
                <label key={op} className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={encargos.includes(op)} onChange={() => toggleEncargo(op)} />
                  {op}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">6. Comissionamento</div>
        <p className="text-[11px] text-gray-400 mb-3">
          A divisão entre os corretores (% de cada um e da imobiliária) fica com o administrativo — aqui só o
          honorário total e a parceria, se tiver.
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Corretor do proprietário</label>
            <select className={CAMPO} value={corretorProprietarioId} onChange={(e) => setCorretorProprietarioId(e.target.value)}>
              <option value="">—</option>
              {corretores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Corretor do locatário</label>
            <select className={CAMPO} value={corretorContraparteId} onChange={(e) => setCorretorContraparteId(e.target.value)}>
              <option value="">—</option>
              {corretores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Honorário total (%)</label>
            <input className={CAMPO} placeholder="100" value={porcHonorarioTexto} onChange={(e) => setPorcHonorarioTexto(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="tem_parceria" checked={temParceria} onChange={(e) => setTemParceria(e.target.checked)} />
            <label htmlFor="tem_parceria" className="text-xs text-gray-600">
              Tem parceria externa
            </label>
          </div>
          {temParceria && (
            <div>
              <label className={LABEL}>Parceiro externo</label>
              <select className={CAMPO} value={parceiroExternoId} onChange={(e) => setParceiroExternoId(e.target.value)}>
                <option value="">—</option>
                {parceirosTodos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          {temParceria && (
            <div>
              <label className={LABEL}>% da parceria (sobre o honorário total)</label>
              <input className={CAMPO} placeholder="20" value={porcParceriaTexto} onChange={(e) => setPorcParceriaTexto(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">7. Documentação</div>
        <p className="text-[11px] text-gray-400 mb-3">
          PDF ou imagem (RG, comprovante de renda, contrato assinado etc.). Vai direto por email pro administrativo
          junto com o resumo da transação — não fica guardado no sistema. Total até {formatarTamanho(TAMANHO_MAXIMO_TOTAL)}.
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
          disabled={!podeGerar || enviando}
          onClick={handleGerar}
          className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40 hover:opacity-90"
        >
          {enviando ? etapaEnvio || "Cadastrando..." : "Cadastrar transação"}
        </button>
        {resultado?.ok && (
          <span className="text-xs text-green-700 font-semibold">
            Cadastrado com sucesso{resultado.idLegado ? ` — ${resultado.idLegado}` : ""}. O administrativo vai dar
            sequência.
            {!resultado.emailEnviado && (
              <span className="block text-amber-700 font-normal mt-0.5">
                A transação foi salva, mas o email com a documentação não saiu{resultado.emailErro ? `: ${resultado.emailErro}` : "."} Avise o administrativo por outro canal.
              </span>
            )}
          </span>
        )}
        {resultado && !resultado.ok && <span className="text-xs text-red-600">{resultado.erro}</span>}
      </div>
    </div>
  );
}
