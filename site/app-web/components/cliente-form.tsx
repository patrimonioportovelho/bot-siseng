"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import {
  ESTADOS_CIVIS,
  ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL,
  TIPOS_CONTA,
  TIPOS_PIX,
  TIPOS_CLIENTE,
  SEXO_OPCOES,
  CAT_PROFISSAO_OPCOES
} from "@/lib/clientes/opcoes";
import { formatCpf, formatCnpj, formatTelefone, formatValorEditavel, formatMoeda, formatDataCalendario } from "@/lib/format";
import { validarCpfCnpj } from "@/lib/clientes/validacao";
import { buscarCep, UF_PARA_ESTADO } from "@/lib/enderecos";
import { SocioForm } from "@/components/socio-form";

type Loja = { id: string; nome: string };
type Banco = { id: string; nome: string; codigo: string | null };
type ParceiroOpcao = { id: string; nome: string; loja_id: string | null };
type EstadoOpcao = { id: string; nome: string };
type CidadeOpcao = { id: string; nome: string; estado_id: string };
type ClientePF = { id: string; nome: string; cpf: string | null };
type SocioVinculado = { vinculoId: string; id: string; nome: string; cpf: string | null };

type ClienteExistente = {
  id: string;
  nome: string;
  tipo_cliente: string;
  sexo: string | null;
  cpf: string | null;
  cnpj: string | null;
  rg: string | null;
  expedicao: string | null;
  telefone: string | null;
  email: string | null;
  estado_civil: string | null;
  uniao_estavel: boolean | null;
  nome_mae: string | null;
  nome_pai: string | null;
  renda_bruta: unknown;
  data_nascimento: Date | null;
  cat_profissao: string | null;
  tipo_servidor: string | null;
  profissao: string | null;
  cep: string | null;
  rua: string | null;
  n_predial: string | null;
  complemento: string | null;
  bairro: string | null;
  estado_id: string | null;
  cidade_id: string | null;
  endereco: string | null;
  observacao: string | null;
  parceiro_id: string | null;
  loja_id: string | null;
  banco_id: string | null;
  codigo_banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  tipo_pix: string | null;
  pix: string | null;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function formatCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

function Cartao({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-gray-800">{titulo}</div>
        {acao}
      </div>
      {children}
    </div>
  );
}

// Par label/valor lado a lado (estilo AppSheet) — usado na ficha de
// visualização, somente leitura, mesmo padrão de components/parceiro-form.tsx.
function Linha({ label, valor }: { label: string; valor: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="text-xs text-gray-800 font-medium mt-0.5 break-words">{valor ?? "—"}</div>
    </div>
  );
}

// Ficha de visualização (somente leitura) — pedido do usuário em 05/08/2026:
// abrir um cliente cadastrado mostrava direto o formulário de edição
// inteiro, liberado pra mexer em qualquer campo sem querer. Agora abre como
// ficha, só com um botão "Editar" — mesmo padrão já usado em Parceiro
// (components/parceiro-form.tsx) e Avaliação (components/avaliacao-form.tsx).
function Ficha({
  cliente,
  lojas,
  bancos,
  parceiros,
  estados,
  cidades,
  onEditar
}: {
  cliente: ClienteExistente;
  lojas: Loja[];
  bancos: Banco[];
  parceiros: ParceiroOpcao[];
  estados: EstadoOpcao[];
  cidades: CidadeOpcao[];
  onEditar: () => void;
}) {
  const c = cliente;
  const ehPessoaJuridica = c.tipo_cliente === "Pessoa Jurídica";
  const pedeUniaoEstavel = c.estado_civil ? ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(c.estado_civil) : false;

  const parceiro = parceiros.find((p) => p.id === c.parceiro_id);
  const loja = lojas.find((l) => l.id === c.loja_id);
  const banco = bancos.find((b) => b.id === c.banco_id);
  const estado = estados.find((e) => e.id === c.estado_id);
  const cidade = cidades.find((cid) => cid.id === c.cidade_id);

  const BotaoEditar = (
    <button
      type="button"
      onClick={onEditar}
      className="text-xs border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-50 font-semibold"
    >
      Editar
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <Cartao titulo="Identificação" acao={BotaoEditar}>
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Tipo de cliente" valor={c.tipo_cliente} />
          <Linha label={ehPessoaJuridica ? "Razão social" : "Nome completo"} valor={c.nome} />
          {!ehPessoaJuridica && <Linha label="CPF" valor={c.cpf ? formatCpf(c.cpf) : null} />}
          {ehPessoaJuridica && <Linha label="CNPJ" valor={c.cnpj ? formatCnpj(c.cnpj) : null} />}
          {!ehPessoaJuridica && (
            <>
              <Linha label="RG" valor={c.rg} />
              <Linha label="Expedição" valor={c.expedicao} />
              <Linha label="Sexo" valor={c.sexo} />
              <Linha label="Estado civil" valor={c.estado_civil} />
              {pedeUniaoEstavel && (
                <Linha
                  label="União estável"
                  valor={c.uniao_estavel === true ? "Sim" : c.uniao_estavel === false ? "Não" : "Não perguntado ainda"}
                />
              )}
              <Linha label="Data de nascimento" valor={formatDataCalendario(c.data_nascimento)} />
              <Linha label="Nome da mãe" valor={c.nome_mae} />
              <Linha label="Nome do pai" valor={c.nome_pai} />
            </>
          )}
        </div>
      </Cartao>

      <Cartao titulo="Contato">
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Telefone" valor={c.telefone ? formatTelefone(c.telefone) : null} />
          <Linha label="E-mail" valor={c.email} />
        </div>
      </Cartao>

      <Cartao titulo={ehPessoaJuridica ? "Sede" : "Endereço"}>
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="CEP" valor={c.cep} />
          <Linha label="Logradouro" valor={c.rua} />
          <Linha label="Número predial" valor={c.n_predial} />
          <Linha label="Complemento" valor={c.complemento} />
          <Linha label="Bairro" valor={c.bairro} />
          <Linha label="Estado" valor={estado?.nome} />
          <Linha label="Cidade" valor={cidade?.nome} />
          {!c.rua && c.endereco && (
            <div className="md:col-span-2">
              <Linha label={ehPessoaJuridica ? "Sede (cadastro antigo)" : "Endereço (cadastro antigo)"} valor={c.endereco} />
            </div>
          )}
        </div>
      </Cartao>

      {!ehPessoaJuridica && (
        <Cartao titulo="Profissional">
          <div className="grid md:grid-cols-2 gap-3">
            <Linha label="Profissão" valor={c.profissao} />
            <Linha label="Categoria de profissão" valor={c.cat_profissao} />
            <Linha label="Tipo de servidor" valor={c.tipo_servidor} />
            <Linha label="Renda bruta" valor={formatMoeda(c.renda_bruta)} />
          </div>
        </Cartao>
      )}

      <Cartao titulo="Vínculo">
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Parceiro responsável" valor={parceiro?.nome} />
          <Linha label="Loja" valor={loja?.nome} />
          <div className="md:col-span-2">
            <Linha label="Observação" valor={c.observacao} />
          </div>
        </div>
      </Cartao>

      <Cartao titulo="Dados bancários">
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Banco" valor={banco?.nome} />
          <Linha label="Código do banco" valor={c.codigo_banco} />
          <Linha label="Agência" valor={c.agencia} />
          <Linha label="Conta" valor={c.conta} />
          <Linha label="Tipo de conta" valor={c.tipo_conta} />
          <Linha label="Tipo de PIX" valor={c.tipo_pix} />
          <Linha label="Chave PIX" valor={c.pix} />
        </div>
      </Cartao>
    </div>
  );
}

export function ClienteForm({
  cliente,
  lojas,
  bancos,
  parceiros,
  estados,
  cidades,
  action,
  embutido,
  sociosAtuais,
  clientesPfDisponiveis,
  adicionarSocioAction,
  removerSocioAction
}: {
  cliente: ClienteExistente | null;
  lojas: Loja[];
  bancos: Banco[];
  parceiros: ParceiroOpcao[];
  estados: EstadoOpcao[];
  cidades: CidadeOpcao[];
  // Retorna { erro } em vez de lançar exceção — assim o erro aparece inline
  // aqui embaixo e o que foi digitado continua intacto (antes, qualquer erro
  // derrubava a página inteira e apagava o formulário). `duplicado: true`
  // acompanha o erro de cliente repetido e libera o checkbox "criar mesmo
  // assim" abaixo.
  action: (prevState: unknown, formData: FormData) => Promise<{ erro: string; duplicado?: boolean } | undefined | void>;
  embutido?: boolean;
  // Sócios só fazem sentido depois que a PJ já existe (precisa do id pra
  // gravar o vínculo). Em "novo cliente" esses props vêm vazios/undefined.
  sociosAtuais?: SocioVinculado[];
  clientesPfDisponiveis?: ClientePF[];
  adicionarSocioAction?: (
    prevState: unknown,
    formData: FormData
  ) => Promise<{ erro: string } | { ok: true } | undefined>;
  removerSocioAction?: (formData: FormData) => Promise<void>;
}) {
  const c = cliente;
  const [resultado, formAction] = useActionState(action, undefined);
  // Cadastro novo já nasce em modo de edição. Cadastro existente abre em
  // modo visualização (Ficha) — só entra em edição clicando em "Editar",
  // mesmo padrão de ParceiroForm/AvaliacaoForm.
  const [modoEdicao, setModoEdicao] = useState(!c);
  const [tipoCliente, setTipoCliente] = useState(c?.tipo_cliente ?? "");
  const ehPessoaJuridica = tipoCliente === "Pessoa Jurídica";
  const ehPessoaFisica = !ehPessoaJuridica;

  const [estadoCivil, setEstadoCivil] = useState(c?.estado_civil ?? "");
  // Só pergunta união estável quando o estado civil formal é Solteiro,
  // Divorciado ou Separado Judicialmente — ver comentário em
  // lib/clientes/opcoes.ts e qualificacaoTexto em lib/documentos/gerar.ts.
  const [uniaoEstavel, setUniaoEstavel] = useState(
    c?.uniao_estavel === true ? "true" : c?.uniao_estavel === false ? "false" : ""
  );
  const pedeUniaoEstavel = ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(estadoCivil);

  // Validação de CPF/CNPJ em tempo real (mesmo dígito verificador usado no
  // servidor) — pega erro de digitação antes de tentar salvar.
  const [docTexto, setDocTexto] = useState(
    ehPessoaJuridica ? (c?.cnpj ? formatCnpj(c.cnpj) : "") : c?.cpf ? formatCpf(c.cpf) : ""
  );
  const [docErro, setDocErro] = useState<string | null>(null);

  // Sócios de uma PJ sendo criada agora: como o cadastro ainda não tem id,
  // ficam em memória até o envio — vão junto num campo JSON escondido e o
  // servidor cria o vínculo logo depois de criar a PJ (ver
  // processarSociosPendentes em app/clientes/actions.ts). Evita o antigo
  // "salva primeiro, depois abre de novo pra adicionar sócio".
  type SocioPendente = {
    modo: "existente" | "novo";
    clienteId?: string;
    nome: string;
    cpf: string;
    telefone: string;
    email: string;
  };
  const [sociosPendentes, setSociosPendentes] = useState<SocioPendente[]>([]);
  const [modoSocioPendente, setModoSocioPendente] = useState<"existente" | "novo">("existente");
  const [buscaSocioPendente, setBuscaSocioPendente] = useState("");
  const [listaSocioPendenteAberta, setListaSocioPendenteAberta] = useState(false);
  const [socioPendenteSelecionado, setSocioPendenteSelecionado] = useState<ClientePF | null>(null);
  const [socioPendenteNome, setSocioPendenteNome] = useState("");
  const [socioPendenteCpf, setSocioPendenteCpf] = useState("");
  const [socioPendenteTelefone, setSocioPendenteTelefone] = useState("");
  const [socioPendenteEmail, setSocioPendenteEmail] = useState("");

  const idsJaAdicionados = useMemo(
    () => new Set(sociosPendentes.filter((s) => s.clienteId).map((s) => s.clienteId)),
    [sociosPendentes]
  );
  const sociosDisponiveisFiltrados = useMemo(() => {
    const t = buscaSocioPendente.trim().toLowerCase();
    const disponiveis = (clientesPfDisponiveis ?? []).filter((cli) => !idsJaAdicionados.has(cli.id));
    if (!t) return disponiveis.slice(0, 30);
    return disponiveis.filter((cli) => cli.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [buscaSocioPendente, clientesPfDisponiveis, idsJaAdicionados]);

  function adicionarSocioPendente() {
    if (modoSocioPendente === "existente") {
      if (!socioPendenteSelecionado) return;
      setSociosPendentes((atual) => [
        ...atual,
        {
          modo: "existente",
          clienteId: socioPendenteSelecionado.id,
          nome: socioPendenteSelecionado.nome,
          cpf: socioPendenteSelecionado.cpf ?? "",
          telefone: "",
          email: ""
        }
      ]);
      setSocioPendenteSelecionado(null);
      setBuscaSocioPendente("");
      return;
    }
    if (!socioPendenteNome.trim()) return;
    setSociosPendentes((atual) => [
      ...atual,
      {
        modo: "novo",
        nome: socioPendenteNome.trim(),
        cpf: socioPendenteCpf,
        telefone: socioPendenteTelefone,
        email: socioPendenteEmail
      }
    ]);
    setSocioPendenteNome("");
    setSocioPendenteCpf("");
    setSocioPendenteTelefone("");
    setSocioPendenteEmail("");
  }

  function removerSocioPendente(indice: number) {
    setSociosPendentes((atual) => atual.filter((_, i) => i !== indice));
  }

  // Endereço de Pessoa Física dividido em CEP/logradouro/número/complemento/
  // bairro/cidade/estado, com busca automática por CEP (ViaCEP) — pedido
  // explícito do usuário. Pessoa Jurídica usa "Sede" como texto livre solto
  // (campo `endereco` de sempre, sem divisão).
  const [cep, setCep] = useState(c?.cep ? formatCep(c.cep) : "");
  const [rua, setRua] = useState(c?.rua ?? "");
  const [bairro, setBairro] = useState(c?.bairro ?? "");
  const [estadoId, setEstadoId] = useState(c?.estado_id ?? "");
  const [cidadeId, setCidadeId] = useState(c?.cidade_id ?? "");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepAvisoCidade, setCepAvisoCidade] = useState<string | null>(null);

  const cidadesDoEstado = useMemo(() => cidades.filter((cid) => cid.estado_id === estadoId), [cidades, estadoId]);

  // Endereço antigo (importado da planilha, sem os campos divididos
  // preenchidos) — só mostrado como referência, nunca perdido: se o admin
  // não mexer nos campos de endereço, o texto antigo continua intacto (ver
  // montarEnderecoCliente em app/clientes/actions.ts). Vale pra PF e PJ —
  // "Sede" da PJ passou a usar o mesmo formato estruturado (19/08/2026).
  const mostrarEnderecoAntigo = !c?.rua && !!c?.endereco;

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

  // Código do banco vem automaticamente ao escolher o Banco — antes era um
  // campo de texto solto, sem relação nenhuma com o banco selecionado, e
  // dava pra ficar com código e banco combinando errado.
  const [bancoId, setBancoId] = useState(c?.banco_id ?? "");
  const [codigoBanco, setCodigoBanco] = useState(c?.codigo_banco ?? "");

  function selecionarBanco(id: string) {
    setBancoId(id);
    const banco = bancos.find((b) => b.id === id);
    if (banco?.codigo) setCodigoBanco(banco.codigo);
  }

  // Parceiro responsável → Loja: ao escolher o parceiro, a loja dele já
  // cadastrada em Parceiro é puxada automaticamente (pedido do usuário,
  // 19/08/2026 — exemplo dado: selecionar "Jota Silvestre..." já preenche
  // "Porto Velho" sozinho). Continua editável manualmente depois — só
  // preenche quando o parceiro escolhido tem loja cadastrada.
  const [parceiroId, setParceiroId] = useState(c?.parceiro_id ?? "");
  const [lojaId, setLojaId] = useState(c?.loja_id ?? "");

  function selecionarParceiro(id: string) {
    setParceiroId(id);
    const parceiro = parceiros.find((p) => p.id === id);
    if (parceiro?.loja_id) setLojaId(parceiro.loja_id);
  }

  if (c && !modoEdicao) {
    return (
      <div className="flex flex-col gap-5">
        <Ficha
          cliente={c}
          lojas={lojas}
          bancos={bancos}
          parceiros={parceiros}
          estados={estados}
          cidades={cidades}
          onEditar={() => setModoEdicao(true)}
        />
        {ehPessoaJuridica && adicionarSocioAction && removerSocioAction && (
          <SocioForm
            pjClienteId={c.id}
            sociosAtuais={sociosAtuais ?? []}
            clientesPfDisponiveis={clientesPfDisponiveis ?? []}
            adicionarAction={adicionarSocioAction}
            removerAction={removerSocioAction}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-5">
        {c && <input type="hidden" name="clienteId" value={c.id} />}
        {embutido && <input type="hidden" name="_embed" value="1" />}

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Identificação</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Tipo de cliente *</label>
              {c ? (
                <input className={CAMPO} value={c.tipo_cliente} disabled />
              ) : (
                <select
                  className={CAMPO}
                  name="tipo_cliente"
                  value={tipoCliente}
                  onChange={(e) => setTipoCliente(e.target.value)}
                  required
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
              )}
              {c && <input type="hidden" name="tipo_cliente" value={c.tipo_cliente} />}
            </div>
            <div>
              <label className={LABEL}>{ehPessoaJuridica ? "Razão social *" : "Nome completo *"}</label>
              {c ? (
                <input className={CAMPO} value={c.nome} disabled />
              ) : (
                <input
                  className={CAMPO + " capitalize"}
                  name="nome"
                  required
                  disabled={!tipoCliente}
                  placeholder={ehPessoaJuridica ? "Razão social" : "Nome completo"}
                />
              )}
            </div>
            {!tipoCliente && !c && (
              <p className="text-[11px] text-gray-400 md:col-span-2 -mt-2">
                Escolha Pessoa Física ou Pessoa Jurídica para liberar o restante do cadastro.
              </p>
            )}
            {ehPessoaFisica && (
              <div>
                <label className={LABEL}>CPF *</label>
                <input
                  className={CAMPO}
                  name="cpf"
                  placeholder="000.000.000-00"
                  value={docTexto}
                  required
                  onChange={(e) => {
                    setDocTexto(formatCpf(e.target.value.replace(/\D/g, "")) || e.target.value);
                    setDocErro(null);
                  }}
                  onBlur={(e) => setDocErro(e.target.value ? validarCpfCnpj(e.target.value) : null)}
                />
                {docErro && <p className="text-[11px] text-red-600 mt-1">{docErro}</p>}
              </div>
            )}
            {ehPessoaJuridica && (
              <div>
                <label className={LABEL}>CNPJ</label>
                <input
                  className={CAMPO}
                  name="cnpj"
                  placeholder="00.000.000/0000-00"
                  value={docTexto}
                  required
                  onChange={(e) => {
                    setDocTexto(formatCnpj(e.target.value.replace(/\D/g, "")) || e.target.value);
                    setDocErro(null);
                  }}
                  onBlur={(e) => setDocErro(e.target.value ? validarCpfCnpj(e.target.value) : null)}
                />
                {docErro && <p className="text-[11px] text-red-600 mt-1">{docErro}</p>}
              </div>
            )}
            {ehPessoaFisica && (
              <>
                <div>
                  <label className={LABEL}>RG</label>
                  <input className={CAMPO} name="rg" defaultValue={c?.rg ?? ""} />
                </div>
                <div>
                  <label className={LABEL}>Expedição</label>
                  <input className={CAMPO} name="expedicao" defaultValue={c?.expedicao ?? ""} />
                </div>
                <div>
                  <label className={LABEL}>Sexo *</label>
                  <select className={CAMPO} name="sexo" defaultValue={c?.sexo ?? ""} required>
                    <option value="">Selecione...</option>
                    {SEXO_OPCOES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Estado civil</label>
                  <select
                    className={CAMPO + " capitalize"}
                    name="estado_civil"
                    value={estadoCivil}
                    onChange={(e) => setEstadoCivil(e.target.value)}
                  >
                    <option value="">—</option>
                    {ESTADOS_CIVIS.map((e) => (
                      <option key={e} value={e} className="capitalize">
                        {e}
                      </option>
                    ))}
                  </select>
                </div>
                {pedeUniaoEstavel && (
                  <div>
                    <label className={LABEL}>Convive em união estável?</label>
                    <select
                      className={CAMPO}
                      name="uniao_estavel"
                      value={uniaoEstavel}
                      onChange={(e) => setUniaoEstavel(e.target.value)}
                    >
                      <option value="">Não perguntado ainda</option>
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
                    </select>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Precisa constar na qualificação de contratos, mesmo sem mudar o estado civil formal.
                    </p>
                  </div>
                )}
                <div>
                  <label className={LABEL}>Data de nascimento</label>
                  <input
                    type="date"
                    className={CAMPO}
                    name="data_nascimento"
                    defaultValue={inputDate(c?.data_nascimento ?? null)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Nome da mãe</label>
                  <input className={CAMPO} name="nome_mae" defaultValue={c?.nome_mae ?? ""} />
                </div>
                <div>
                  <label className={LABEL}>Nome do pai</label>
                  <input className={CAMPO} name="nome_pai" defaultValue={c?.nome_pai ?? ""} />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Contato</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Telefone *</label>
              <input
                className={CAMPO}
                name="telefone"
                placeholder="(69) 99999-9999"
                defaultValue={c?.telefone ? formatTelefone(c.telefone) : ""}
                required
              />
            </div>
            <div>
              <label className={LABEL}>E-mail</label>
              <input className={CAMPO} type="email" name="email" defaultValue={c?.email ?? ""} />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">{ehPessoaJuridica ? "Sede" : "Endereço"}</div>
          <div className="grid md:grid-cols-2 gap-3">
            {mostrarEnderecoAntigo && (
              <p className="text-[11px] text-gray-400 md:col-span-2">
                Endereço atual (cadastro antigo, formato livre): {c?.endereco}. Preencha os campos abaixo para
                atualizar para o formato dividido.
              </p>
            )}
            <div>
              <label className={LABEL}>CEP</label>
              <input
                className={CAMPO}
                name="cep"
                placeholder="76800-000"
                value={cep}
                onChange={(e) => setCep(formatCep(e.target.value))}
                onBlur={aoSairDoCep}
              />
              {buscandoCep && <p className="text-[11px] text-gray-400 mt-1">Buscando endereço pelo CEP...</p>}
              {cepAvisoCidade && <p className="text-[11px] text-amber-600 mt-1">{cepAvisoCidade}</p>}
            </div>
            <div>
              <label className={LABEL}>Logradouro</label>
              <input className={CAMPO} name="rua" value={rua} onChange={(e) => setRua(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Número predial</label>
              <input className={CAMPO} name="n_predial" defaultValue={c?.n_predial ?? ""} />
            </div>
            <div>
              <label className={LABEL}>Complemento</label>
              <input className={CAMPO} name="complemento" defaultValue={c?.complemento ?? ""} />
            </div>
            <div>
              <label className={LABEL}>Bairro</label>
              <input className={CAMPO} name="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
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
                {cidadesDoEstado.map((cid) => (
                  <option key={cid.id} value={cid.id}>
                    {cid.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {ehPessoaFisica && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800 mb-3">Profissional</div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Profissão</label>
                <input className={CAMPO} name="profissao" defaultValue={c?.profissao ?? ""} />
              </div>
              <div>
                <label className={LABEL}>Categoria de profissão</label>
                <select className={CAMPO} name="cat_profissao" defaultValue={c?.cat_profissao ?? ""}>
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
                <input className={CAMPO} name="tipo_servidor" defaultValue={c?.tipo_servidor ?? ""} />
              </div>
              <div>
                <label className={LABEL}>Renda bruta (R$)</label>
                <input
                  className={CAMPO}
                  name="renda_bruta"
                  placeholder="2.500,00"
                  defaultValue={formatValorEditavel(c?.renda_bruta)}
                />
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Vínculo</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Parceiro responsável</label>
              <select
                className={CAMPO}
                name="parceiro_id"
                value={parceiroId}
                onChange={(e) => selecionarParceiro(e.target.value)}
              >
                <option value="">—</option>
                {parceiros.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Loja *</label>
              <select
                className={CAMPO}
                name="loja_id"
                value={lojaId}
                onChange={(e) => setLojaId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Selecione...
                </option>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Preenchida automaticamente ao escolher o parceiro (conforme o cadastro dele) — pode trocar manualmente
                se precisar.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className={LABEL}>Observação</label>
              <textarea className={CAMPO + " min-h-20"} name="observacao" defaultValue={c?.observacao ?? ""} />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Dados bancários</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Banco</label>
              <select
                className={CAMPO}
                name="banco_id"
                value={bancoId}
                onChange={(e) => selecionarBanco(e.target.value)}
              >
                <option value="">—</option>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
              {!c?.banco_id && c?.codigo_banco && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Código {c.codigo_banco} importado da planilha, ainda não vinculado a um banco da lista —
                  selecione acima.
                </p>
              )}
            </div>
            <div>
              <label className={LABEL}>Código do banco</label>
              <input
                className={CAMPO}
                name="codigo_banco"
                value={codigoBanco}
                onChange={(e) => setCodigoBanco(e.target.value)}
                placeholder="Preenchido ao escolher o banco"
              />
            </div>
            <div>
              <label className={LABEL}>Agência</label>
              <input className={CAMPO} name="agencia" defaultValue={c?.agencia ?? ""} />
            </div>
            <div>
              <label className={LABEL}>Conta</label>
              <input className={CAMPO} name="conta" defaultValue={c?.conta ?? ""} />
            </div>
            <div>
              <label className={LABEL}>Tipo de conta</label>
              <select className={CAMPO} name="tipo_conta" defaultValue={c?.tipo_conta ?? ""}>
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
              <select className={CAMPO} name="tipo_pix" defaultValue={c?.tipo_pix ?? ""}>
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
              <input className={CAMPO} name="pix" defaultValue={c?.pix ?? ""} />
            </div>
          </div>
        </div>

        {ehPessoaJuridica && !c && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800 mb-1">Sócios</div>
            <p className="text-xs text-gray-400 mb-3">
              Opcional aqui — também dá pra adicionar depois de cadastrar. O primeiro da lista assina como
              representante legal da empresa.
            </p>

            <input type="hidden" name="socios_pendentes_json" value={JSON.stringify(sociosPendentes)} />

            {sociosPendentes.length > 0 && (
              <div className="flex flex-col gap-1 mb-3">
                {sociosPendentes.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5"
                  >
                    <span className="text-gray-700">
                      {i === 0 && (
                        <span className="text-[10px] uppercase text-primary font-bold mr-1">Rep. legal</span>
                      )}
                      {s.nome}
                      {s.cpf && <span className="text-gray-400"> — {s.cpf}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => removerSocioPendente(i)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      remover
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
              <div className="flex gap-3 text-xs mb-1">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    checked={modoSocioPendente === "existente"}
                    onChange={() => setModoSocioPendente("existente")}
                  />
                  Cliente já cadastrado
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    checked={modoSocioPendente === "novo"}
                    onChange={() => setModoSocioPendente("novo")}
                  />
                  Cadastrar novo
                </label>
              </div>

              {modoSocioPendente === "existente" ? (
                <div className="relative">
                  <input
                    className={CAMPO}
                    placeholder="Digite para buscar cliente Pessoa Física..."
                    value={socioPendenteSelecionado ? socioPendenteSelecionado.nome : buscaSocioPendente}
                    onChange={(e) => {
                      setSocioPendenteSelecionado(null);
                      setBuscaSocioPendente(e.target.value);
                      setListaSocioPendenteAberta(true);
                    }}
                    onFocus={() => setListaSocioPendenteAberta(true)}
                    onBlur={() => setTimeout(() => setListaSocioPendenteAberta(false), 150)}
                  />
                  {listaSocioPendenteAberta && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                      {sociosDisponiveisFiltrados.length === 0 && (
                        <p className="text-xs text-gray-400 p-3">Nenhum cliente encontrado.</p>
                      )}
                      {sociosDisponiveisFiltrados.map((cli) => (
                        <button
                          key={cli.id}
                          type="button"
                          onMouseDown={() => {
                            setSocioPendenteSelecionado(cli);
                            setListaSocioPendenteAberta(false);
                          }}
                          className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                        >
                          {cli.nome}
                          {cli.cpf ? ` — ${formatCpf(cli.cpf)}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL}>Nome completo</label>
                    <input
                      className={CAMPO}
                      value={socioPendenteNome}
                      onChange={(e) => setSocioPendenteNome(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>CPF</label>
                    <input
                      className={CAMPO}
                      placeholder="000.000.000-00"
                      value={socioPendenteCpf}
                      onChange={(e) => setSocioPendenteCpf(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Telefone</label>
                    <input
                      className={CAMPO}
                      placeholder="(69) 99999-9999"
                      value={socioPendenteTelefone}
                      onChange={(e) => setSocioPendenteTelefone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>E-mail</label>
                    <input
                      className={CAMPO}
                      type="email"
                      value={socioPendenteEmail}
                      onChange={(e) => setSocioPendenteEmail(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={adicionarSocioPendente}
                  className="text-xs border border-primary text-primary rounded-lg px-3 py-1.5 font-semibold hover:bg-primary/5"
                >
                  + Adicionar à lista
                </button>
              </div>
            </div>
          </div>
        )}

        {resultado?.erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
            {resultado.erro} — o que você digitou continua aí em cima, é só corrigir e salvar de novo.
            {resultado.duplicado && (
              <label className="flex items-center gap-2 mt-2 text-red-800 font-medium cursor-pointer">
                <input type="checkbox" name="criar_mesmo_assim" />
                Já conferi, não é a mesma pessoa — criar mesmo assim
              </label>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {c && (
            <button
              type="button"
              onClick={() => setModoEdicao(false)}
              className="border border-gray-300 text-gray-700 rounded-lg px-5 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
          <button type="submit" className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90">
            {c ? "Salvar alterações" : "Cadastrar cliente"}
          </button>
        </div>
      </form>

      {ehPessoaJuridica && c && adicionarSocioAction && removerSocioAction && (
        <SocioForm
          pjClienteId={c.id}
          sociosAtuais={sociosAtuais ?? []}
          clientesPfDisponiveis={clientesPfDisponiveis ?? []}
          adicionarAction={adicionarSocioAction}
          removerAction={removerSocioAction}
        />
      )}
    </div>
  );
}
