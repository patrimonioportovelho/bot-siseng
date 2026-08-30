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
import { BotaoSubmit } from "@/components/botao-submit";
import { prepararUploadFotoParceiroAction } from "@/app/parceiros/actions";
import { supabaseBrowser, BUCKET_PARCEIROS_FOTOS } from "@/lib/supabase-browser";

// Só função "Corretor" (não Corretor Estagiário) entra no ranking de
// honorários do dashboard externo — pedido explícito do usuário 29/08/2026.
const FUNCAO_COM_FOTO_RANKING = "Corretor";

// Sempre recorta e redimensiona a foto pra exatamente 1080x1350 (retrato 4:5,
// formato "post" — trocado de 1080x1920/Story em 29/08/2026 a pedido do
// usuário, pra ficar do tamanho das outras partes/cartões do site) — mesma
// lógica de paraQuadrado1080 em components/evento-form.tsx, só que
// generalizada pra qualquer proporção alvo em vez de só quadrado. Recorte
// central "cover" (usa o maior retângulo 4:5 possível no meio da imagem, sem
// distorcer) e redesenha no tamanho final. Roda no navegador antes do upload.
async function paraRetrato1080x1350(arquivo: File): Promise<File> {
  const bitmap = await createImageBitmap(arquivo);
  const ALVO_LARGURA = 1080;
  const ALVO_ALTURA = 1350;
  const razaoAlvo = ALVO_LARGURA / ALVO_ALTURA;
  const razaoOrigem = bitmap.width / bitmap.height;

  let recorteLargura: number;
  let recorteAltura: number;
  if (razaoOrigem > razaoAlvo) {
    recorteAltura = bitmap.height;
    recorteLargura = recorteAltura * razaoAlvo;
  } else {
    recorteLargura = bitmap.width;
    recorteAltura = recorteLargura / razaoAlvo;
  }
  const origemX = (bitmap.width - recorteLargura) / 2;
  const origemY = (bitmap.height - recorteAltura) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = ALVO_LARGURA;
  canvas.height = ALVO_ALTURA;
  const ctx = canvas.getContext("2d");
  if (!ctx) return arquivo;
  ctx.drawImage(bitmap, origemX, origemY, recorteLargura, recorteAltura, 0, 0, ALVO_LARGURA, ALVO_ALTURA);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) return arquivo;

  const nomeBase = arquivo.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${nomeBase}.jpg`, { type: "image/jpeg" });
}

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
  foto_url: string | null;
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
        {/* Foto ao lado dos campos (não em cima), com o topo alinhado com
            Nome completo/CPF — padronizado em 30/08/2026 a pedido do
            usuário. Sem foto cadastrada, mostra um espaço reservado com
            avatar padrão em vez de simplesmente não aparecer nada, pra não
            "pular" o card quando a foto for adicionada depois. */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-20 aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
            {p.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.foto_url} alt={`Foto de ${p.nome}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" className="w-9 h-9 text-gray-300">
                  <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
                  <path
                    d="M4.5 19.5c1.2-3.4 4.2-5 7.5-5s6.3 1.6 7.5 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-3 flex-1">
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
  action,
  isAdm
}: {
  parceiro: ParceiroExistente | null;
  lojas: Loja[];
  bancos: Banco[];
  estados: EstadoOpcao[];
  cidades: CidadeOpcao[];
  action: (prevState: unknown, formData: FormData) => Promise<{ erro: string; duplicado?: boolean } | undefined | void>;
  // Foto do Corretor: só ADM pode subir/trocar/remover (pedido do usuário
  // 29/08/2026). Quem não é ADM nem vê o campo — a segunda trava fica no
  // servidor (ver atualizarParceiroAction em app/parceiros/actions.ts).
  isAdm: boolean;
}) {
  const p = parceiro;
  const [resultado, formAction] = useActionState(action, undefined);
  const podeEditarFoto = isAdm && (!p || p.funcao === FUNCAO_COM_FOTO_RANKING);
  const [fotoPreview, setFotoPreview] = useState<string | null>(p?.foto_url ?? null);
  const [fotoCaminho, setFotoCaminho] = useState("");
  const [removerFoto, setRemoverFoto] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState<string | null>(null);

  async function aoSelecionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErroFoto(null);
    setEnviandoFoto(true);
    try {
      const arquivoRecortado = await paraRetrato1080x1350(arquivo);
      const preparo = await prepararUploadFotoParceiroAction(arquivoRecortado.name);
      if (!preparo.ok) throw new Error(preparo.erro);
      const { error: erroUpload } = await supabaseBrowser()
        .storage.from(BUCKET_PARCEIROS_FOTOS)
        .uploadToSignedUrl(preparo.caminho, preparo.token, arquivoRecortado, { contentType: arquivoRecortado.type });
      if (erroUpload) throw new Error(`Falha ao enviar a foto: ${erroUpload.message}`);
      setFotoCaminho(preparo.caminho);
      setRemoverFoto(false);
      setFotoPreview(URL.createObjectURL(arquivoRecortado));
    } catch (erro) {
      setErroFoto(erro instanceof Error ? erro.message : "Falha ao enviar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  function removerFotoAtual() {
    setRemoverFoto(true);
    setFotoCaminho("");
    setFotoPreview(null);
  }
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

      {podeEditarFoto && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-1">Foto (ranking de honorários)</div>
          <p className="text-[11px] text-gray-400 mb-3">
            Visível apenas para função Corretor, e só o ADM pode subir/trocar/remover. Formato retrato,
            1080x1350 — recortada automaticamente ao escolher a imagem. Aparece no ranking de honorários do site
            público quando ele estiver entre os 3 que mais receberam honorário no mês.
          </p>
          <input type="hidden" name="foto_caminho" value={fotoCaminho} />
          <input type="hidden" name="remover_foto" value={removerFoto ? "on" : ""} />
          <div className="flex items-start gap-4">
            <div className="w-24 aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
              {fotoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoPreview} alt="Foto do corretor" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 text-center px-1">
                  Sem foto
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={aoSelecionarFoto}
                disabled={enviandoFoto}
                className="text-xs"
              />
              {enviandoFoto && (
                <span className="text-[11px] text-gray-400 inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 rounded-full animate-spin border-gray-300 border-t-gray-600 shrink-0" />
                  Enviando...
                </span>
              )}
              {erroFoto && <span className="text-[11px] text-red-600">{erroFoto}</span>}
              {fotoPreview && (
                <button
                  type="button"
                  onClick={removerFotoAtual}
                  className="text-[11px] text-red-600 hover:underline self-start"
                >
                  Remover foto
                </button>
              )}
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
        <BotaoSubmit carregandoTexto="Salvando..." className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90">
          {p ? "Salvar alterações" : "Cadastrar parceiro"}
        </BotaoSubmit>
      </div>
    </form>
  );
}
