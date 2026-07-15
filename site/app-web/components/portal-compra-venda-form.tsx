"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CHAVE_OPCOES,
  TIPO_CONDICAO_OPCOES,
  FORMA_PAGAMENTO_CONDICAO_OPCOES,
  MOMENTO_CONDICAO_OPCOES
} from "@/lib/transacoes/opcoes";
import { TIPOS_IMOVEL } from "@/lib/imoveis/opcoes";
import { ESTADOS_CIVIS } from "@/lib/clientes/opcoes";
import type { ImovelBuscaResultado, ClienteBuscaResultado } from "@/lib/transacoes/buscas";
import { gerarCompraVendaAction, prepararUploadDocumentoAction } from "@/app/portal/compra-venda/actions";
import { supabaseBrowser, BUCKET_DOCUMENTOS_PORTAL } from "@/lib/supabase-browser";

type CondicaoPagamento = {
  tipo: string;
  valor: string;
  forma_pagamento: string;
  parcelas: string;
  momento: string;
  data_pagamento: string;
  descricao: string;
};

function condicaoVazia(): CondicaoPagamento {
  return { tipo: TIPO_CONDICAO_OPCOES[0], valor: "", forma_pagamento: "", parcelas: "", momento: "", data_pagamento: "", descricao: "" };
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Limite do lado do cliente pra não deixar o corretor anexar um total que
// nem cabe num email (o Gmail aceita até ~25MB por envio, já contando a
// codificação base64 dos anexos — que aumenta o tamanho em ~33% — e o corpo
// do email). 15MB de arquivo original fica com folga segura. Isso também
// precisa bater com o limite de corpo da Server Action (next.config.mjs
// experimental.serverActions.bodySizeLimit) — se um desses dois mudar, o
// outro precisa acompanhar.
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

function labelCliente(c: ClienteBuscaResultado): string {
  return c.cpfCnpj ? `${c.nome} — ${c.cpfCnpj}` : c.nome;
}

// Quantos resultados mostrar no dropdown de busca quando o corretor ainda
// não digitou nada — antes ficava em 30 e, como a lista já vem ordenada
// alfabeticamente do servidor, na prática só dava pra ver clientes/imóveis
// com nome começando por A/B. 200 cobre o cadastro inteiro da imobiliária
// na grande maioria dos casos; digitando algo o filtro já reduz sozinho.
const RESULTADOS_MAXIMO = 200;

// Um comprador ou vendedor do formulário — ou já cadastrado (clienteId
// presente, escolhido via busca, campos travados) ou novo (digitado na
// hora, com checagem de duplicidade no servidor). Mesmo padrão do
// formulário de Administração (components/portal-administracao-form.tsx).
type PessoaLinha = {
  clienteId?: string;
  nome: string;
  rg: string;
  cpfCnpj: string;
  endereco: string;
  nacionalidade: string;
  estadoCivil: string;
  email: string;
  telefone: string;
};

function pessoaVazia(): PessoaLinha {
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

function pessoaDeClienteExistente(c: ClienteBuscaResultado): PessoaLinha {
  return {
    clienteId: c.id,
    nome: c.nome,
    rg: "",
    cpfCnpj: c.cpfCnpj ?? "",
    endereco: "",
    nacionalidade: "",
    estadoCivil: "",
    email: c.email ?? "",
    telefone: c.telefone ?? ""
  };
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Rascunho salvo no navegador (localStorage) — pedido do corretor depois de
// perder um cadastro inteiro "do zero" (cliente+vendedor+imóvel novos) por
// causa de um erro no envio. Fica só no aparelho dele, nada sobe pro
// servidor. Documentos anexados (File) NÃO entram no rascunho — não dá pra
// serializar isso pro localStorage (e o espaço por origem é pequeno demais
// pra PDF/foto); o corretor precisa re-anexar antes de cadastrar de novo.
const RASCUNHO_KEY = "sis_rascunho_compra_venda";

type RascunhoCompraVenda = {
  salvoEm: number;
  lojaId: string;
  imovelId: string;
  buscaImovel: string;
  imovelNovo: boolean;
  tipoImovelNovo: string;
  ruaNovo: string;
  nPredialNovo: string;
  complementoNovo: string;
  bairroNovo: string;
  estadoIdNovo: string;
  cidadeIdNovo: string;
  matriculaNovo: string;
  inscricaoNovo: string;
  vendedores: PessoaLinha[];
  compradores: PessoaLinha[];
  compraSemGestao: boolean;
  dataAssinatura: string;
  valorTransacaoTexto: string;
  chave: string;
  condicoes: CondicaoPagamento[];
  porcHonorarioTexto: string;
  temParceria: boolean;
  parceiroExternoId: string;
  porcParceriaTexto: string;
  corretorProprietarioId: string;
  corretorContraparteId: string;
  historicoData: string;
  historicoPrazoMeses: string;
  historicoValor: string;
};

function formatarDataHoraRascunho(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Bloco reutilizado pra comprador(es) e vendedor(es) — busca+escolhe cliente
// já cadastrado (de qualquer corretor) ou cadastra um novo na hora, com os
// mesmos campos usados no cadastro de Clientes.
function BlocoPessoas({
  titulo,
  ajuda,
  pessoas,
  setPessoas,
  clientesDisponiveis,
  busca,
  setBusca,
  listaAberta,
  setListaAberta
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
                    <label className={LABEL}>Email</label>
                    <input className={CAMPO} value={p.email} onChange={(e) => atualizar(index, "email", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>Telefone</label>
                    <input className={CAMPO} value={p.telefone} onChange={(e) => atualizar(index, "telefone", e.target.value)} />
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

export function PortalCompraVendaForm({
  corretorLogadoId,
  lojas,
  corretores,
  parceirosTodos,
  imoveis,
  clientes,
  estados,
  cidades
}: {
  corretorLogadoId: string;
  lojas: { id: string; nome: string }[];
  corretores: { id: string; nome: string }[];
  parceirosTodos: { id: string; nome: string }[];
  imoveis: ImovelBuscaResultado[];
  clientes: ClienteBuscaResultado[];
  estados: { id: string; nome: string }[];
  cidades: { id: string; nome: string; estado_id: string }[];
}) {
  const [lojaId, setLojaId] = useState("");

  const [imovelId, setImovelId] = useState("");
  const [buscaImovel, setBuscaImovel] = useState("");
  const [listaImovelAberta, setListaImovelAberta] = useState(false);

  // Imóvel novo — usado quando o imóvel ainda não existe no sistema (venda
  // direta captada e vendida na mesma hora, sem passar por Gestão antes).
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
  const [vendedores, setVendedores] = useState<PessoaLinha[]>([]);
  const [buscaVendedor, setBuscaVendedor] = useState("");
  const [listaVendedorAberta, setListaVendedorAberta] = useState(false);

  const [compradores, setCompradores] = useState<PessoaLinha[]>([]);
  const [buscaComprador, setBuscaComprador] = useState("");
  const [listaCompradorAberta, setListaCompradorAberta] = useState(false);

  const [compraSemGestao, setCompraSemGestao] = useState(false);

  const [dataAssinatura, setDataAssinatura] = useState(hojeISO());
  const [valorTransacaoTexto, setValorTransacaoTexto] = useState("");
  const [chave, setChave] = useState("");

  const [condicoes, setCondicoes] = useState<CondicaoPagamento[]>([]);
  const [novaCondicao, setNovaCondicao] = useState<CondicaoPagamento>(condicaoVazia());

  const [porcHonorarioTexto, setPorcHonorarioTexto] = useState("");
  const [temParceria, setTemParceria] = useState(false);
  const [parceiroExternoId, setParceiroExternoId] = useState("");
  const [porcParceriaTexto, setPorcParceriaTexto] = useState("");

  const [corretorProprietarioId, setCorretorProprietarioId] = useState(corretorLogadoId);
  const [corretorContraparteId, setCorretorContraparteId] = useState("");

  const [historicoData, setHistoricoData] = useState("");
  const [historicoPrazoMeses, setHistoricoPrazoMeses] = useState("");
  const [historicoValor, setHistoricoValor] = useState("");

  const [documentos, setDocumentos] = useState<File[]>([]);
  const [erroAnexo, setErroAnexo] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [etapaEnvio, setEtapaEnvio] = useState("");
  const [resultado, setResultado] = useState<
    | { ok: true; idLegado: string | null; emailEnviado: boolean; emailErro?: string }
    | { ok: false; erro: string }
    | null
  >(null);

  const [rascunhoEncontrado, setRascunhoEncontrado] = useState<RascunhoCompraVenda | null>(null);
  const [rascunhoSalvoAgora, setRascunhoSalvoAgora] = useState(false);

  const imovelSelecionado = useMemo(() => imoveis.find((i) => i.id === imovelId) ?? null, [imoveis, imovelId]);
  const gestaoEncontrada = imovelSelecionado?.gestaoId ?? null;
  // Imóvel novo nunca tem Gestão cadastrada ainda (é a primeira vez que
  // entra no sistema) — segue a mesma régua de "nenhuma gestão encontrada".
  const mostrarHistoricoGestao = (Boolean(imovelSelecionado) || imovelNovo) && !gestaoEncontrada && !compraSemGestao;

  const cidadesDoEstadoNovo = useMemo(() => cidades.filter((c) => c.estado_id === estadoIdNovo), [cidades, estadoIdNovo]);

  const imoveisFiltrados = useMemo(() => {
    const b = buscaImovel.trim().toLowerCase();
    if (!b) return imoveis.slice(0, RESULTADOS_MAXIMO);
    return imoveis
      .filter(
        (i) =>
          (i.id_legado ?? "").toLowerCase().includes(b) ||
          i.proprietarios.some((p) => p.nome.toLowerCase().includes(b)) ||
          (i.endereco ?? "").toLowerCase().includes(b) ||
          (i.inscricao ?? "").toLowerCase().includes(b)
      )
      .slice(0, RESULTADOS_MAXIMO);
  }, [buscaImovel, imoveis]);

  // Ao montar, só AVISA que existe um rascunho salvo — não aplica sozinho
  // (evita sobrescrever o que o corretor já tiver preenchido nesta mesma
  // visita, e evita descompasso de hidratação do Next, já que localStorage
  // só existe no navegador).
  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(RASCUNHO_KEY);
      if (bruto) setRascunhoEncontrado(JSON.parse(bruto));
    } catch {
      // rascunho corrompido ou localStorage indisponível — ignora
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function montarRascunho(): RascunhoCompraVenda {
    return {
      salvoEm: Date.now(),
      lojaId,
      imovelId,
      buscaImovel,
      imovelNovo,
      tipoImovelNovo,
      ruaNovo,
      nPredialNovo,
      complementoNovo,
      bairroNovo,
      estadoIdNovo,
      cidadeIdNovo,
      matriculaNovo,
      inscricaoNovo,
      vendedores,
      compradores,
      compraSemGestao,
      dataAssinatura,
      valorTransacaoTexto,
      chave,
      condicoes,
      porcHonorarioTexto,
      temParceria,
      parceiroExternoId,
      porcParceriaTexto,
      corretorProprietarioId,
      corretorContraparteId,
      historicoData,
      historicoPrazoMeses,
      historicoValor
    };
  }

  // Salva sozinho a cada mudança relevante — o botão "Salvar rascunho"
  // abaixo só dá a confirmação visual pro corretor, o auto-save já cobre o
  // esquecimento de clicar nele.
  useEffect(() => {
    const temAlgumDado =
      lojaId.length > 0 ||
      imovelId.length > 0 ||
      imovelNovo ||
      compradores.length > 0 ||
      vendedores.length > 0 ||
      valorTransacaoTexto.length > 0;
    if (!temAlgumDado) return;
    try {
      window.localStorage.setItem(RASCUNHO_KEY, JSON.stringify(montarRascunho()));
    } catch {
      // localStorage cheio ou indisponível — não trava o formulário por isso
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lojaId,
    imovelId,
    buscaImovel,
    imovelNovo,
    tipoImovelNovo,
    ruaNovo,
    nPredialNovo,
    complementoNovo,
    bairroNovo,
    estadoIdNovo,
    cidadeIdNovo,
    matriculaNovo,
    inscricaoNovo,
    vendedores,
    compradores,
    compraSemGestao,
    dataAssinatura,
    valorTransacaoTexto,
    chave,
    condicoes,
    porcHonorarioTexto,
    temParceria,
    parceiroExternoId,
    porcParceriaTexto,
    corretorProprietarioId,
    corretorContraparteId,
    historicoData,
    historicoPrazoMeses,
    historicoValor
  ]);

  function restaurarRascunho() {
    const r = rascunhoEncontrado;
    if (!r) return;
    setLojaId(r.lojaId);
    setImovelId(r.imovelId);
    setBuscaImovel(r.buscaImovel);
    setImovelNovo(r.imovelNovo);
    setTipoImovelNovo(r.tipoImovelNovo);
    setRuaNovo(r.ruaNovo);
    setNPredialNovo(r.nPredialNovo);
    setComplementoNovo(r.complementoNovo);
    setBairroNovo(r.bairroNovo);
    setEstadoIdNovo(r.estadoIdNovo);
    setCidadeIdNovo(r.cidadeIdNovo);
    setMatriculaNovo(r.matriculaNovo);
    setInscricaoNovo(r.inscricaoNovo);
    setVendedores(r.vendedores);
    setCompradores(r.compradores);
    setCompraSemGestao(r.compraSemGestao);
    setDataAssinatura(r.dataAssinatura);
    setValorTransacaoTexto(r.valorTransacaoTexto);
    setChave(r.chave);
    setCondicoes(r.condicoes);
    setPorcHonorarioTexto(r.porcHonorarioTexto);
    setTemParceria(r.temParceria);
    setParceiroExternoId(r.parceiroExternoId);
    setPorcParceriaTexto(r.porcParceriaTexto);
    setCorretorProprietarioId(r.corretorProprietarioId);
    setCorretorContraparteId(r.corretorContraparteId);
    setHistoricoData(r.historicoData);
    setHistoricoPrazoMeses(r.historicoPrazoMeses);
    setHistoricoValor(r.historicoValor);
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
    if (vendedores.length === 0) setVendedores([pessoaVazia()]);
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
    setVendedores([]);
  }

  function adicionarCondicao() {
    if (!novaCondicao.valor.trim()) return;
    setCondicoes((atual) => [...atual, novaCondicao]);
    setNovaCondicao(condicaoVazia());
  }

  function removerCondicao(indice: number) {
    setCondicoes((atual) => atual.filter((_, i) => i !== indice));
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
      // Documentos sobem direto pro Supabase Storage ANTES de qualquer
      // coisa — nunca passam pela Server Action de cadastro. A Vercel tem
      // um limite FIXO de 4,5MB por requisição de função (não dá pra
      // configurar, é da plataforma), e um PDF escaneado ou foto de
      // celular estoura isso fácil. Foi exatamente isso que causava "An
      // unexpected response was received from the server." sem mais
      // explicação nenhuma.
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
      formData.set("imovel_id", imovelNovo ? "" : imovelId);
      formData.set("compra_sem_gestao", compraSemGestao ? "on" : "");
      formData.set("compradoresJson", JSON.stringify(compradores));
      if (imovelNovo) {
        formData.set("vendedoresJson", JSON.stringify(vendedores));
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
      formData.set("chave", chave);
      formData.set("condicoes_pagamento_json", JSON.stringify(condicoes));
      formData.set("porc_honorario", porcHonorarioTexto);
      formData.set("tem_parceria", temParceria ? "on" : "");
      formData.set("parceiro_externo_id", parceiroExternoId);
      formData.set("porc_parceria", porcParceriaTexto);
      formData.set("corretor_proprietario_id", corretorProprietarioId);
      formData.set("corretor_contraparte_id", corretorContraparteId);
      if (mostrarHistoricoGestao) {
        formData.set("historico_gestao_data_assinatura", historicoData);
        formData.set("historico_gestao_prazo_meses", historicoPrazoMeses);
        formData.set("historico_gestao_valor", historicoValor);
      }
      formData.set("documentosJson", JSON.stringify(documentosEnviados));

      const r = await gerarCompraVendaAction(formData);
      setResultado(r);
      if (r.ok) {
        // Cadastrou com sucesso — o rascunho não serve mais pra nada,
        // limpa pra não confundir numa visita futura.
        try {
          window.localStorage.removeItem(RASCUNHO_KEY);
        } catch {
          // ignora
        }
      }
    } catch (erro) {
      // Sem isso, qualquer erro que escape do try acima (ex.: a função no
      // servidor cair por timeout, erro de rede, ou qualquer exceção que
      // não vire um retorno { ok: false }) simplesmente desaparecia — a
      // tela ficava parada sem avisar nada. Isso é o que estava acontecendo
      // no cadastro "tudo do zero" (cliente + vendedor + imóvel novos).
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
    (imovelNovo ? tipoImovelNovo.length > 0 && ruaNovo.trim().length > 0 && vendedores.length > 0 : imovelId.length > 0) &&
    compradores.length > 0 &&
    valorTransacaoTexto.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      {rascunhoEncontrado && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs text-amber-800">
            Encontramos um rascunho salvo neste navegador em{" "}
            <strong>{formatarDataHoraRascunho(rascunhoEncontrado.salvoEm)}</strong>. Quer continuar de onde parou?
            {" "}(anexos de documento não ficam salvos — se tinha algum, precisa adicionar de novo).
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={restaurarRascunho}
              className="text-xs bg-amber-600 text-white rounded-lg px-3 py-1.5 font-semibold hover:opacity-90"
            >
              Restaurar rascunho
            </button>
            <button type="button" onClick={descartarRascunho} className="text-xs text-amber-700 hover:text-amber-900">
              descartar
            </button>
          </div>
        </div>
      )}

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
            <input className={CAMPO + " bg-gray-50 text-gray-500"} readOnly value="Elaboração do Contrato de Compra e Venda" />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">2. Imóvel</div>
        <p className="text-[11px] text-gray-400 mb-3">
          O imóvel pode ser de qualquer captação da imobiliária, não só a sua. Se ainda não existe no sistema,
          cadastre na hora junto com o(s) vendedor(es).
        </p>

        {!imovelNovo ? (
          <>
            <div className="relative">
              <label className={LABEL}>Imóvel</label>
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

              {imovelSelecionado && (
                <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  {gestaoEncontrada ? (
                    <div className="text-xs text-blue-700">
                      Gestão já cadastrada pra esse imóvel — vai ser vinculada automático (entra uma atividade no
                      quadro dela; a coluna do quadro não muda sozinha).
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600">Nenhuma Gestão cadastrada pra esse imóvel.</div>
                  )}
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
              titulo="Vendedor(es) — proprietário(s) do imóvel"
              ajuda="Pode ter mais de um (ex.: casal, herdeiros). Se já tem cadastro, busque em vez de digitar de novo."
              pessoas={vendedores}
              setPessoas={setVendedores}
              clientesDisponiveis={clientes}
              busca={buscaVendedor}
              setBusca={setBuscaVendedor}
              listaAberta={listaVendedorAberta}
              setListaAberta={setListaVendedorAberta}
            />
          </>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <BlocoPessoas
          titulo="3. Cliente(s) comprador(es)"
          ajuda="Pode ter mais de um comprador. Se já tem cadastro (de qualquer corretor), busque em vez de digitar de novo."
          pessoas={compradores}
          setPessoas={setCompradores}
          clientesDisponiveis={clientes}
          busca={buscaComprador}
          setBusca={setBuscaComprador}
          listaAberta={listaCompradorAberta}
          setListaAberta={setListaCompradorAberta}
        />

        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="compra_sem_gestao"
            checked={compraSemGestao}
            onChange={(e) => setCompraSemGestao(e.target.checked)}
          />
          <label htmlFor="compra_sem_gestao" className="text-xs text-gray-600">
            Compra sem gestão (venda direta, não vem de uma captação nossa — não entra no quadro de gestão)
          </label>
        </div>

        {mostrarHistoricoGestao && (
          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3">
            <p className="text-[11px] text-amber-700 mb-2">
              Se essa gestão já existia mas nunca foi cadastrada no sistema (contrato antigo), preencha o que
              souber abaixo — só pra comparar com o valor e o prazo fechados agora. Isso não cria uma Gestão de
              verdade.
            </p>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>Data de assinatura (gestão antiga)</label>
                <input type="date" className={CAMPO} value={historicoData} onChange={(e) => setHistoricoData(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Tempo de gestão (meses)</label>
                <input
                  className={CAMPO}
                  placeholder="6"
                  value={historicoPrazoMeses}
                  onChange={(e) => setHistoricoPrazoMeses(e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL}>Valor da época (R$)</label>
                <input
                  className={CAMPO}
                  placeholder="300.000,00"
                  value={historicoValor}
                  onChange={(e) => setHistoricoValor(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">4. Datas e valor</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Data de assinatura</label>
            <input type="date" className={CAMPO} value={dataAssinatura} onChange={(e) => setDataAssinatura(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Valor da transação (R$)</label>
            <input
              className={CAMPO}
              placeholder="350.000,00"
              value={valorTransacaoTexto}
              onChange={(e) => setValorTransacaoTexto(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">5. Momento de entrega das chaves</div>
        <select className={CAMPO} value={chave} onChange={(e) => setChave(e.target.value)}>
          <option value="">—</option>
          {CHAVE_OPCOES.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">6. Negócio — condições de pagamento</div>
        <p className="text-xs text-gray-400 mb-3">
          Entrada, saldo financiado, parcelado direto, permuta etc. Pode ter mais de uma etapa.
        </p>

        {condicoes.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-3">
            {condicoes.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-gray-700">
                  <span className="font-semibold text-gray-800">{c.tipo}</span> — R$ {c.valor}
                  {c.forma_pagamento && <span className="text-gray-500"> · {c.forma_pagamento}</span>}
                  {c.parcelas && <span className="text-gray-500"> · {c.parcelas}x</span>}
                  {c.momento && <span className="text-gray-500"> · {c.momento}</span>}
                </span>
                <button type="button" onClick={() => removerCondicao(i)} className="text-gray-400 hover:text-red-600 ml-2 shrink-0">
                  remover
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-3 items-end bg-gray-50/50 border border-dashed border-gray-200 rounded-lg p-3">
          <div>
            <label className={LABEL}>Tipo</label>
            <select className={CAMPO} value={novaCondicao.tipo} onChange={(e) => setNovaCondicao((a) => ({ ...a, tipo: e.target.value }))}>
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
            <button type="button" onClick={adicionarCondicao} className="text-xs bg-white border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 font-semibold">
              + Adicionar condição
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">7. Comissionamento</div>
        <p className="text-[11px] text-gray-400 mb-3">
          A divisão entre os corretores (% de cada um e da imobiliária) fica com o administrativo — aqui só o
          honorário total e a parceria, se tiver.
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Corretor do proprietário (vendedor)</label>
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
            <label className={LABEL}>Corretor do comprador</label>
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
            <input className={CAMPO} placeholder="6" value={porcHonorarioTexto} onChange={(e) => setPorcHonorarioTexto(e.target.value)} />
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
        <div className="text-sm font-bold text-gray-800 mb-1">8. Documentação</div>
        <p className="text-[11px] text-gray-400 mb-3">
          PDF ou imagem (RG, comprovante, contrato assinado etc.). Vai direto por email pro administrativo
          junto com o resumo da transação — não fica guardado no sistema. Total até {formatarTamanho(TAMANHO_MAXIMO_TOTAL)}.
          Anexos não entram no rascunho salvo — se recarregar a página, precisa adicionar de novo.
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
        <button
          type="button"
          onClick={salvarRascunhoManual}
          className="bg-white border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-gray-50"
        >
          Salvar rascunho
        </button>
        {rascunhoSalvoAgora && <span className="text-xs text-green-700 font-semibold">Rascunho salvo neste navegador.</span>}
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
