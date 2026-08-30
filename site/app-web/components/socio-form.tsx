"use client";

import { useActionState, useMemo, useState } from "react";
import { formatCpf, formatTelefone, formatValorEditavel } from "@/lib/format";
import { BotaoSubmit } from "@/components/botao-submit";
import {
  ESTADOS_CIVIS,
  ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL,
  TIPOS_CONTA,
  TIPOS_PIX,
  SEXO_OPCOES,
  CAT_PROFISSAO_OPCOES
} from "@/lib/clientes/opcoes";
import { buscarCep, UF_PARA_ESTADO } from "@/lib/enderecos";

type ClientePF = { id: string; nome: string; cpf: string | null };
type SocioVinculado = { vinculoId: string; id: string; nome: string; cpf: string | null };
type Banco = { id: string; nome: string; codigo: string | null };
type EstadoOpcao = { id: string; nome: string };
type CidadeOpcao = { id: string; nome: string; estado_id: string };

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

function formatCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// Widget de sócios no cadastro de Pessoa Jurídica. Só aparece depois que a
// PJ já existe (precisa do id pra gravar o vínculo em clientes_socios).
// "Adicionar sócio" nunca guarda só um nome solto — sempre cria (ou
// reaproveita, se já existir pelo CPF) um cliente de verdade em Pessoa
// Física, porque esse sócio pode um dia virar cliente PF nosso por conta
// própria. O primeiro da lista (ordem 0) é quem assina como representante
// legal da empresa nos contratos.
//
// Cadastro "novo sócio" completo (19/08/2026 — pedido do usuário: "quando
// aperta em cadastrar novo o formulário é superficial, precisa ser
// completo") — mesmo conjunto de campos do cadastro de cliente PF
// principal (RG, filiação, endereço com CEP automático, profissional,
// dados bancários), todos opcionais além de Nome — dá pra completar depois
// abrindo o cadastro do sócio direto em Clientes.
export function SocioForm({
  pjClienteId,
  sociosAtuais,
  clientesPfDisponiveis,
  estados,
  cidades,
  bancos,
  adicionarAction,
  removerAction
}: {
  pjClienteId: string;
  sociosAtuais: SocioVinculado[];
  clientesPfDisponiveis: ClientePF[];
  estados: EstadoOpcao[];
  cidades: CidadeOpcao[];
  bancos: Banco[];
  adicionarAction: (prevState: unknown, formData: FormData) => Promise<{ erro: string } | { ok: true } | undefined>;
  removerAction: (formData: FormData) => Promise<void>;
}) {
  const [resultado, formAction] = useActionState(adicionarAction, undefined);
  const [modo, setModo] = useState<"existente" | "novo">("existente");
  const [busca, setBusca] = useState("");
  const [listaAberta, setListaAberta] = useState(false);
  const [selecionado, setSelecionado] = useState<ClientePF | null>(null);
  const [mostrarCompleto, setMostrarCompleto] = useState(false);

  const jaVinculadosIds = useMemo(() => new Set(sociosAtuais.map((s) => s.id)), [sociosAtuais]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const disponiveis = clientesPfDisponiveis.filter((c) => !jaVinculadosIds.has(c.id));
    if (!t) return disponiveis.slice(0, 30);
    return disponiveis.filter((c) => c.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [busca, clientesPfDisponiveis, jaVinculadosIds]);

  // Estado civil / união estável — mesma regra do cadastro de cliente PF
  // (ver components/cliente-form.tsx).
  const [estadoCivil, setEstadoCivil] = useState("");
  const [uniaoEstavel, setUniaoEstavel] = useState("");
  const pedeUniaoEstavel = ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(estadoCivil);

  // Endereço com CEP automático — mesmo padrão do cadastro de cliente PF.
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [bairro, setBairro] = useState("");
  const [estadoId, setEstadoId] = useState("");
  const [cidadeId, setCidadeId] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepAvisoCidade, setCepAvisoCidade] = useState<string | null>(null);
  const cidadesDoEstado = useMemo(() => cidades.filter((cid) => cid.estado_id === estadoId), [cidades, estadoId]);

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

  // Banco — código preenchido automaticamente ao escolher, mesmo padrão do
  // cadastro de cliente PF.
  const [bancoId, setBancoId] = useState("");
  const [codigoBanco, setCodigoBanco] = useState("");
  function selecionarBanco(id: string) {
    setBancoId(id);
    const banco = bancos.find((b) => b.id === id);
    if (banco?.codigo) setCodigoBanco(banco.codigo);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-bold text-gray-800 mb-3">Sócios</div>

      {sociosAtuais.length > 0 ? (
        <div className="flex flex-col gap-1 mb-4">
          {sociosAtuais.map((s, i) => (
            <div
              key={s.vinculoId}
              className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5"
            >
              <span className="text-gray-700">
                {i === 0 && <span className="text-[10px] uppercase text-primary font-bold mr-1">Rep. legal</span>}
                <a href={`/clientes/${s.id}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  {s.nome}
                </a>
                {s.cpf && <span className="text-gray-400"> — {formatCpf(s.cpf)}</span>}
              </span>
              <form action={removerAction}>
                <input type="hidden" name="vinculo_id" value={s.vinculoId} />
                <input type="hidden" name="pj_cliente_id" value={pjClienteId} />
                <BotaoSubmit variante="secundario" carregandoTexto="Removendo..." className="text-gray-400 hover:text-red-600">
                  remover
                </BotaoSubmit>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-4">Nenhum sócio cadastrado ainda.</p>
      )}

      <form action={formAction} className="border-t border-gray-100 pt-3 flex flex-col gap-2">
        <input type="hidden" name="pj_cliente_id" value={pjClienteId} />
        <input type="hidden" name="modo_socio" value={modo} />

        <div className="flex gap-3 text-xs mb-1">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" checked={modo === "existente"} onChange={() => setModo("existente")} />
            Cliente já cadastrado
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" checked={modo === "novo"} onChange={() => setModo("novo")} />
            Cadastrar novo
          </label>
        </div>

        {modo === "existente" ? (
          <div className="relative">
            {selecionado && <input type="hidden" name="socio_cliente_id" value={selecionado.id} />}
            <input
              className={CAMPO}
              placeholder="Digite para buscar cliente Pessoa Física..."
              value={selecionado ? selecionado.nome : busca}
              onChange={(e) => {
                setSelecionado(null);
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
                    onMouseDown={() => {
                      setSelecionado(c);
                      setListaAberta(false);
                    }}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {c.nome}
                    {c.cpf ? ` — ${formatCpf(c.cpf)}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid md:grid-cols-2 gap-2">
              <div>
                <label className={LABEL}>Nome completo *</label>
                <input className={CAMPO} name="socio_nome" required />
              </div>
              <div>
                <label className={LABEL}>CPF</label>
                <input className={CAMPO} name="socio_cpf" placeholder="000.000.000-00" />
              </div>
              <div>
                <label className={LABEL}>Telefone</label>
                <input className={CAMPO} name="socio_telefone" placeholder="(69) 99999-9999" />
              </div>
              <div>
                <label className={LABEL}>E-mail</label>
                <input className={CAMPO} type="email" name="socio_email" />
              </div>
            </div>

            {!mostrarCompleto ? (
              <button
                type="button"
                onClick={() => setMostrarCompleto(true)}
                className="text-[11px] text-primary font-semibold self-start hover:underline"
              >
                + Completar cadastro (RG, endereço, profissional, dados bancários)
              </button>
            ) : (
              <div className="flex flex-col gap-3 border-t border-gray-100 pt-3">
                <div className="grid md:grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL}>RG</label>
                    <input className={CAMPO} name="socio_rg" />
                  </div>
                  <div>
                    <label className={LABEL}>Expedição</label>
                    <input className={CAMPO} name="socio_expedicao" />
                  </div>
                  <div>
                    <label className={LABEL}>Sexo</label>
                    <select className={CAMPO} name="socio_sexo" defaultValue="">
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
                    <select
                      className={CAMPO + " capitalize"}
                      name="socio_estado_civil"
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
                        name="socio_uniao_estavel"
                        value={uniaoEstavel}
                        onChange={(e) => setUniaoEstavel(e.target.value)}
                      >
                        <option value="">Não perguntado ainda</option>
                        <option value="false">Não</option>
                        <option value="true">Sim</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className={LABEL}>Data de nascimento</label>
                    <input type="date" className={CAMPO} name="socio_data_nascimento" />
                  </div>
                  <div>
                    <label className={LABEL}>Nome da mãe</label>
                    <input className={CAMPO} name="socio_nome_mae" />
                  </div>
                  <div>
                    <label className={LABEL}>Nome do pai</label>
                    <input className={CAMPO} name="socio_nome_pai" />
                  </div>
                </div>

                <div className="text-xs font-semibold text-gray-600">Endereço</div>
                <div className="grid md:grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL}>CEP</label>
                    <input
                      className={CAMPO}
                      name="socio_cep"
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
                    <input className={CAMPO} name="socio_rua" value={rua} onChange={(e) => setRua(e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>Número predial</label>
                    <input className={CAMPO} name="socio_n_predial" />
                  </div>
                  <div>
                    <label className={LABEL}>Complemento</label>
                    <input className={CAMPO} name="socio_complemento" />
                  </div>
                  <div>
                    <label className={LABEL}>Bairro</label>
                    <input
                      className={CAMPO}
                      name="socio_bairro"
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Estado</label>
                    <select
                      className={CAMPO}
                      name="socio_estado_id"
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
                    <select
                      className={CAMPO}
                      name="socio_cidade_id"
                      value={cidadeId}
                      onChange={(e) => setCidadeId(e.target.value)}
                    >
                      <option value="">—</option>
                      {cidadesDoEstado.map((cid) => (
                        <option key={cid.id} value={cid.id}>
                          {cid.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-xs font-semibold text-gray-600">Profissional</div>
                <div className="grid md:grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL}>Profissão</label>
                    <input className={CAMPO} name="socio_profissao" />
                  </div>
                  <div>
                    <label className={LABEL}>Categoria de profissão</label>
                    <select className={CAMPO} name="socio_cat_profissao" defaultValue="">
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
                    <input className={CAMPO} name="socio_tipo_servidor" />
                  </div>
                  <div>
                    <label className={LABEL}>Renda bruta (R$)</label>
                    <input className={CAMPO} name="socio_renda_bruta" placeholder="2.500,00" />
                  </div>
                </div>

                <div className="text-xs font-semibold text-gray-600">Dados bancários</div>
                <div className="grid md:grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL}>Banco</label>
                    <select className={CAMPO} name="socio_banco_id" value={bancoId} onChange={(e) => selecionarBanco(e.target.value)}>
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
                      name="socio_codigo_banco"
                      value={codigoBanco}
                      onChange={(e) => setCodigoBanco(e.target.value)}
                      placeholder="Preenchido ao escolher o banco"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Agência</label>
                    <input className={CAMPO} name="socio_agencia" />
                  </div>
                  <div>
                    <label className={LABEL}>Conta</label>
                    <input className={CAMPO} name="socio_conta" />
                  </div>
                  <div>
                    <label className={LABEL}>Tipo de conta</label>
                    <select className={CAMPO} name="socio_tipo_conta" defaultValue="">
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
                    <select className={CAMPO} name="socio_tipo_pix" defaultValue="">
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
                    <input className={CAMPO} name="socio_pix" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {resultado && "erro" in resultado && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
            {resultado.erro}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="text-xs border border-primary text-primary rounded-lg px-3 py-1.5 font-semibold hover:bg-primary/5"
          >
            + Adicionar sócio
          </button>
        </div>
      </form>
    </div>
  );
}
