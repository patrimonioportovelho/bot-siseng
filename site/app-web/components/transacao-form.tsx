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
  FUNCOES_CORRETOR
} from "@/lib/transacoes/opcoes";
import { STATUS_TRANSACAO_TODOS } from "@/lib/format";
import { formatValorEditavel, formatPercentual, formatInscricao } from "@/lib/format";

type ClienteOpcao = { id: string; nome: string; id_legado: string | null };
type LojaOpcao = { id: string; nome: string };
type ParceiroOpcao = { id: string; nome: string; funcao: string | null };
type ImovelOpcao = {
  id: string;
  id_legado: string | null;
  endereco: string | null;
  inscricao: string | null;
  proprietarios: { id: string; nome: string }[];
};

type TransacaoExistente = {
  id: string;
  id_legado: string | null;
  tipo: string;
  loja_id: string;
  imovel_id: string | null;
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

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function labelImovel(i: ImovelOpcao): string {
  const insc = formatInscricao(i.inscricao);
  const qtdProprietarios = i.proprietarios.length > 1 ? `${i.proprietarios.length} proprietários` : null;
  const partes = [i.endereco ?? "(sem endereço)", insc ? `Insc. ${insc}` : null, qtdProprietarios].filter(Boolean);
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
  interessadosIniciais,
  action
}: {
  transacao: TransacaoExistente | null;
  lojas: LojaOpcao[];
  clientes: ClienteOpcao[];
  imoveis: ImovelOpcao[];
  parceiros: ParceiroOpcao[];
  interessadosIniciais: ClienteOpcao[];
  action: (formData: FormData) => void;
}) {
  const t = transacao;

  const [tipo, setTipo] = useState(t?.tipo ?? "Locação");
  const eLocacao = tipo === "Locação";

  const imovelInicial = imoveis.find((i) => i.id === t?.imovel_id) ?? null;
  const [imovelId, setImovelId] = useState(t?.imovel_id ?? "");
  const [buscaImovel, setBuscaImovel] = useState(imovelInicial ? labelImovel(imovelInicial) : "");
  const [listaImovelAberta, setListaImovelAberta] = useState(false);

  // O(s) Cliente(s) Proprietário(s) não é escolhido aqui — vem direto do
  // cadastro do Imóvel (proprietários vinculados lá). Só exibe pra
  // conferência; quem precisar mudar o proprietário, muda no Imóvel.
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

  const corretores = useMemo(() => parceiros.filter((p) => FUNCOES_CORRETOR.includes(p.funcao ?? "")), [parceiros]);

  const imoveisFiltrados = useMemo(() => {
    const b = buscaImovel.trim().toLowerCase();
    if (!b) return imoveis.slice(0, 30);
    return imoveis
      .filter((i) => (i.endereco ?? "").toLowerCase().includes(b) || (i.inscricao ?? "").toLowerCase().includes(b))
      .slice(0, 30);
  }, [buscaImovel, imoveis]);

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
  }

  function adicionarInteressado(c: ClienteOpcao) {
    setInteressados((atual) => [...atual, c]);
    setBuscaInteressado("");
    setListaInteressadoAberta(false);
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
      {interessados.map((c) => (
        <input key={c.id} type="hidden" name="interessado_id" value={c.id} />
      ))}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Identificação</div>
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
            <input
              className={CAMPO}
              name="status"
              list="status-transacao-opcoes"
              defaultValue={t?.status ?? ""}
              placeholder="Digite ou escolha..."
            />
            <datalist id="status-transacao-opcoes">
              {STATUS_TRANSACAO_TODOS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
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
            <label className={LABEL}>Imóvel</label>
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
            {imovelId && (
              <p className="text-[11px] text-gray-500 mt-1.5">
                {proprietariosDoImovel.length > 0 ? (
                  <>
                    Proprietário{proprietariosDoImovel.length > 1 ? "s" : ""}:{" "}
                    {proprietariosDoImovel.map((p) => p.nome).join(", ")}
                  </>
                ) : (
                  "Este imóvel não tem proprietário cadastrado — cadastre em Imóveis antes de gerar contrato."
                )}
              </p>
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
              defaultValue={inputDate(t?.data_assinatura ?? null)}
            />
          </div>
          <div>
            <label className={LABEL}>Valor da transação (R$)</label>
            <input
              className={CAMPO}
              name="valor_transacao"
              placeholder="350.000,00"
              defaultValue={formatValorEditavel(t?.valor_transacao)}
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
                defaultValue={t?.prazo_contrato_meses ?? ""}
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Usado para calcular o Prazo restante (Data de assinatura + esse prazo).
              </p>
            </div>
          )}
          {eLocacao && (
            <div>
              <label className={LABEL}>Data de vencimento (fim do contrato)</label>
              <input
                type="date"
                className={CAMPO}
                name="data_vencimento"
                defaultValue={inputDate(t?.data_vencimento ?? null)}
              />
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

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Comissionamento</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Corretor do proprietário</label>
            <select className={CAMPO} name="corretor_proprietario_id" defaultValue={t?.corretor_proprietario_id ?? ""}>
              <option value="">—</option>
              {corretores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Corretor da contraparte</label>
            <select className={CAMPO} name="corretor_contraparte_id" defaultValue={t?.corretor_contraparte_id ?? ""}>
              <option value="">—</option>
              {corretores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
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
              defaultValue={formatPercentual(t?.porc_honorario)}
            />
          </div>
          <div>
            <label className={LABEL}>% corretor do proprietário</label>
            <input
              className={CAMPO}
              name="porc_corretor_proprietario"
              placeholder="50"
              defaultValue={formatPercentual(t?.porc_corretor_proprietario)}
            />
          </div>
          <div>
            <label className={LABEL}>% corretor da contraparte</label>
            <input
              className={CAMPO}
              name="porc_corretor_contraparte"
              placeholder="0"
              defaultValue={formatPercentual(t?.porc_corretor_contraparte)}
            />
          </div>
          <div>
            <label className={LABEL}>% imobiliária</label>
            <input
              className={CAMPO}
              name="porc_imobiliaria"
              placeholder="50"
              defaultValue={formatPercentual(t?.porc_imobiliaria)}
            />
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
              <label className={LABEL}>% da parceria</label>
              <input
                className={CAMPO}
                name="porc_parceria"
                placeholder="20"
                defaultValue={formatPercentual(t?.porc_parceria)}
              />
            </div>
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
