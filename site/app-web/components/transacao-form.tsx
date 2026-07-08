"use client";

import { useMemo, useState } from "react";
import {
  TIPOS_TRANSACAO,
  GARANTIA_OPCOES,
  FORMA_PAGAMENTO_OPCOES,
  FINALIDADE_LOCACAO_OPCOES,
  ENCARGOS_OPCOES,
  CHAVE_OPCOES,
  STATUS_HONORARIO_OPCOES,
  FUNCOES_CORRETOR,
  TIPO_CONDICAO_OPCOES,
  statusOpcoesPorTipo
} from "@/lib/transacoes/opcoes";
import {
  formatValorEditavel,
  formatPercentual,
  formatInscricao,
  formatMoeda,
  valorEditavelParaDecimal,
  percentualParaDecimal,
  somarMeses
} from "@/lib/format";

type ClienteOpcao = { id: string; nome: string; id_legado: string | null; parceiroId: string | null };
type LojaOpcao = { id: string; nome: string };
type ParceiroOpcao = { id: string; nome: string; funcao: string | null };
type ImovelOpcao = {
  id: string;
  id_legado: string | null;
  endereco: string | null;
  inscricao: string | null;
  parceiroId: string | null;
  proprietarios: { id: string; nome: string; parceiroId: string | null }[];
};

// Administrações com status "Ativo" — só essas podem virar uma locação em
// "Elaboração de Contrato de Locação" (imóvel e proprietário vêm delas).
type AdministracaoOpcao = {
  id: string;
  id_legado: string | null;
  parceiroId: string | null;
  imovelId: string;
  imovelEndereco: string | null;
  imovelInscricao: string | null;
  clienteNome: string;
};

type TransacaoExistente = {
  id: string;
  id_legado: string | null;
  tipo: string;
  loja_id: string;
  imovel_id: string | null;
  adm_imovel_id: string | null;
  status: string | null;
  garantia: string | null;
  valor_caucao: unknown;
  pg_caucao: string | null;
  data_assinatura: Date | null;
  data_vencimento: Date | null;
  dia_vencimento: number | null;
  prazo_contrato_meses: number | null;
  tem_parceria: boolean;
  porc_parceria: unknown;
  parceiro_externo_id: string | null;
  corretor_proprietario_id: string | null;
  corretor_contraparte_id: string | null;
  status_honorario: string;
  valor_transacao: unknown;
  porc_honorario: unknown;
  porc_corretor_proprietario: unknown;
  porc_corretor_contraparte: unknown;
  porc_imobiliaria: unknown;
  encargos: string[];
  forma_pagamento: string | null;
  finalidade_locacao: string | null;
  chave: string | null;
  tem_vistoria: boolean | null;
  arquivo_vistoria_url: string | null;
  observacao: string | null;
  pasta_url: string | null;
};

export type CondicaoPagamento = {
  tipo: string;
  valor: string;
  forma_pagamento: string;
  parcelas: string;
  momento: string;
  data_pagamento: string;
  descricao: string;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

// Busca do Imóvel no Vínculo lidera com Id - Cliente Proprietário — mais
// fácil de achar de cabeça do que decorar endereço ou inscrição.
function labelImovel(i: ImovelOpcao): string {
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

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

export function TransacaoForm({
  transacao,
  lojas,
  clientes,
  imoveis,
  parceiros,
  administracoes,
  imoveisComAdmAtivaIds,
  interessadosIniciais,
  condicoesIniciais,
  tipoInicial,
  action
}: {
  transacao: TransacaoExistente | null;
  lojas: LojaOpcao[];
  clientes: ClienteOpcao[];
  imoveis: ImovelOpcao[];
  parceiros: ParceiroOpcao[];
  administracoes: AdministracaoOpcao[];
  imoveisComAdmAtivaIds: string[];
  interessadosIniciais: ClienteOpcao[];
  condicoesIniciais: CondicaoPagamento[];
  tipoInicial?: string;
  action: (formData: FormData) => void;
}) {
  const t = transacao;

  const [tipo, setTipo] = useState(t?.tipo ?? tipoInicial ?? "Locação");
  const eLocacao = tipo === "Locação";

  const [status, setStatus] = useState(t?.status ?? "");

  // Regra pedida: Status "Elaboração de Contrato de Locação" só pode vir de
  // uma Administração com status Ativo (imóvel e proprietário vêm dela).
  // Status "Imóvel em locação sem administração" segue cadastro normal, mas
  // não pode ser um imóvel que já tem administração ativa (esse precisa
  // passar pela Administração, não direto aqui).
  const precisaAdministracao = eLocacao && status === "Elaboração de Contrato de Locação";
  const semAdministracao = eLocacao && status === "Imóvel em locação sem administração";

  const idsComAdmAtiva = useMemo(() => new Set(imoveisComAdmAtivaIds), [imoveisComAdmAtivaIds]);

  const imovelInicial = imoveis.find((i) => i.id === t?.imovel_id) ?? null;
  const [imovelId, setImovelId] = useState(t?.imovel_id ?? "");
  const [buscaImovel, setBuscaImovel] = useState(imovelInicial ? labelImovel(imovelInicial) : "");
  const [listaImovelAberta, setListaImovelAberta] = useState(false);

  const [admImovelId, setAdmImovelId] = useState(t?.adm_imovel_id ?? "");
  const administracaoInicial = administracoes.find((a) => a.id === t?.adm_imovel_id) ?? null;
  const [buscaAdministracao, setBuscaAdministracao] = useState(
    administracaoInicial ? labelAdministracao(administracaoInicial) : ""
  );
  const [listaAdministracaoAberta, setListaAdministracaoAberta] = useState(false);

  // O(s) Cliente(s) Proprietário(s) não é escolhido aqui — vem direto do
  // cadastro do Imóvel (proprietários vinculados lá) ou da Administração
  // selecionada. Só exibe pra conferência; quem precisar mudar o
  // proprietário, muda no Imóvel/Administração.
  const proprietariosDoImovel = imoveis.find((i) => i.id === imovelId)?.proprietarios ?? [];

  // Cliente(s) Interessado(s) — a outra parte (comprador/locatário). Pode
  // ter mais de um (ex.: compra em conjunto, cônjuges), cada um é um
  // Cliente cadastrado separadamente e adicionado aqui à lista.
  const [interessados, setInteressados] = useState<ClienteOpcao[]>(interessadosIniciais);
  const [buscaInteressado, setBuscaInteressado] = useState("");
  const [listaInteressadoAberta, setListaInteressadoAberta] = useState(false);

  const [temParceria, setTemParceria] = useState(t?.tem_parceria ?? false);
  const [temVistoria, setTemVistoria] = useState(t?.tem_vistoria ?? false);
  const [encargos, setEncargos] = useState<string[]>(t?.encargos ?? []);

  // Datas e valor — Data de vencimento não é mais digitada, é calculada
  // (assinatura + tempo de contrato em meses).
  const [dataAssinatura, setDataAssinatura] = useState(inputDate(t?.data_assinatura ?? null));
  const [prazoContratoMesesTexto, setPrazoContratoMesesTexto] = useState(
    t?.prazo_contrato_meses != null ? String(t.prazo_contrato_meses) : ""
  );
  const [valorTransacaoTexto, setValorTransacaoTexto] = useState(formatValorEditavel(t?.valor_transacao));
  // Se não der pra calcular (falta "Tempo de contrato em meses" — comum em
  // contrato importado da planilha antiga, que trouxe a Data de vencimento
  // já pronta mas não o campo em meses), usa o valor já salvo em vez de
  // deixar em branco. Sem isso, um simples Salvar nesses contratos apagava
  // a Data de vencimento real do banco (o campo é somente leitura e sempre
  // mandava o texto calculado, mesmo vazio).
  const dataVencimentoCalculada = useMemo(() => {
    const calculada = somarMeses(dataAssinatura, Number(prazoContratoMesesTexto) || null);
    return calculada || inputDate(t?.data_vencimento ?? null);
  }, [dataAssinatura, prazoContratoMesesTexto]);

  // Corretores da Comissionamento — vêm automático do proprietário (imóvel
  // ou administração) e do interessado, mas continuam editáveis (o usuário
  // pode trocar manualmente depois do preenchimento automático).
  const [corretorProprietarioId, setCorretorProprietarioId] = useState(t?.corretor_proprietario_id ?? "");
  const [corretorContraparteId, setCorretorContraparteId] = useState(t?.corretor_contraparte_id ?? "");

  // Condições de pagamento (o "negócio" em si — entrada, saldo financiado,
  // parcelado, permuta etc.) — só existe pra Compra e Venda.
  const [condicoes, setCondicoes] = useState<CondicaoPagamento[]>(condicoesIniciais);
  const [novaCondicao, setNovaCondicao] = useState<CondicaoPagamento>({
    tipo: TIPO_CONDICAO_OPCOES[0],
    valor: "",
    forma_pagamento: "",
    parcelas: "",
    momento: "",
    data_pagamento: "",
    descricao: ""
  });

  function adicionarCondicao() {
    if (!novaCondicao.valor.trim()) return;
    setCondicoes((atual) => [...atual, novaCondicao]);
    setNovaCondicao({ tipo: TIPO_CONDICAO_OPCOES[0], valor: "", forma_pagamento: "", parcelas: "", momento: "", data_pagamento: "", descricao: "" });
  }

  function removerCondicao(indice: number) {
    setCondicoes((atual) => atual.filter((_, i) => i !== indice));
  }

  // Comissionamento — honorário total e rateio calculados ao vivo a partir
  // do Valor da transação. O parceiro externo aparece primeiro porque o
  // valor dele é descontado do honorário total antes de ratear entre os
  // corretores da imobiliária.
  const valorTransacaoNum = valorEditavelParaDecimal(valorTransacaoTexto) ?? 0;

  // Mensagem de conferência (não bloqueia salvar): soma das condições de
  // pagamento lançadas até agora, comparada ao Valor da Transação — pra dar
  // pra ver, ainda preenchendo, se as etapas do negócio já fecham o valor
  // total ou se falta/sobra alguma coisa.
  const somaCondicoes = useMemo(
    () => condicoes.reduce((acc, c) => acc + (valorEditavelParaDecimal(c.valor) ?? 0), 0),
    [condicoes]
  );
  const saldoCondicoes = valorTransacaoNum - somaCondicoes;

  const [porcHonorarioTexto, setPorcHonorarioTexto] = useState(formatPercentual(t?.porc_honorario));
  const [porcParceriaTexto, setPorcParceriaTexto] = useState(formatPercentual(t?.porc_parceria));
  const [porcCorretorProprietarioTexto, setPorcCorretorProprietarioTexto] = useState(
    formatPercentual(t?.porc_corretor_proprietario)
  );
  const [porcCorretorContraparteTexto, setPorcCorretorContraparteTexto] = useState(
    formatPercentual(t?.porc_corretor_contraparte)
  );

  const honorarioTotalRS = valorTransacaoNum * (percentualParaDecimal(porcHonorarioTexto) ?? 0);
  const valorParceriaRS = temParceria ? honorarioTotalRS * (percentualParaDecimal(porcParceriaTexto) ?? 0) : 0;
  // "Restante" é o que de fato entra pra imobiliária depois de descontada a
  // parceria externa (quando tem) — vira o "100%" local pro rateio entre os
  // dois corretores e a própria imobiliária, não o honorário total bruto.
  const restanteRateioRS = honorarioTotalRS - valorParceriaRS;
  const fracCorretorProprietario = percentualParaDecimal(porcCorretorProprietarioTexto) ?? 0;
  const fracCorretorContraparte = percentualParaDecimal(porcCorretorContraparteTexto) ?? 0;
  const valorCorretorProprietarioRS = restanteRateioRS * fracCorretorProprietario;
  const valorCorretorContraparteRS = restanteRateioRS * fracCorretorContraparte;
  // % imobiliária não é mais digitado — é sempre o que sobra do "restante"
  // depois de pagar os dois corretores, pra não precisar de conta manual
  // (e pra nunca ficar com uma % de imobiliária que não bate com o resto).
  const somaFracCorretores = fracCorretorProprietario + fracCorretorContraparte;
  const corretoresPassaramDe100 = somaFracCorretores > 1;
  const fracImobiliaria = Math.max(0, 1 - somaFracCorretores);
  const porcImobiliariaTexto = formatPercentual(fracImobiliaria);
  const valorImobiliariaRS = restanteRateioRS * fracImobiliaria;

  const corretores = useMemo(() => parceiros.filter((p) => FUNCOES_CORRETOR.includes(p.funcao ?? "")), [parceiros]);

  const imoveisFiltrados = useMemo(() => {
    const b = buscaImovel.trim().toLowerCase();
    const base = semAdministracao ? imoveis.filter((i) => !idsComAdmAtiva.has(i.id)) : imoveis;
    if (!b) return base.slice(0, 30);
    return base
      .filter(
        (i) =>
          (i.id_legado ?? "").toLowerCase().includes(b) ||
          i.proprietarios.some((p) => p.nome.toLowerCase().includes(b)) ||
          (i.endereco ?? "").toLowerCase().includes(b) ||
          (i.inscricao ?? "").toLowerCase().includes(b)
      )
      .slice(0, 30);
  }, [buscaImovel, imoveis, semAdministracao, idsComAdmAtiva]);

  const administracoesFiltradas = useMemo(() => {
    const b = buscaAdministracao.trim().toLowerCase();
    if (!b) return administracoes.slice(0, 30);
    return administracoes
      .filter((a) => (a.imovelEndereco ?? "").toLowerCase().includes(b) || a.clienteNome.toLowerCase().includes(b))
      .slice(0, 30);
  }, [buscaAdministracao, administracoes]);

  const interessadosFiltrados = useMemo(() => {
    const b = buscaInteressado.trim().toLowerCase();
    const idsJaAdicionados = new Set(interessados.map((c) => c.id));
    const disponiveis = clientes.filter((c) => !idsJaAdicionados.has(c.id));
    if (!b) return disponiveis.slice(0, 30);
    return disponiveis.filter((c) => c.nome.toLowerCase().includes(b)).slice(0, 30);
  }, [buscaInteressado, clientes, interessados]);

  function selecionarImovel(i: ImovelOpcao) {
    setImovelId(i.id);
    setBuscaImovel(labelImovel(i));
    setListaImovelAberta(false);
    setAdmImovelId("");
    const corretorAuto = i.parceiroId ?? i.proprietarios[0]?.parceiroId ?? "";
    if (corretorAuto) setCorretorProprietarioId(corretorAuto);
  }

  function selecionarAdministracao(a: AdministracaoOpcao) {
    setAdmImovelId(a.id);
    setBuscaAdministracao(labelAdministracao(a));
    setListaAdministracaoAberta(false);
    setImovelId(a.imovelId);
    if (a.parceiroId) setCorretorProprietarioId(a.parceiroId);
  }

  function adicionarInteressado(c: ClienteOpcao) {
    const eraOPrimeiro = interessados.length === 0;
    setInteressados((atual) => [...atual, c]);
    setBuscaInteressado("");
    setListaInteressadoAberta(false);
    if (eraOPrimeiro && c.parceiroId) setCorretorContraparteId(c.parceiroId);
  }

  function removerInteressado(id: string) {
    setInteressados((atual) => atual.filter((c) => c.id !== id));
  }

  function toggleEncargo(op: string) {
    setEncargos((atual) => (atual.includes(op) ? atual.filter((e) => e !== op) : [...atual, op]));
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {t && <input type="hidden" name="transacaoId" value={t.id} />}
      <input type="hidden" name="imovel_id" value={imovelId} />
      <input type="hidden" name="adm_imovel_id" value={admImovelId} />
      {interessados.map((c) => (
        <input key={c.id} type="hidden" name="interessado_id" value={c.id} />
      ))}
      {!eLocacao && <input type="hidden" name="condicoes_pagamento_json" value={JSON.stringify(condicoes)} />}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-800">Identificação</div>
          <div className="text-xs text-gray-400">
            Id: <span className="font-semibold text-gray-600">{t ? t.id_legado ?? t.id : "gerado ao salvar"}</span>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Tipo de transação</label>
            <select
              className={CAMPO}
              name="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              required
            >
              {TIPOS_TRANSACAO.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Loja</label>
            <select className={CAMPO} name="loja_id" defaultValue={t?.loja_id ?? ""} required>
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
            <select className={CAMPO} name="status" value={status} onChange={(e) => setStatus(e.target.value)} required>
              <option value="" disabled>
                Selecione...
              </option>
              {statusOpcoesPorTipo(tipo).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Pasta (link)</label>
            <input className={CAMPO} name="pasta_url" defaultValue={t?.pasta_url ?? ""} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Vínculo</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="relative">
            <label className={LABEL}>{precisaAdministracao ? "Administração (status Ativo)" : "Imóvel"}</label>
            <p className="text-[11px] text-gray-400 mb-1">
              {precisaAdministracao
                ? "Só mostra administrações com status Ativo — o imóvel e o proprietário vêm dela automaticamente."
                : semAdministracao
                ? "Não mostra imóveis com administração ativa — esses precisam ser vinculados por lá."
                : "Digite endereço, inscrição, Id ou nome do proprietário para localizar o imóvel."}
            </p>

            {precisaAdministracao ? (
              <>
                <input
                  className={CAMPO}
                  placeholder="Digite endereço ou nome do proprietário..."
                  value={buscaAdministracao}
                  onChange={(e) => {
                    setBuscaAdministracao(e.target.value);
                    setAdmImovelId("");
                    setImovelId("");
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
              </>
            ) : (
              <>
                <input
                  className={CAMPO}
                  placeholder="Digite endereço ou inscrição..."
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
                    {imoveisFiltrados.length === 0 && (
                      <p className="text-xs text-gray-400 p-3">Nenhum imóvel encontrado.</p>
                    )}
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
              </>
            )}

            {imovelId && (
              <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <div className="text-[11px] text-blue-700 font-semibold mb-0.5">Cliente Proprietário (conferência)</div>
                {proprietariosDoImovel.length > 0 ? (
                  <div className="text-xs text-gray-700">
                    {proprietariosDoImovel.map((p) => p.nome).join(", ")}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">
                    Este imóvel não tem proprietário cadastrado — cadastre em Imóveis antes de gerar contrato.
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="relative">
            <label className={LABEL}>Cliente Interessado (a outra parte)</label>
            <p className="text-[11px] text-gray-400 mb-1">
              Comprador(a) ou locatário(a). Pode ter mais de um — adicione quantos forem necessários.
            </p>
            {interessados.length > 0 && (
              <div className="flex flex-col gap-1 mb-2">
                {interessados.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5"
                  >
                    <span className="text-gray-800 font-medium truncate">{c.nome}</span>
                    <button
                      type="button"
                      onClick={() => removerInteressado(c.id)}
                      className="text-gray-400 hover:text-red-600 ml-2"
                    >
                      remover
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              className={CAMPO}
              placeholder="+ Adicionar interessado — digite para buscar..."
              value={buscaInteressado}
              onChange={(e) => {
                setBuscaInteressado(e.target.value);
                setListaInteressadoAberta(true);
              }}
              onFocus={() => setListaInteressadoAberta(true)}
              onBlur={() => setTimeout(() => setListaInteressadoAberta(false), 150)}
            />
            {listaInteressadoAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                {interessadosFiltrados.length === 0 && (
                  <p className="text-xs text-gray-400 p-3">Nenhum cliente encontrado.</p>
                )}
                {interessadosFiltrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => adicionarInteressado(c)}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {c.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Datas e valor</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Data de assinatura</label>
            <input
              type="date"
              className={CAMPO}
              name="data_assinatura"
              value={dataAssinatura}
              onChange={(e) => setDataAssinatura(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Valor da transação (R$)</label>
            <input
              className={CAMPO}
              name="valor_transacao"
              placeholder="350.000,00"
              value={valorTransacaoTexto}
              onChange={(e) => setValorTransacaoTexto(e.target.value)}
              required
            />
          </div>
          {eLocacao && (
            <div>
              <label className={LABEL}>Dia de vencimento (aluguel)</label>
              <input
                className={CAMPO}
                name="dia_vencimento"
                placeholder="10"
                defaultValue={t?.dia_vencimento ?? ""}
              />
            </div>
          )}
          {eLocacao && (
            <div>
              <label className={LABEL}>Tempo de contrato (meses)</label>
              <input
                className={CAMPO}
                name="prazo_contrato_meses"
                placeholder="30"
                value={prazoContratoMesesTexto}
                onChange={(e) => setPrazoContratoMesesTexto(e.target.value)}
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Usado para calcular a Data de vencimento e o Prazo restante.
              </p>
            </div>
          )}
          {eLocacao && (
            <div>
              <label className={LABEL}>Data de vencimento (fim do contrato)</label>
              <input
                type="date"
                className={CAMPO + " bg-gray-50 text-gray-500"}
                name="data_vencimento"
                value={dataVencimentoCalculada}
                readOnly
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Calculada automaticamente (assinatura + tempo de contrato).
              </p>
            </div>
          )}
        </div>
      </div>

      {eLocacao && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Locação</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Finalidade da locação</label>
              <select className={CAMPO} name="finalidade_locacao" defaultValue={t?.finalidade_locacao ?? ""}>
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
              <select className={CAMPO} name="garantia" defaultValue={t?.garantia ?? ""}>
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
              <input
                className={CAMPO}
                name="valor_caucao"
                placeholder="1.500,00"
                defaultValue={formatValorEditavel(t?.valor_caucao)}
              />
            </div>
            <div>
              <label className={LABEL}>Forma de pagamento da caução</label>
              <input className={CAMPO} name="pg_caucao" defaultValue={t?.pg_caucao ?? ""} />
            </div>
            <div>
              <label className={LABEL}>Forma de pagamento</label>
              <select className={CAMPO} name="forma_pagamento" defaultValue={t?.forma_pagamento ?? ""}>
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
                    <input
                      type="checkbox"
                      name="encargos"
                      value={op}
                      checked={encargos.includes(op)}
                      onChange={() => toggleEncargo(op)}
                    />
                    {op}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {!eLocacao && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Compra e venda</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Momento da entrega das chaves</label>
              <select className={CAMPO} name="chave" defaultValue={t?.chave ?? ""}>
                <option value="">—</option>
                {CHAVE_OPCOES.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {!eLocacao && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-1">Negócio — condições de pagamento</div>
          <p className="text-xs text-gray-400 mb-3">
            Como o valor da transação é pago (entrada, saldo financiado, parcelado direto, permuta etc.). Pode ter
            mais de uma etapa — adicione quantas forem necessárias.
          </p>

          {condicoes.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-3">
              {condicoes.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                >
                  <span className="text-gray-700">
                    <span className="font-semibold text-gray-800">{c.tipo}</span> — {formatValorEditavel(c.valor) || c.valor}
                    {c.forma_pagamento && <span className="text-gray-500"> · {c.forma_pagamento}</span>}
                    {c.parcelas && <span className="text-gray-500"> · {c.parcelas}x</span>}
                    {c.momento && <span className="text-gray-500"> · {c.momento}</span>}
                    {c.data_pagamento && <span className="text-gray-500"> · {c.data_pagamento}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => removerCondicao(i)}
                    className="text-gray-400 hover:text-red-600 ml-2 shrink-0"
                  >
                    remover
                  </button>
                </div>
              ))}
            </div>
          )}

          {condicoes.length > 0 && (
            <div
              className={`text-xs rounded-lg px-3 py-2 mb-3 border ${
                saldoCondicoes === 0
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
            >
              Total lançado nas condições: {formatMoeda(somaCondicoes)} · Valor da transação:{" "}
              {formatMoeda(valorTransacaoNum)}
              {saldoCondicoes === 0 && " · fecha certinho com o valor da transação."}
              {saldoCondicoes > 0 && ` · ainda falta ${formatMoeda(saldoCondicoes)} para completar o valor total.`}
              {saldoCondicoes < 0 &&
                ` · as condições somam ${formatMoeda(Math.abs(saldoCondicoes))} a mais que o valor da transação.`}
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
              <input
                className={CAMPO}
                placeholder="transferência bancária"
                value={novaCondicao.forma_pagamento}
                onChange={(e) => setNovaCondicao((a) => ({ ...a, forma_pagamento: e.target.value }))}
              />
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
              <input
                className={CAMPO}
                placeholder="assinatura do contrato"
                value={novaCondicao.momento}
                onChange={(e) => setNovaCondicao((a) => ({ ...a, momento: e.target.value }))}
              />
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
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Comissionamento</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Corretor do proprietário</label>
            <select
              className={CAMPO}
              name="corretor_proprietario_id"
              value={corretorProprietarioId}
              onChange={(e) => setCorretorProprietarioId(e.target.value)}
            >
              <option value="">—</option>
              {corretores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">Vem automático do proprietário — pode trocar se precisar.</p>
          </div>
          <div>
            <label className={LABEL}>Corretor da contraparte</label>
            <select
              className={CAMPO}
              name="corretor_contraparte_id"
              value={corretorContraparteId}
              onChange={(e) => setCorretorContraparteId(e.target.value)}
            >
              <option value="">—</option>
              {corretores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">Vem automático do interessado — pode trocar se precisar.</p>
          </div>
          <div>
            <label className={LABEL}>Status do honorário</label>
            <select className={CAMPO} name="status_honorario" defaultValue={t?.status_honorario ?? "Pendente"}>
              {STATUS_HONORARIO_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Honorário total (%)</label>
            <input
              className={CAMPO}
              name="porc_honorario"
              placeholder="6"
              value={porcHonorarioTexto}
              onChange={(e) => setPorcHonorarioTexto(e.target.value)}
            />
            <p className="text-[11px] text-gray-500 mt-1">{formatMoeda(honorarioTotalRS)}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tem_parceria"
              name="tem_parceria"
              checked={temParceria}
              onChange={(e) => setTemParceria(e.target.checked)}
            />
            <label htmlFor="tem_parceria" className="text-xs text-gray-600">
              Tem parceria externa
            </label>
          </div>
          {temParceria && (
            <div>
              <label className={LABEL}>Parceiro externo</label>
              <select className={CAMPO} name="parceiro_externo_id" defaultValue={t?.parceiro_externo_id ?? ""}>
                <option value="">—</option>
                {parceiros.map((p) => (
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
              <input
                className={CAMPO}
                name="porc_parceria"
                placeholder="20"
                value={porcParceriaTexto}
                onChange={(e) => setPorcParceriaTexto(e.target.value)}
              />
              <p className="text-[11px] text-gray-500 mt-1">{formatMoeda(valorParceriaRS)}</p>
            </div>
          )}
          <div>
            <label className={LABEL}>% corretor do proprietário</label>
            <input
              className={CAMPO}
              name="porc_corretor_proprietario"
              placeholder="50"
              value={porcCorretorProprietarioTexto}
              onChange={(e) => setPorcCorretorProprietarioTexto(e.target.value)}
            />
            <p className="text-[11px] text-gray-500 mt-1">{formatMoeda(valorCorretorProprietarioRS)}</p>
          </div>
          <div>
            <label className={LABEL}>% corretor da contraparte</label>
            <input
              className={CAMPO}
              name="porc_corretor_contraparte"
              placeholder="0"
              value={porcCorretorContraparteTexto}
              onChange={(e) => setPorcCorretorContraparteTexto(e.target.value)}
            />
            <p className="text-[11px] text-gray-500 mt-1">{formatMoeda(valorCorretorContraparteRS)}</p>
          </div>
          <div>
            <label className={LABEL}>% imobiliária</label>
            <input
              className={CAMPO + " bg-gray-50 text-gray-500"}
              name="porc_imobiliaria"
              value={porcImobiliariaTexto}
              readOnly
            />
            <p className="text-[11px] text-gray-500 mt-1">{formatMoeda(valorImobiliariaRS)}</p>
          </div>
          <p className="md:col-span-3 text-[11px] text-gray-400">
            {temParceria && (
              <>
                Honorário total {formatMoeda(honorarioTotalRS)} − parceria {formatMoeda(valorParceriaRS)} ={" "}
                {formatMoeda(restanteRateioRS)} fica pra imobiliária (esse valor vira os 100% de baixo).{" "}
              </>
            )}
            % imobiliária é calculada sozinha: 100% − corretor do proprietário − corretor da contraparte.
          </p>
          {corretoresPassaramDe100 && (
            <p className="md:col-span-3 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
              % corretor do proprietário + % corretor da contraparte somam mais que 100% — a imobiliária ficaria
              negativa, então foi travada em 0%. Ajuste as duas porcentagens acima.
            </p>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Vistoria</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tem_vistoria"
              name="tem_vistoria"
              checked={temVistoria}
              onChange={(e) => setTemVistoria(e.target.checked)}
            />
            <label htmlFor="tem_vistoria" className="text-xs text-gray-600">
              Tem vistoria
            </label>
          </div>
          <div>
            <label className={LABEL}>Arquivo da vistoria (link)</label>
            <input className={CAMPO} name="arquivo_vistoria_url" defaultValue={t?.arquivo_vistoria_url ?? ""} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Observação</div>
        <textarea className={CAMPO + " min-h-24"} name="observacao" defaultValue={t?.observacao ?? ""} />
      </div>

      <div className="flex justify-end">
        <button type="submit" className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90">
          {t ? "Salvar alterações" : "Cadastrar transação"}
        </button>
      </div>
    </form>
  );
}
