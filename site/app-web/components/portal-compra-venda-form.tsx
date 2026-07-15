"use client";

import { useMemo, useState } from "react";
import {
  CHAVE_OPCOES,
  TIPO_CONDICAO_OPCOES,
  FORMA_PAGAMENTO_CONDICAO_OPCOES,
  MOMENTO_CONDICAO_OPCOES
} from "@/lib/transacoes/opcoes";
import type { ImovelBuscaResultado, ClienteBuscaResultado } from "@/lib/transacoes/buscas";
import { gerarCompraVendaAction } from "@/app/portal/compra-venda/actions";

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
// do email). 15MB de arquivo original fica com folga segura.
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

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

export function PortalCompraVendaForm({
  corretorLogadoId,
  lojas,
  corretores,
  parceirosTodos,
  imoveis,
  clientes
}: {
  corretorLogadoId: string;
  lojas: { id: string; nome: string }[];
  corretores: { id: string; nome: string }[];
  parceirosTodos: { id: string; nome: string }[];
  imoveis: ImovelBuscaResultado[];
  clientes: ClienteBuscaResultado[];
}) {
  const [lojaId, setLojaId] = useState("");

  const [imovelId, setImovelId] = useState("");
  const [buscaImovel, setBuscaImovel] = useState("");
  const [listaImovelAberta, setListaImovelAberta] = useState(false);

  const [compradores, setCompradores] = useState<ClienteBuscaResultado[]>([]);
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
  const [resultado, setResultado] = useState<
    | { ok: true; idLegado: string | null; emailEnviado: boolean; emailErro?: string }
    | { ok: false; erro: string }
    | null
  >(null);

  const imovelSelecionado = useMemo(() => imoveis.find((i) => i.id === imovelId) ?? null, [imoveis, imovelId]);
  const gestaoEncontrada = imovelSelecionado?.gestaoId ?? null;
  const mostrarHistoricoGestao = Boolean(imovelSelecionado) && !gestaoEncontrada && !compraSemGestao;

  const imoveisFiltrados = useMemo(() => {
    const b = buscaImovel.trim().toLowerCase();
    if (!b) return imoveis.slice(0, 30);
    return imoveis
      .filter(
        (i) =>
          (i.id_legado ?? "").toLowerCase().includes(b) ||
          i.proprietarios.some((p) => p.nome.toLowerCase().includes(b)) ||
          (i.endereco ?? "").toLowerCase().includes(b) ||
          (i.inscricao ?? "").toLowerCase().includes(b)
      )
      .slice(0, 30);
  }, [buscaImovel, imoveis]);

  const compradoresFiltrados = useMemo(() => {
    const b = buscaComprador.trim().toLowerCase();
    const idsJaAdicionados = new Set(compradores.map((c) => c.id));
    const disponiveis = clientes.filter((c) => !idsJaAdicionados.has(c.id));
    if (!b) return disponiveis.slice(0, 30);
    return disponiveis.filter((c) => c.nome.toLowerCase().includes(b)).slice(0, 30);
  }, [buscaComprador, clientes, compradores]);

  function selecionarImovel(i: ImovelBuscaResultado) {
    setImovelId(i.id);
    setBuscaImovel(labelImovel(i));
    setListaImovelAberta(false);
    if (i.parceiroId) setCorretorProprietarioId(i.parceiroId);
  }

  function adicionarComprador(c: ClienteBuscaResultado) {
    const eraOPrimeiro = compradores.length === 0;
    setCompradores((atual) => [...atual, c]);
    setBuscaComprador("");
    setListaCompradorAberta(false);
    if (eraOPrimeiro && c.parceiroId) setCorretorContraparteId(c.parceiroId);
  }

  function removerComprador(id: string) {
    setCompradores((atual) => atual.filter((c) => c.id !== id));
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
    setResultado(null);
    try {
      const formData = new FormData();
      formData.set("loja_id", lojaId);
      formData.set("imovel_id", imovelId);
      formData.set("compra_sem_gestao", compraSemGestao ? "on" : "");
      compradores.forEach((c) => formData.append("comprador_id", c.id));
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
      documentos.forEach((arquivo) => formData.append("documentos", arquivo));

      const r = await gerarCompraVendaAction(formData);
      setResultado(r);
    } finally {
      setEnviando(false);
    }
  }

  const podeGerar =
    lojaId.length > 0 && imovelId.length > 0 && compradores.length > 0 && valorTransacaoTexto.trim().length > 0;

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
            <input className={CAMPO + " bg-gray-50 text-gray-500"} readOnly value="Elaboração do Contrato de Compra e Venda" />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">2. Vínculo</div>
        <p className="text-[11px] text-gray-400 mb-3">
          O imóvel pode ser de qualquer captação da imobiliária, não só a sua. Fora do seu próprio cadastro,
          só aparece o nome — os dados completos já estão registrados.
        </p>

        <div className="grid md:grid-cols-2 gap-3">
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
                  <div className="text-xs text-gray-600">
                    Nenhuma Gestão cadastrada pra esse imóvel.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <label className={LABEL}>Cliente(s) comprador(es)</label>
            {compradores.length > 0 && (
              <div className="flex flex-col gap-1 mb-2">
                {compradores.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5"
                  >
                    <span className="text-gray-800 font-medium truncate">{c.nome}</span>
                    <button type="button" onClick={() => removerComprador(c.id)} className="text-gray-400 hover:text-red-600 ml-2">
                      remover
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              className={CAMPO}
              placeholder="+ Adicionar comprador — digite para buscar..."
              value={buscaComprador}
              onChange={(e) => {
                setBuscaComprador(e.target.value);
                setListaCompradorAberta(true);
              }}
              onFocus={() => setListaCompradorAberta(true)}
              onBlur={() => setTimeout(() => setListaCompradorAberta(false), 150)}
            />
            {listaCompradorAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                {compradoresFiltrados.length === 0 && (
                  <p className="text-xs text-gray-400 p-3">Nenhum cliente encontrado.</p>
                )}
                {compradoresFiltrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => adicionarComprador(c)}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {labelCliente(c)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

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
        <div className="text-sm font-bold text-gray-800 mb-3">3. Datas e valor</div>
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
        <div className="text-sm font-bold text-gray-800 mb-3">4. Momento de entrega das chaves</div>
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
        <div className="text-sm font-bold text-gray-800 mb-1">5. Negócio — condições de pagamento</div>
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
        <div className="text-sm font-bold text-gray-800 mb-1">6. Comissionamento</div>
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
        <div className="text-sm font-bold text-gray-800 mb-1">7. Documentação</div>
        <p className="text-[11px] text-gray-400 mb-3">
          PDF ou imagem (RG, comprovante, contrato assinado etc.). Vai direto por email pro administrativo
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

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!podeGerar || enviando}
          onClick={handleGerar}
          className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40 hover:opacity-90"
        >
          {enviando ? "Cadastrando..." : "Cadastrar transação"}
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
