"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import {
  TODAS_FUNCOES,
  STATUS_FUNCAO,
  ESTADOS_CIVIS,
  ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL,
  TIPOS_CONTA,
  TIPOS_PIX
} from "@/lib/parceiros/opcoes";
import { formatCpf, formatTelefone, formatPercentual, formatMoeda, formatDataCalendario } from "@/lib/format";
import { buscarCep, UF_PARA_ESTADO } from "@/lib/enderecos";

// % Proprietário / % Interessado (renomeado de "% compra"/"% venda" em
// 16/08/2026 — pedido do usuário: "na verdade deveria ser interessado e
// proprietário porque serve para compra e venda e locação", não só compra).
// Serve como valor padrão pré-preenchido quando esse corretor é escolhido
// numa transação nova (ver components/transacao-form.tsx) — o corretor não
// edita isso aqui sozinho no sentido de "por transação", só o cadastro base.
const FUNCOES_COM_COMISSIONAMENTO = ["Corretor", "Corretor Estagiário"];

type Loja = { id: string; nome: string };
type Banco = { id: string; nome: string; codigo: string | null };
type EstadoOpcao = { id: string; nome: string };
type CidadeOpcao = { id: string; nome: string; estado_id: string };

function formatCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

type ParceiroExistente = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  empresa: string | null;
  funcao: string;
  loja_id: string | null;
  status_funcao: string;
  data_nascimento: Date | null;
  identidade: string | null;
  expedicao_estado: string | null;
  estado_civil: string | null;
  uniao_estavel: boolean | null;
  creci: string | null;
  cep: string | null;
  rua: string | null;
  n_predial: string | null;
  complemento: string | null;
  bairro: string | null;
  estado_id: string | null;
  cidade_id: string | null;
  endereco: string | null;
  data_entrada: Date | null;
  data_saida: Date | null;
  obs_funcao: string | null;
  fee: unknown;
  porc_proprietario: unknown;
  porc_interessado: unknown;
  dia_fee: number | null;
  banco_id: string | null;
  codigo_banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  tipo_pix: string | null;
  pix: string | null;
  link_drive: string | null;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function campoTexto(nome: string) {
  return "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary " + nome;
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const CAMPO_DESABILITADO = "text-xs border border-gray-200 rounded-lg px-3 py-1.5 w-full bg-gray-50 text-gray-500";
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
// visualização, somente leitura. Vazio mostra "—" em vez de sumir a linha,
// pra manter o layout em pares alinhado.
function Linha({ label, valor }: { label: string; valor: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="text-xs text-gray-800 font-medium mt-0.5 break-words">{valor ?? "—"}</div>
    </div>
  );
}

function Ficha({ parceiro, onEditar }: { parceiro: ParceiroExistente; onEditar: () => void }) {
  const p = parceiro;
  const mostrarComissionamento = FUNCOES_COM_COMISSIONAMENTO.includes(p.funcao);
  const mostrarDataSaida = p.status_funcao === "Inativo" && p.data_saida;
  const pedeUniaoEstavel = p.estado_civil ? ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(p.estado_civil) : false;

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
          <Linha label="Nome completo" valor={p.nome} />
          <Linha label="CPF" valor={p.cpf ? formatCpf(p.cpf) : null} />
          <Linha label="Função" valor={p.funcao} />
          <Linha label="Status" valor={p.status_funcao} />
          <Linha label="CRECI" valor={p.creci} />
          <Linha label="Estado civil" valor={p.estado_civil} />
          {pedeUniaoEstavel && (
            <Linha
              label="União estável"
              valor={p.uniao_estavel === true ? "Sim" : p.uniao_estavel === false ? "Não" : "Não perguntado ainda"}
            />
          )}
          <Linha label="Data de nascimento" valor={formatDataCalendario(p.data_nascimento)} />
          <Linha label="Identidade (RG)" valor={p.identidade} />
          <Linha label="Estado de expedição" valor={p.expedicao_estado} />
          <Linha label="Data de entrada" valor={formatDataCalendario(p.data_entrada)} />
          {mostrarDataSaida && <Linha label="Data de saída" valor={formatDataCalendario(p.data_saida)} />}
        </div>
      </Cartao>

      <Cartao titulo="Contato">
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Telefone" valor={p.telefone ? formatTelefone(p.telefone) : null} />
          <Linha label="E-mail" valor={p.email} />
          <Linha label="Empresa" valor={p.empresa} />
          <div className="md:col-span-2">
            <Linha label="Endereço" valor={p.endereco} />
          </div>
          <div className="md:col-span-2">
            <Linha
              label="Link da pasta do Drive"
              valor={
                p.link_drive ? (
                  <a href={p.link_drive} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    abrir
                  </a>
                ) : null
              }
            />
          </div>
        </div>
      </Cartao>

      {mostrarComissionamento && (
        <Cartao titulo="Comissionamento">
          <div className="grid md:grid-cols-4 gap-3">
            <Linha label="Fee (R$)" valor={formatMoeda(p.fee)} />
            <Linha label="% Proprietário" valor={p.porc_proprietario != null ? formatPercentual(p.porc_proprietario) : null} />
            <Linha label="% Interessado" valor={p.porc_interessado != null ? formatPercentual(p.porc_interessado) : null} />
            <Linha label="Dia do fee" valor={p.dia_fee} />
          </div>
        </Cartao>
      )}

      <Cartao titulo="Dados bancários">
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Código do banco" valor={p.codigo_banco} />
          <Linha label="Agência" valor={p.agencia} />
          <Linha label="Conta" valor={p.conta} />
          <Linha label="Tipo de conta" valor={p.tipo_conta} />
          <Linha label="Tipo de PIX" valor={p.tipo_pix} />
          <Linha label="Chave PIX" valor={p.pix} />
        </div>
      </Cartao>

      <Cartao titulo="Observações">
        <p className="text-xs text-gray-700 whitespace-pre-wrap">{p.obs_funcao || "—"}</p>
      </Cartao>
    </div>
  );
}

export function ParceiroForm({
  parceiro,
  lojas,
  bancos,
  estados,
  cidades,
  action
}: {
  parceiro: ParceiroExistente | null;
  lojas: Loja[];
  bancos: Banco[];
  estados: EstadoOpcao[];
  cidades: CidadeOpcao[];
  action: (prevState: unknown, formData: FormData) => Promise<{ erro: string; duplicado?: boolean } | undefined | void>;
}) {
  const p = parceiro;
  const [resultado, formAction] = useActionState(action, undefined);
  // Cadastro novo já nasce em modo de edição (não tem ficha pra mostrar
  // ainda). Cadastro existente abre em modo visualização — só entra em
  // edição clicando em "Editar" (mesmo padrão do AppSheet: side-by-side,
  // sem campo nenhum editável até isso acontecer).
  const [modoEdicao, setModoEdicao] = useState(!p);
  const [statusFuncao, setStatusFuncao] = useState(p?.status_funcao ?? "Ativo");
  const [estadoCivil, setEstadoCivil] = useState(p?.estado_civil ?? "");
  const [uniaoEstavel, setUniaoEstavel] = useState(
    p?.uniao_estavel === true ? "true" : p?.uniao_estavel === false ? "false" : ""
  );
  const pedeUniaoEstavel = ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(estadoCivil);

  // Endereço dividido em CEP/logradouro/número/complemento/bairro/cidade/
  // estado, com busca automática por CEP (ViaCEP) — complemento do mesmo
  // pente-fino já aplicado em Clientes (ver components/cliente-form.tsx),
  // aqui só na seção Contato, sem mexer nas demais abas próprias do parceiro
  // (Identificação, Comissionamento, Dados bancários, Observações).
  const [cep, setCep] = useState(p?.cep ? formatCep(p.cep) : "");
  const [rua, setRua] = useState(p?.rua ?? "");
  const [bairro, setBairro] = useState(p?.bairro ?? "");
  const [estadoId, setEstadoId] = useState(p?.estado_id ?? "");
  const [cidadeId, setCidadeId] = useState(p?.cidade_id ?? "");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepAvisoCidade, setCepAvisoCidade] = useState<string | null>(null);

  // Código do banco vem automaticamente ao escolher o Banco — mesmo fix já
  // aplicado em cliente-form.tsx (era um campo de texto solto aqui, sem
  // relação nenhuma com o banco selecionado, e dava pra ficar com código e
  // banco combinando errado).
  const [bancoId, setBancoId] = useState(p?.banco_id ?? "");
  const [codigoBanco, setCodigoBanco] = useState(p?.codigo_banco ?? "");

  function selecionarBanco(id: string) {
    setBancoId(id);
    const banco = bancos.find((b) => b.id === id);
    if (banco?.codigo) setCodigoBanco(banco.codigo);
  }

  const cidadesDoEstado = useMemo(() => cidades.filter((cid) => cid.estado_id === estadoId), [cidades, estadoId]);

  // Endereço antigo (cadastro anterior a este pente-fino, sem os campos
  // divididos preenchidos) — mostrado só como referência, nunca perdido: se
  // o admin não mexer nos campos de endereço, o texto antigo continua
  // intacto (ver montarEnderecoParceiro em app/parceiros/actions.ts).
  const mostrarEnderecoAntigo = !p?.rua && !!p?.endereco;

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

  if (p && !modoEdicao) {
    return <Ficha parceiro={p} onEditar={() => setModoEdicao(true)} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {p && <input type="hidden" name="parceiroId" value={p.id} />}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Identificação</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Nome completo</label>
            {p ? (
              <>
                <input className={CAMPO_DESABILITADO} value={p.nome} disabled />
                <p className="text-[11px] text-gray-400 mt-1">
                  Protegido — nome só muda via aprovação de acesso em Configurações.
                </p>
              </>
            ) : (
              <input className={CAMPO} name="nome" required placeholder="Nome completo" />
            )}
          </div>
          <div>
            <label className={LABEL}>CPF</label>
            <input
              className={CAMPO}
              name="cpf"
              placeholder="000.000.000-00"
              defaultValue={p?.cpf ? formatCpf(p.cpf) : ""}
            />
            {p && (
              <p className="text-[11px] text-gray-400 mt-1">
                Usado junto com o nome pra login no portal — mudar aqui muda o que este parceiro digita pra entrar.
              </p>
            )}
          </div>
          <div>
            <label className={LABEL}>Função</label>
            <select className={CAMPO} name="funcao" defaultValue={p?.funcao ?? ""} required>
              <option value="" disabled>
                Selecione...
              </option>
              {TODAS_FUNCOES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select
              className={CAMPO}
              name="status_funcao"
              value={statusFuncao}
              onChange={(e) => setStatusFuncao(e.target.value)}
            >
              {STATUS_FUNCAO.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Loja *</label>
            <select className={CAMPO} name="loja_id" defaultValue={p?.loja_id ?? ""} required>
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
            <label className={LABEL}>CRECI</label>
            <input className={CAMPO} name="creci" defaultValue={p?.creci ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Estado civil</label>
            <select
              className={CAMPO + " capitalize"}
              name="estado_civil"
              value={estadoCivil}
              onChange={(e) => {
                setEstadoCivil(e.target.value);
                if (!ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(e.target.value)) setUniaoEstavel("");
              }}
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
                Necessário para a qualificação correta em contratos (ex.: &quot;{estadoCivil.toLowerCase()} e declara
                {uniaoEstavel === "true" ? " " : " não "}
                conviver em união estável&quot;).
              </p>
            </div>
          )}
          <div>
            <label className={LABEL}>Data de nascimento</label>
            <input
              type="date"
              className={CAMPO}
              name="data_nascimento"
              defaultValue={inputDate(p?.data_nascimento ?? null)}
            />
          </div>
          <div>
            <label className={LABEL}>Identidade (RG)</label>
            <input className={CAMPO} name="identidade" defaultValue={p?.identidade ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Estado de expedição</label>
            <input className={CAMPO} name="expedicao_estado" defaultValue={p?.expedicao_estado ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Data de entrada</label>
            <input
              type="date"
              className={CAMPO}
              name="data_entrada"
              defaultValue={inputDate(p?.data_entrada ?? null)}
            />
          </div>
          {/* Só aparece quando Status = Inativo — continua no DOM (só
              visualmente escondida) nos outros status pra não perder o valor
              já salvo se o ADM passar o mouse/trocar o status sem querer
              antes de salvar. */}
          <div className={statusFuncao === "Inativo" ? "" : "hidden"}>
            <label className={LABEL}>Data de saída</label>
            <input
              type="date"
              className={CAMPO}
              name="data_saida"
              defaultValue={inputDate(p?.data_saida ?? null)}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Preenchida automaticamente com a data de hoje ao salvar com status Inativo — pode ajustar. A função
              muda sozinha pra Corretor Externo (ou Desligado, se não tiver CRECI) quando isso acontece.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Contato</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Telefone</label>
            <input
              className={CAMPO}
              name="telefone"
              placeholder="(69) 99999-9999"
              defaultValue={p?.telefone ? formatTelefone(p.telefone) : ""}
            />
          </div>
          <div>
            <label className={LABEL}>E-mail</label>
            <input className={CAMPO} type="email" name="email" defaultValue={p?.email ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Empresa</label>
            <input className={CAMPO} name="empresa" defaultValue={p?.empresa ?? ""} />
          </div>
          {mostrarEnderecoAntigo && (
            <p className="text-[11px] text-gray-400 md:col-span-2">
              Endereço atual (cadastro antigo, formato livre): {p?.endereco}. Preencha os campos abaixo para
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
            <input className={CAMPO} name="n_predial" defaultValue={p?.n_predial ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Complemento</label>
            <input className={CAMPO} name="complemento" defaultValue={p?.complemento ?? ""} />
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
          <div className="md:col-span-2">
            <label className={LABEL}>Link da pasta do Drive</label>
            <input
              className={campoTexto("")}
              name="link_drive"
              placeholder="https://drive.google.com/..."
              defaultValue={p?.link_drive ?? ""}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Documentos do parceiro ficam salvos no Drive, não no sistema — só o link.
            </p>
          </div>
        </div>
      </div>

      {(!p || FUNCOES_COM_COMISSIONAMENTO.includes(p.funcao)) && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Comissionamento</div>
          <p className="text-[11px] text-gray-400 mb-3 -mt-2">
            Visível apenas para Corretor e Corretor Estagiário. % Proprietário/% Interessado são a comissão padrão
            dele em qualquer negócio (Compra e Venda ou Locação) — servem só pra pré-preencher automaticamente
            quando o administrativo definir os corretores numa transação nova; continuam editáveis por transação.
          </p>
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <label className={LABEL}>Fee (R$)</label>
              <input className={CAMPO} name="fee" defaultValue={p?.fee != null ? String(p.fee) : ""} />
            </div>
            <div>
              <label className={LABEL}>% Proprietário</label>
              <input
                className={CAMPO}
                name="porc_proprietario"
                placeholder="Ex.: 22,5"
                defaultValue={p?.porc_proprietario != null ? formatPercentual(p.porc_proprietario) : ""}
              />
            </div>
            <div>
              <label className={LABEL}>% Interessado</label>
              <input
                className={CAMPO}
                name="porc_interessado"
                placeholder="Ex.: 22,5"
                defaultValue={p?.porc_interessado != null ? formatPercentual(p.porc_interessado) : ""}
              />
            </div>
            <div>
              <label className={LABEL}>Dia do fee</label>
              <input className={CAMPO} name="dia_fee" defaultValue={p?.dia_fee ?? ""} />
            </div>
          </div>
        </div>
      )}

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
            {!p?.banco_id && p?.codigo_banco && (
              <p className="text-[11px] text-gray-400 mt-1">
                Código {p.codigo_banco} importado da planilha, ainda não vinculado a um banco da lista —
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
            <input className={CAMPO} name="agencia" defaultValue={p?.agencia ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Conta</label>
            <input className={CAMPO} name="conta" defaultValue={p?.conta ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Tipo de conta</label>
            <select className={CAMPO} name="tipo_conta" defaultValue={p?.tipo_conta ?? ""}>
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
            <select className={CAMPO} name="tipo_pix" defaultValue={p?.tipo_pix ?? ""}>
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
            <input className={CAMPO} name="pix" defaultValue={p?.pix ?? ""} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Observações</div>
        <textarea
          className={CAMPO + " min-h-20"}
          name="obs_funcao"
          defaultValue={p?.obs_funcao ?? ""}
          placeholder="Observações sobre a função/contrato deste parceiro"
        />
      </div>

      {resultado?.erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
          {resultado.erro} — o que você digitou continua aí em cima, é só corrigir e salvar de novo.
          {resultado.duplicado && (
            <label className="flex items-center gap-2 mt-2 text-red-800 font-medium cursor-pointer">
              <input type="checkbox" name="cadastrar_mesmo_assim" />
              Já conferi, não é a mesma pessoa — cadastrar mesmo assim
            </label>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {p && (
          <button
            type="button"
            onClick={() => setModoEdicao(false)}
            className="border border-gray-300 text-gray-700 rounded-lg px-5 py-2 text-sm font-semibold hover:bg-gray-50"
          >
            Cancelar
          </button>
        )}
        <button type="submit" className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90">
          {p ? "Salvar alterações" : "Cadastrar parceiro"}
        </button>
      </div>
    </form>
  );
}
