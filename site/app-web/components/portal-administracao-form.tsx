"use client";

import { useMemo, useState } from "react";
import { TIPOS_IMOVEL } from "@/lib/imoveis/opcoes";
import { ESTADOS_CIVIS, TIPOS_CONTA, TIPOS_PIX } from "@/lib/clientes/opcoes";
import { AGUA_OPCOES, ENERGIA_OPCOES } from "@/lib/administracoes/opcoes";
import { CampoLink } from "@/components/campo-link";
import { gerarContratoAdministracaoAction } from "@/app/portal/administracao/actions";

type Banco = { id: string; nome: string; codigo: string | null };

type ClienteLinha = {
  // Presente só quando o corretor escolheu um cliente já cadastrado (em vez
  // de digitar um novo) — nesse caso os campos abaixo vêm travados (só
  // leitura), pra não deixar editar um cadastro existente por aqui.
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

type ImovelDoCliente = {
  id: string;
  tipoImovel: string;
  rua: string;
  nPredial: string;
  complemento: string;
  bairro: string;
  estadoId: string;
  cidadeId: string;
  matricula: string;
  inscricao: string;
  endereco: string;
};

type ClienteDoCorretor = {
  id: string;
  nome: string;
  rg: string;
  cpfCnpj: string;
  endereco: string;
  nacionalidade: string;
  estadoCivil: string;
  email: string;
  telefone: string;
  imoveis: ImovelDoCliente[];
};

function clienteVazio(): ClienteLinha {
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

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const CAMPO_TRAVADO = "text-xs border border-gray-200 rounded-lg px-3 py-1.5 w-full bg-gray-100 text-gray-500";
const LABEL = "text-xs text-gray-600 block mb-1";

export function PortalAdministracaoForm({
  corretor,
  lojas,
  estados,
  cidades,
  clientesDoCorretor,
  bancos
}: {
  corretor: { id: string; nome: string; creci: string | null; cpf: string | null };
  lojas: { id: string; nome: string }[];
  estados: { id: string; nome: string }[];
  cidades: { id: string; nome: string; estado_id: string }[];
  clientesDoCorretor: ClienteDoCorretor[];
  bancos: Banco[];
}) {
  const [lojaId, setLojaId] = useState("");
  const [clientes, setClientes] = useState<ClienteLinha[]>([clienteVazio()]);

  const [imovelId, setImovelId] = useState("");
  const [tipoImovel, setTipoImovel] = useState("");
  const [rua, setRua] = useState("");
  const [nPredial, setNPredial] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [estadoId, setEstadoId] = useState("");
  const [cidadeId, setCidadeId] = useState("");
  const [matricula, setMatricula] = useState("");
  const [inscricao, setInscricao] = useState("");

  const [dataEntrada, setDataEntrada] = useState(hojeISO());
  const [dataAssinatura, setDataAssinatura] = useState("");
  const [prazoMeses, setPrazoMeses] = useState("");
  const [valorTransacao, setValorTransacao] = useState("");
  const [porcHonorario, setPorcHonorario] = useState("");
  const [txAdministracao, setTxAdministracao] = useState("");
  const [valorCliente, setValorCliente] = useState("");
  const [valorAdministracao, setValorAdministracao] = useState("");
  const [iptu, setIptu] = useState("");

  const [temCondominio, setTemCondominio] = useState(false);
  const [condominio, setCondominio] = useState("");
  const [agua, setAgua] = useState("");
  const [ucCaerd, setUcCaerd] = useState("");
  const [energia, setEnergia] = useState("");
  const [ucEnergisa, setUcEnergisa] = useState("");

  const [temVistoria, setTemVistoria] = useState(false);
  const [arquivoVistoriaUrl, setArquivoVistoriaUrl] = useState("");

  const [observacao, setObservacao] = useState("");
  const [pastaUrl, setPastaUrl] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: true; idLegado: string | null } | { ok: false; erro: string } | null>(
    null
  );

  const cidadesDoEstado = useMemo(() => cidades.filter((c) => c.estado_id === estadoId), [cidades, estadoId]);

  // Imóveis oferecidos pra reaproveitar vêm sempre do cliente PRINCIPAL (o
  // primeiro da lista, o que fica vinculado direto em adm_imoveis.cliente_id)
  // — é o dono natural do imóvel objeto da administração.
  const clientePrincipal = clientes[0];
  const clienteExistentePrincipal = clientePrincipal?.clienteId
    ? clientesDoCorretor.find((c) => c.id === clientePrincipal.clienteId)
    : undefined;
  const imoveisDoClientePrincipal = clienteExistentePrincipal?.imoveis ?? [];

  function atualizarCliente(index: number, campo: keyof ClienteLinha, valor: string) {
    setClientes((atual) => atual.map((c, i) => (i === index ? { ...c, [campo]: valor } : c)));
  }

  // Código do banco vem automaticamente ao escolher o Banco — mesmo
  // comportamento do cadastro administrativo (ver components/cliente-form.tsx).
  function selecionarBanco(index: number, bancoId: string) {
    const banco = bancos.find((b) => b.id === bancoId);
    setClientes((atual) =>
      atual.map((c, i) => (i === index ? { ...c, bancoId, codigoBanco: banco?.codigo ?? c.codigoBanco } : c))
    );
  }

  // Ao escolher um cliente já cadastrado, preenche tudo com o que já está no
  // banco e trava os campos — o corretor não edita cadastro existente por
  // aqui, só usa. Escolhendo "+ Novo cliente" de volta, limpa a linha.
  function selecionarClienteExistente(index: number, clienteId: string) {
    if (!clienteId) {
      setClientes((atual) => atual.map((c, i) => (i === index ? clienteVazio() : c)));
      return;
    }
    const encontrado = clientesDoCorretor.find((c) => c.id === clienteId);
    if (!encontrado) return;
    setClientes((atual) =>
      atual.map((c, i) =>
        i === index
          ? {
              clienteId: encontrado.id,
              nome: encontrado.nome,
              rg: encontrado.rg,
              cpfCnpj: encontrado.cpfCnpj,
              endereco: encontrado.endereco,
              nacionalidade: encontrado.nacionalidade,
              estadoCivil: encontrado.estadoCivil,
              profissao: "",
              email: encontrado.email,
              telefone: encontrado.telefone,
              bancoId: "",
              codigoBanco: "",
              agencia: "",
              conta: "",
              tipoConta: "",
              tipoPix: "",
              pix: ""
            }
          : c
      )
    );
    // Trocar o cliente principal invalida o imóvel que tinha sido
    // selecionado antes (era de outro cliente).
    if (index === 0 && imovelId) {
      limparImovel();
    }
  }

  function adicionarCliente() {
    setClientes((atual) => [...atual, clienteVazio()]);
  }

  function removerCliente(index: number) {
    setClientes((atual) => atual.filter((_, i) => i !== index));
    if (index === 0 && imovelId) {
      limparImovel();
    }
  }

  function limparImovel() {
    setImovelId("");
    setTipoImovel("");
    setRua("");
    setNPredial("");
    setComplemento("");
    setBairro("");
    setEstadoId("");
    setCidadeId("");
    setMatricula("");
    setInscricao("");
  }

  // Ao escolher um imóvel já cadastrado (do cliente principal), preenche e
  // trava os campos do imóvel — mesma lógica do cliente: só reaproveita, não
  // edita o cadastro existente.
  function selecionarImovelExistente(id: string) {
    if (!id) {
      limparImovel();
      return;
    }
    const im = imoveisDoClientePrincipal.find((i) => i.id === id);
    if (!im) return;
    setImovelId(im.id);
    setTipoImovel(im.tipoImovel);
    setRua(im.rua);
    setNPredial(im.nPredial);
    setComplemento(im.complemento);
    setBairro(im.bairro);
    setEstadoId(im.estadoId);
    setCidadeId(im.cidadeId);
    setMatricula(im.matricula);
    setInscricao(im.inscricao);
  }

  async function handleCadastrar() {
    setEnviando(true);
    setResultado(null);
    try {
      const formData = new FormData();
      formData.set("clientesJson", JSON.stringify(clientes));
      formData.set("loja_id", lojaId);
      formData.set("imovel_id", imovelId);
      formData.set("tipo_imovel", tipoImovel);
      formData.set("rua", rua);
      formData.set("n_predial", nPredial);
      formData.set("complemento", complemento);
      formData.set("bairro", bairro);
      formData.set("estado_id", estadoId);
      formData.set("cidade_id", cidadeId);
      formData.set("matricula", matricula);
      formData.set("inscricao", inscricao);
      formData.set("data_entrada", dataEntrada);
      formData.set("data_assinatura", dataAssinatura);
      formData.set("prazo_contrato_meses", prazoMeses);
      formData.set("valor_transacao", valorTransacao);
      formData.set("porc_honorario", porcHonorario);
      formData.set("tx_administracao", txAdministracao);
      formData.set("valor_cliente", valorCliente);
      formData.set("valor_administracao", valorAdministracao);
      formData.set("iptu", iptu);
      if (temCondominio) formData.set("tem_condominio", "true");
      formData.set("condominio", condominio);
      formData.set("agua", agua);
      formData.set("uc_caerd", ucCaerd);
      formData.set("energia", energia);
      formData.set("uc_energisa", ucEnergisa);
      if (temVistoria) formData.set("tem_vistoria", "true");
      formData.set("arquivo_vistoria_url", arquivoVistoriaUrl);
      formData.set("observacao", observacao);
      formData.set("pasta_url", pastaUrl);

      const r = await gerarContratoAdministracaoAction(formData);
      setResultado(r);
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

  const podeCadastrar =
    Boolean(lojaId) && clientes.some((c) => c.nome.trim().length > 0) && Boolean(tipoImovel) && rua.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">1. Loja</div>
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

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">2. Cliente(s) — proprietário(s)</div>
        <p className="text-[11px] text-gray-400 mb-3">
          Pode ter mais de um proprietário (ex.: casal, herdeiros) — todos entram na qualificação e assinatura do
          contrato. Se o cliente já tem cadastro, escolha ele na lista em vez de digitar de novo (evita duplicar).
        </p>

        <div className="flex flex-col gap-4">
          {clientes.map((c, index) => (
            <div key={index} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">
                  {index === 0 ? "Proprietário principal" : `Proprietário adicional ${index + 1}`}
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

              {clientesDoCorretor.length > 0 && (
                <div className="mb-3">
                  <label className={LABEL}>Cliente já cadastrado (opcional)</label>
                  <select
                    className={CAMPO}
                    value={c.clienteId ?? ""}
                    onChange={(e) => selecionarClienteExistente(index, e.target.value)}
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
                    className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                    readOnly={Boolean(c.clienteId)}
                    value={c.nome}
                    onChange={(e) => atualizarCliente(index, "nome", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>RG</label>
                  <input
                    className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                    readOnly={Boolean(c.clienteId)}
                    value={c.rg}
                    onChange={(e) => atualizarCliente(index, "rg", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>CPF / CNPJ</label>
                  <input
                    className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                    readOnly={Boolean(c.clienteId)}
                    value={c.cpfCnpj}
                    onChange={(e) => atualizarCliente(index, "cpfCnpj", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Endereço</label>
                  <input
                    className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                    readOnly={Boolean(c.clienteId)}
                    value={c.endereco}
                    onChange={(e) => atualizarCliente(index, "endereco", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Nacionalidade</label>
                  <input
                    className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                    readOnly={Boolean(c.clienteId)}
                    value={c.nacionalidade}
                    onChange={(e) => atualizarCliente(index, "nacionalidade", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Estado civil</label>
                  <select
                    className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                    disabled={Boolean(c.clienteId)}
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
                  <label className={LABEL}>Profissão</label>
                  <input
                    className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                    readOnly={Boolean(c.clienteId)}
                    value={c.profissao}
                    onChange={(e) => atualizarCliente(index, "profissao", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Email</label>
                  <input
                    className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                    readOnly={Boolean(c.clienteId)}
                    value={c.email}
                    onChange={(e) => atualizarCliente(index, "email", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Telefone</label>
                  <input
                    className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                    readOnly={Boolean(c.clienteId)}
                    value={c.telefone}
                    onChange={(e) => atualizarCliente(index, "telefone", e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-[11px] font-semibold text-gray-500 mb-2">Dados bancários</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Banco</label>
                    <select
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      disabled={Boolean(c.clienteId)}
                      value={c.bancoId}
                      onChange={(e) => selecionarBanco(index, e.target.value)}
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
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      readOnly={Boolean(c.clienteId)}
                      value={c.codigoBanco}
                      onChange={(e) => atualizarCliente(index, "codigoBanco", e.target.value)}
                      placeholder="Preenchido ao escolher o banco"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Agência</label>
                    <input
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      readOnly={Boolean(c.clienteId)}
                      value={c.agencia}
                      onChange={(e) => atualizarCliente(index, "agencia", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Conta</label>
                    <input
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      readOnly={Boolean(c.clienteId)}
                      value={c.conta}
                      onChange={(e) => atualizarCliente(index, "conta", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Tipo de conta</label>
                    <select
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      disabled={Boolean(c.clienteId)}
                      value={c.tipoConta}
                      onChange={(e) => atualizarCliente(index, "tipoConta", e.target.value)}
                    >
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
                    <select
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      disabled={Boolean(c.clienteId)}
                      value={c.tipoPix}
                      onChange={(e) => atualizarCliente(index, "tipoPix", e.target.value)}
                    >
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
                    <input
                      className={c.clienteId ? CAMPO_TRAVADO : CAMPO}
                      readOnly={Boolean(c.clienteId)}
                      value={c.pix}
                      onChange={(e) => atualizarCliente(index, "pix", e.target.value)}
                    />
                  </div>
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
          + Adicionar outro proprietário
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">3. Imóvel</div>

        {imoveisDoClientePrincipal.length > 0 && (
          <div className="mb-3">
            <label className={LABEL}>Imóvel já cadastrado deste cliente (opcional)</label>
            <select className={CAMPO} value={imovelId} onChange={(e) => selecionarImovelExistente(e.target.value)}>
              <option value="">+ Novo imóvel</option>
              {imoveisDoClientePrincipal.map((im) => (
                <option key={im.id} value={im.id}>
                  {im.endereco || `${im.rua}, ${im.nPredial}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Tipo de imóvel</label>
            <select
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              disabled={Boolean(imovelId)}
              value={tipoImovel}
              onChange={(e) => setTipoImovel(e.target.value)}
            >
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
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={rua}
              onChange={(e) => setRua(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Número</label>
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={nPredial}
              onChange={(e) => setNPredial(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Complemento</label>
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={complemento}
              onChange={(e) => setComplemento(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Bairro</label>
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Estado</label>
            <select
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              disabled={Boolean(imovelId)}
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
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              disabled={Boolean(imovelId)}
              value={cidadeId}
              onChange={(e) => setCidadeId(e.target.value)}
            >
              <option value="">—</option>
              {cidadesDoEstado.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Matrícula</label>
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Inscrição</label>
            <input
              className={imovelId ? CAMPO_TRAVADO : CAMPO}
              readOnly={Boolean(imovelId)}
              value={inscricao}
              onChange={(e) => setInscricao(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">4. Datas e prazo</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Data de entrada</label>
            <input type="date" className={CAMPO} value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Data de assinatura</label>
            <input
              type="date"
              className={CAMPO}
              value={dataAssinatura}
              onChange={(e) => setDataAssinatura(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Prazo do contrato (meses)</label>
            <input className={CAMPO} value={prazoMeses} onChange={(e) => setPrazoMeses(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">5. Valores</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Valor do aluguel (R$)</label>
            <input
              className={CAMPO}
              placeholder="1.500,00"
              value={valorTransacao}
              onChange={(e) => setValorTransacao(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Honorário na intermediação (%)</label>
            <input
              className={CAMPO}
              placeholder="100"
              value={porcHonorario}
              onChange={(e) => setPorcHonorario(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Taxa de administração (%)</label>
            <input
              className={CAMPO}
              placeholder="10"
              value={txAdministracao}
              onChange={(e) => setTxAdministracao(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Valor líquido do cliente (R$)</label>
            <input
              className={CAMPO}
              placeholder="1.350,00"
              value={valorCliente}
              onChange={(e) => setValorCliente(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Valor da administração (R$)</label>
            <input
              className={CAMPO}
              placeholder="150,00"
              value={valorAdministracao}
              onChange={(e) => setValorAdministracao(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>IPTU (R$)</label>
            <input className={CAMPO} placeholder="80,00" value={iptu} onChange={(e) => setIptu(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">6. Condomínio, água e energia</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tem_condominio"
              checked={temCondominio}
              onChange={(e) => setTemCondominio(e.target.checked)}
            />
            <label htmlFor="tem_condominio" className="text-xs text-gray-600">
              Tem condomínio
            </label>
          </div>
          <div>
            <label className={LABEL}>Valor do condomínio (R$)</label>
            <input className={CAMPO} placeholder="300,00" value={condominio} onChange={(e) => setCondominio(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Água</label>
            <select className={CAMPO} value={agua} onChange={(e) => setAgua(e.target.value)}>
              <option value="">—</option>
              {AGUA_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>UC Caerd</label>
            <input className={CAMPO} value={ucCaerd} onChange={(e) => setUcCaerd(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Energia</label>
            <select className={CAMPO} value={energia} onChange={(e) => setEnergia(e.target.value)}>
              <option value="">—</option>
              {ENERGIA_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>UC Energisa</label>
            <input className={CAMPO} value={ucEnergisa} onChange={(e) => setUcEnergisa(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">7. Vistoria</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tem_vistoria"
              checked={temVistoria}
              onChange={(e) => setTemVistoria(e.target.checked)}
            />
            <label htmlFor="tem_vistoria" className="text-xs text-gray-600">
              Tem vistoria
            </label>
          </div>
          <CampoLink
            label="Arquivo da vistoria (link)"
            value={arquivoVistoriaUrl}
            onChange={setArquivoVistoriaUrl}
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">8. Observação e pasta</div>
        <div className="grid md:grid-cols-2 gap-3">
          <CampoLink label="Pasta (link)" value={pastaUrl} onChange={setPastaUrl} />
        </div>
        <div className="mt-3">
          <label className={LABEL}>Observação</label>
          <textarea
            className={CAMPO + " min-h-24"}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">9. Corretor (captador)</div>
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
          Preenchido automaticamente com o seu cadastro — é o parceiro captador desta administração.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!podeCadastrar || enviando}
          onClick={handleCadastrar}
          className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40 hover:opacity-90"
        >
          {enviando ? "Cadastrando..." : "Cadastrar administração"}
        </button>
        {resultado?.ok && (
          <span className="text-xs text-green-700 font-semibold">
            Administração {resultado.idLegado} cadastrada com sucesso. O administrativo vai dar sequência.
          </span>
        )}
        {resultado && !resultado.ok && <span className="text-xs text-red-600">{resultado.erro}</span>}
      </div>
    </div>
  );
}
