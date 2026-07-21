"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  STATUS_AVALIACAO_OPCOES,
  TIPO_AVALIACAO_OPCOES,
  TIPO_IMOVEL_AVALIACAO_OPCOES,
  PRODUTO_AVALIACAO_OPCOES,
  TABELA_AVALIACAO_OPCOES,
  INDEXADOR_AVALIACAO_OPCOES
} from "@/lib/financiamento/opcoes";
import { formatCpf, formatTelefone, formatMoeda, formatDataCalendario, formatValorEditavel } from "@/lib/format";

type Banco = { id: string; nome: string };
type Parceiro = { id: string; nome: string };
type Cliente = { id: string; nome: string; cpf: string | null; telefone: string | null; parceiro_id: string | null };

type AvaliacaoExistente = {
  id: string;
  id_legado: string | null;
  tipo_avaliacao: string | null;
  banco_id: string | null;
  status: string;
  data_avaliacao: Date | null;
  cliente_id: string | null;
  telefone: string | null;
  cpf: string | null;
  parceiro_id: string | null;
  data_validade: Date | null;
  tipo_imovel: string | null;
  produto: string | null;
  tabela: string | null;
  indexador: string | null;
  valor_aprovado: unknown;
  valor_financiamento: unknown;
  prestacao: unknown;
  usa_fgts: boolean;
  valor_fgts: unknown;
  usa_subsidio: boolean;
  valor_subsidio: unknown;
  imagem_consulta_url: string | null;
  observacao: string | null;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
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

function Linha({ label, valor }: { label: string; valor: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="text-xs text-gray-800 font-medium mt-0.5 break-words">{valor ?? "—"}</div>
    </div>
  );
}

function Ficha({
  avaliacao,
  clienteNome,
  cotitulares,
  bancoNome,
  parceiroNome,
  onEditar,
  actionApagar,
  podeApagar
}: {
  avaliacao: AvaliacaoExistente;
  clienteNome: string | null;
  cotitulares: Cliente[];
  bancoNome: string | null;
  parceiroNome: string | null;
  onEditar: () => void;
  actionApagar?: (formData: FormData) => void;
  podeApagar?: boolean;
}) {
  const a = avaliacao;

  const BotaoEditar = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onEditar}
        className="text-xs border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-50 font-semibold"
      >
        Editar
      </button>
      {podeApagar && actionApagar && (
        <form action={actionApagar}>
          <input type="hidden" name="avaliacaoId" value={a.id} />
          <button
            type="submit"
            className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50 font-semibold"
          >
            Excluir
          </button>
        </form>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <Cartao titulo="Cliente e parceiro" acao={BotaoEditar}>
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Cliente" valor={clienteNome} />
          {cotitulares.length > 0 && (
            <Linha label="Co-titulares (cônjuge / análise conjunta)" valor={cotitulares.map((c) => c.nome).join(", ")} />
          )}
          <Linha label="Parceiro responsável" valor={parceiroNome} />
          <Linha label="Telefone" valor={a.telefone ? formatTelefone(a.telefone) : null} />
          <Linha label="CPF" valor={a.cpf ? formatCpf(a.cpf) : null} />
        </div>
      </Cartao>

      <Cartao titulo="Avaliação">
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Status" valor={a.status} />
          <Linha label="Tipo de avaliação" valor={a.tipo_avaliacao} />
          <Linha label="Banco" valor={bancoNome} />
          <Linha label="Data da avaliação" valor={formatDataCalendario(a.data_avaliacao)} />
          <Linha label="Data de validade" valor={formatDataCalendario(a.data_validade)} />
          <Linha label="Tipo de imóvel" valor={a.tipo_imovel} />
          <Linha label="Produto" valor={a.produto} />
          <Linha label="Tabela" valor={a.tabela} />
          <Linha label="Indexador" valor={a.indexador} />
        </div>
      </Cartao>

      <Cartao titulo="Valores">
        <div className="grid md:grid-cols-3 gap-3">
          <Linha label="Valor aprovado" valor={formatMoeda(a.valor_aprovado)} />
          <Linha label="Valor de financiamento" valor={formatMoeda(a.valor_financiamento)} />
          <Linha label="Prestação" valor={formatMoeda(a.prestacao)} />
          <Linha label="Usa FGTS?" valor={a.usa_fgts ? "Sim" : "Não"} />
          {a.usa_fgts && <Linha label="Valor FGTS" valor={formatMoeda(a.valor_fgts)} />}
          <Linha label="Usa subsídio?" valor={a.usa_subsidio ? "Sim" : "Não"} />
          {a.usa_subsidio && <Linha label="Valor subsídio" valor={formatMoeda(a.valor_subsidio)} />}
        </div>
      </Cartao>

      {a.imagem_consulta_url && (
        <Cartao titulo="Imagem da consulta">
          <a href={a.imagem_consulta_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
            abrir
          </a>
        </Cartao>
      )}

      <Cartao titulo="Observações">
        <p className="text-xs text-gray-700 whitespace-pre-wrap">{a.observacao || "—"}</p>
      </Cartao>
    </div>
  );
}

export function AvaliacaoForm({
  avaliacao,
  clientes,
  cotitularesIniciais,
  bancos,
  parceiros,
  action,
  actionApagar,
  podeApagar
}: {
  avaliacao: AvaliacaoExistente | null;
  clientes: Cliente[];
  cotitularesIniciais?: Cliente[];
  bancos: Banco[];
  parceiros: Parceiro[];
  action: (formData: FormData) => void;
  actionApagar?: (formData: FormData) => void;
  podeApagar?: boolean;
}) {
  const a = avaliacao;
  // Cadastro novo já nasce em edição; cadastro existente abre em modo
  // visualização (Ficha), mesmo padrão do ParceiroForm.
  const [modoEdicao, setModoEdicao] = useState(!a);
  const [usaFgts, setUsaFgts] = useState(a?.usa_fgts ?? false);
  const [usaSubsidio, setUsaSubsidio] = useState(a?.usa_subsidio ?? false);
  const [status, setStatus] = useState(a?.status ?? "Montagem de processo");

  const clienteAtual = a ? clientes.find((c) => c.id === a.cliente_id) ?? null : null;
  const bancoAtual = a ? bancos.find((b) => b.id === a.banco_id) ?? null : null;
  const parceiroAtual = a ? parceiros.find((p) => p.id === a.parceiro_id) ?? null : null;

  // Cliente: busca entre TODOS os já cadastrados (sem cortar a lista — só
  // limita a exibição inicial antes de digitar nada, pra não jogar milhares
  // de nomes na tela de uma vez; assim que tem termo de busca, mostra tudo
  // que bate, sem limite), mas também aceita digitar um nome que ainda não
  // existe — nesse caso o server action cria o cliente na hora (ligado ao
  // Parceiro escolhido ao lado), sem precisar ir cadastrar em outra tela
  // primeiro. É assim que uma Consulta de CPF de alguém novo vira cliente de
  // verdade: nome completo + CPF preenchidos aqui já bastam.
  const [clienteId, setClienteId] = useState(a?.cliente_id ?? "");
  const [buscaCliente, setBuscaCliente] = useState(clienteAtual?.nome ?? "");
  const [listaClienteAberta, setListaClienteAberta] = useState(false);
  const [parceiroId, setParceiroId] = useState(a?.parceiro_id ?? "");
  const telefoneRef = useRef<HTMLInputElement>(null);
  const cpfRef = useRef<HTMLInputElement>(null);

  // Análise de crédito conjunta (cônjuge, por exemplo): além do cliente
  // titular acima, aceita adicionar outros clientes à avaliação — mesmo
  // padrão de "proprietarios" em imovel-form.tsx (lista client-side + campos
  // ocultos repetidos, sincronizada de vez no servidor ao salvar).
  const [cotitulares, setCotitulares] = useState<Cliente[]>(cotitularesIniciais ?? []);
  const [buscaCotitular, setBuscaCotitular] = useState("");
  const [listaCotitularAberta, setListaCotitularAberta] = useState(false);

  const clientesFiltrados = useMemo(() => {
    const t = buscaCliente.trim().toLowerCase();
    if (!t) return clientes.slice(0, 50);
    return clientes.filter((c) => c.nome.toLowerCase().includes(t));
  }, [buscaCliente, clientes]);

  const cotitularesFiltrados = useMemo(() => {
    const t = buscaCotitular.trim().toLowerCase();
    const idsExcluidos = new Set([clienteId, ...cotitulares.map((c) => c.id)].filter(Boolean));
    const disponiveis = clientes.filter((c) => !idsExcluidos.has(c.id));
    if (!t) return disponiveis.slice(0, 30);
    return disponiveis.filter((c) => c.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [buscaCotitular, clientes, cotitulares, clienteId]);

  function adicionarCotitular(c: Cliente) {
    setCotitulares((atual) => [...atual, c]);
    setBuscaCotitular("");
    setListaCotitularAberta(false);
  }

  function removerCotitular(id: string) {
    setCotitulares((atual) => atual.filter((c) => c.id !== id));
  }

  // Selecionar um cliente já cadastrado preenche Parceiro responsável,
  // Telefone e CPF direto do cadastro dele — evita redigitar o que já existe.
  function selecionarCliente(c: Cliente) {
    setClienteId(c.id);
    setBuscaCliente(c.nome);
    setListaClienteAberta(false);
    if (c.parceiro_id) setParceiroId(c.parceiro_id);
    if (c.telefone && telefoneRef.current) telefoneRef.current.value = formatTelefone(c.telefone);
    if (c.cpf && cpfRef.current) cpfRef.current.value = formatCpf(c.cpf);
  }

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    if (status === "Consulta de CPF") {
      const cpfDigitado = new FormData(e.currentTarget).get("cpf");
      const nomeOk = clienteId.length > 0 || buscaCliente.trim().length > 0;
      const cpfOk = typeof cpfDigitado === "string" && cpfDigitado.replace(/\D/g, "").length >= 11;
      if (!nomeOk || !cpfOk) {
        e.preventDefault();
        alert("Consulta de CPF precisa do nome completo e do CPF preenchidos — é o que vai pro banco de dados ligado ao parceiro.");
      }
    }
  }

  if (a && !modoEdicao) {
    return (
      <Ficha
        avaliacao={a}
        clienteNome={clienteAtual?.nome ?? null}
        cotitulares={cotitularesIniciais ?? []}
        bancoNome={bancoAtual?.nome ?? null}
        parceiroNome={parceiroAtual?.nome ?? null}
        onEditar={() => setModoEdicao(true)}
        actionApagar={actionApagar}
        podeApagar={podeApagar}
      />
    );
  }

  const consultaCpf = status === "Consulta de CPF";

  return (
    <form action={action} onSubmit={aoEnviar} className="flex flex-col gap-4">
      {a && <input type="hidden" name="avaliacaoId" value={a.id} />}
      <input type="hidden" name="cliente_id" value={clienteId} />
      <input type="hidden" name="cliente_nome_busca" value={buscaCliente} />
      {cotitulares.map((c) => (
        <input key={c.id} type="hidden" name="cotitular_id" value={c.id} />
      ))}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Cliente e parceiro</div>
        {consultaCpf && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
            Consulta de CPF é só pra ver se o nome tá limpo — precisa do nome completo e do CPF. Preenchendo os dois,
            o cliente já é cadastrado no banco de dados, ligado ao parceiro escolhido ao lado.
          </p>
        )}
        <div className="grid md:grid-cols-2 gap-3">
          <div className="relative">
            <label className={LABEL}>Cliente {consultaCpf && <span className="text-amber-600">*</span>}</label>
            <input
              className={CAMPO}
              placeholder="Digite o nome — se não existir, é criado ao salvar"
              value={buscaCliente}
              onChange={(e) => {
                setBuscaCliente(e.target.value);
                setClienteId("");
                setListaClienteAberta(true);
              }}
              onFocus={() => setListaClienteAberta(true)}
              onBlur={() => setTimeout(() => setListaClienteAberta(false), 150)}
            />
            {!clienteId && buscaCliente.trim().length > 0 && (
              <p className="text-[11px] text-gray-400 mt-1">Nenhum cliente selecionado — esse nome vai criar um cadastro novo.</p>
            )}
            {listaClienteAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                {clientesFiltrados.length === 0 && <p className="text-xs text-gray-400 p-3">Nenhum cliente encontrado.</p>}
                {clientesFiltrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => selecionarCliente(c)}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {c.nome}
                    {c.cpf ? ` — ${formatCpf(c.cpf)}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className={LABEL}>Parceiro responsável</label>
            <select className={CAMPO} name="parceiro_id" value={parceiroId} onChange={(e) => setParceiroId(e.target.value)}>
              <option value="">—</option>
              {parceiros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Telefone</label>
            <input
              ref={telefoneRef}
              className={CAMPO}
              name="telefone"
              placeholder="(69) 99999-9999"
              defaultValue={a?.telefone ? formatTelefone(a.telefone) : ""}
            />
          </div>
          <div>
            <label className={LABEL}>CPF {consultaCpf && <span className="text-amber-600">*</span>}</label>
            <input
              ref={cpfRef}
              className={CAMPO}
              name="cpf"
              placeholder="000.000.000-00"
              defaultValue={a?.cpf ? formatCpf(a.cpf) : ""}
            />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100">
          <label className={LABEL}>
            Co-titulares (cônjuge / análise conjunta){" "}
            <span className="text-[11px] text-gray-400 font-normal">— opcional, quando o crédito é analisado em conjunto</span>
          </label>
          {cotitulares.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {cotitulares.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5"
                >
                  <span className="text-xs text-gray-800 font-medium">{c.nome}</span>
                  <button
                    type="button"
                    onClick={() => removerCotitular(c.id)}
                    className="text-[11px] text-red-600 hover:underline font-semibold"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <input
              className={CAMPO}
              placeholder="Buscar cliente já cadastrado para adicionar..."
              value={buscaCotitular}
              onChange={(e) => {
                setBuscaCotitular(e.target.value);
                setListaCotitularAberta(true);
              }}
              onFocus={() => setListaCotitularAberta(true)}
              onBlur={() => setTimeout(() => setListaCotitularAberta(false), 150)}
            />
            {listaCotitularAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                {cotitularesFiltrados.length === 0 && <p className="text-xs text-gray-400 p-3">Nenhum cliente encontrado.</p>}
                {cotitularesFiltrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => adicionarCotitular(c)}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {c.nome}
                    {c.cpf ? ` — ${formatCpf(c.cpf)}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Avaliação</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Status</label>
            <select className={CAMPO} name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_AVALIACAO_OPCOES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Tipo de avaliação</label>
            <select className={CAMPO} name="tipo_avaliacao" defaultValue={a?.tipo_avaliacao ?? ""}>
              <option value="">—</option>
              {TIPO_AVALIACAO_OPCOES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Banco</label>
            <select className={CAMPO} name="banco_id" defaultValue={a?.banco_id ?? ""}>
              <option value="">—</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Data da avaliação</label>
            <input type="date" className={CAMPO} name="data_avaliacao" defaultValue={inputDate(a?.data_avaliacao ?? null)} />
          </div>
          <div>
            <label className={LABEL}>Data de validade</label>
            <input type="date" className={CAMPO} name="data_validade" defaultValue={inputDate(a?.data_validade ?? null)} />
          </div>
          <div>
            <label className={LABEL}>Tipo de imóvel</label>
            <select className={CAMPO} name="tipo_imovel" defaultValue={a?.tipo_imovel ?? ""}>
              <option value="">—</option>
              {TIPO_IMOVEL_AVALIACAO_OPCOES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Produto</label>
            <select className={CAMPO} name="produto" defaultValue={a?.produto ?? ""}>
              <option value="">—</option>
              {PRODUTO_AVALIACAO_OPCOES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Tabela</label>
            <select className={CAMPO} name="tabela" defaultValue={a?.tabela ?? ""}>
              <option value="">—</option>
              {TABELA_AVALIACAO_OPCOES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Indexador</label>
            <select className={CAMPO} name="indexador" defaultValue={a?.indexador ?? ""}>
              <option value="">—</option>
              {INDEXADOR_AVALIACAO_OPCOES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Valores</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Valor aprovado</label>
            <input className={CAMPO} name="valor_aprovado" placeholder="0,00" defaultValue={formatValorEditavel(a?.valor_aprovado)} />
          </div>
          <div>
            <label className={LABEL}>Valor de financiamento</label>
            <input
              className={CAMPO}
              name="valor_financiamento"
              placeholder="0,00"
              defaultValue={formatValorEditavel(a?.valor_financiamento)}
            />
          </div>
          <div>
            <label className={LABEL}>Prestação</label>
            <input className={CAMPO} name="prestacao" placeholder="0,00" defaultValue={formatValorEditavel(a?.prestacao)} />
          </div>
          <div className="flex items-center gap-2 mt-5">
            <input
              type="checkbox"
              id="usa_fgts"
              name="usa_fgts"
              defaultChecked={a?.usa_fgts ?? false}
              onChange={(e) => setUsaFgts(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="usa_fgts" className="text-xs text-gray-700">
              Usa FGTS?
            </label>
          </div>
          <div className={usaFgts ? "md:col-span-2" : "hidden"}>
            <label className={LABEL}>Valor FGTS</label>
            <input className={CAMPO} name="valor_fgts" placeholder="0,00" defaultValue={formatValorEditavel(a?.valor_fgts)} />
          </div>
          <div className="flex items-center gap-2 mt-5">
            <input
              type="checkbox"
              id="usa_subsidio"
              name="usa_subsidio"
              defaultChecked={a?.usa_subsidio ?? false}
              onChange={(e) => setUsaSubsidio(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="usa_subsidio" className="text-xs text-gray-700">
              Usa subsídio?
            </label>
          </div>
          <div className={usaSubsidio ? "md:col-span-2" : "hidden"}>
            <label className={LABEL}>Valor subsídio</label>
            <input className={CAMPO} name="valor_subsidio" placeholder="0,00" defaultValue={formatValorEditavel(a?.valor_subsidio)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Imagem da consulta e observações</div>
        <div className="flex flex-col gap-3">
          <div>
            <label className={LABEL}>
              Link da imagem da consulta {consultaCpf && <span className="text-[11px] text-gray-400 font-normal">— print do resultado da Consulta de CPF</span>}
            </label>
            <input
              className={CAMPO}
              name="imagem_consulta_url"
              placeholder="https://..."
              defaultValue={a?.imagem_consulta_url ?? ""}
            />
          </div>
          <div>
            <label className={LABEL}>Observação</label>
            <textarea className={CAMPO + " min-h-20"} name="observacao" defaultValue={a?.observacao ?? ""} />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {a && (
          <button
            type="button"
            onClick={() => setModoEdicao(false)}
            className="border border-gray-300 text-gray-700 rounded-lg px-5 py-2 text-sm font-semibold hover:bg-gray-50"
          >
            Cancelar
          </button>
        )}
        <button type="submit" className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90">
          {a ? "Salvar alterações" : "Cadastrar avaliação"}
        </button>
      </div>
    </form>
  );
}
