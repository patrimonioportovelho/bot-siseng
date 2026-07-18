"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  STATUS_ANDAMENTO_OPCOES,
  STATUS_ANDAMENTO_COM_OPCOES,
  TIPO_CONTRATO_ANDAMENTO_OPCOES
} from "@/lib/financiamento/opcoes";
import { formatMoeda, formatDataCalendario, formatValorEditavel, formatInscricao, formatProcesso } from "@/lib/format";

type Cliente = { id: string; nome: string };
type Imovel = {
  id: string;
  endereco: string | null;
  inscricao: string | null;
  proprietarios: { id: string; nome: string }[];
};

type AndamentoExistente = {
  id: string;
  id_legado: string | null;
  data_inicio: Date | null;
  cliente_vendedor_id: string | null;
  abrir_conta: boolean | null;
  imovel_id: string | null;
  tipo_contrato: string | null;
  status_andamento: string;
  status_andamento_complementar: string | null;
  processo: string | null;
  valor_avaliado: unknown;
  valor_venda: unknown;
  tem_entrada: boolean | null;
  valor_recurso: unknown;
  valor_fgts: unknown;
  subsidio: unknown;
  valor_financiado: unknown;
  observacao: string | null;
  data_conclusao: Date | null;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function labelImovel(i: Imovel): string {
  const insc = formatInscricao(i.inscricao);
  const qtdProprietarios = i.proprietarios.length > 1 ? `${i.proprietarios.length} proprietários` : null;
  const partes = [i.endereco ?? "(sem endereço)", insc ? `Insc. ${insc}` : null, qtdProprietarios].filter(Boolean);
  return partes.join(" — ");
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
  andamento,
  clienteVendedorNome,
  imovelLabel,
  valorAprovadoCliente,
  onEditar,
  actionApagar,
  podeApagar
}: {
  andamento: AndamentoExistente;
  clienteVendedorNome: string | null;
  imovelLabel: string | null;
  valorAprovadoCliente: unknown;
  onEditar: () => void;
  actionApagar?: (formData: FormData) => void;
  podeApagar?: boolean;
}) {
  const n = andamento;

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
          <input type="hidden" name="andamentoId" value={n.id} />
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
      <Cartao titulo="Andamento" acao={BotaoEditar}>
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Status" valor={n.status_andamento} />
          <Linha label="Status complementar" valor={n.status_andamento_complementar} />
          <Linha label="Data de início" valor={formatDataCalendario(n.data_inicio)} />
          <Linha label="Data de conclusão" valor={formatDataCalendario(n.data_conclusao)} />
          <Linha label="Tipo de contrato" valor={n.tipo_contrato} />
          <Linha label="Processo" valor={formatProcesso(n.processo)} />
          <Linha label="Imóvel" valor={imovelLabel} />
          <Linha label="Cliente vendedor" valor={clienteVendedorNome} />
          <Linha label="Abrir conta?" valor={n.abrir_conta ? "Sim" : "Não"} />
        </div>
      </Cartao>

      <Cartao titulo="Valores">
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-3 text-[11px] text-indigo-700">
          Valor aprovado ao cliente (capacidade de crédito na Avaliação):{" "}
          <span className="font-semibold">{formatMoeda(valorAprovadoCliente)}</span> — o cliente pode não usar esse
          valor todo neste imóvel, por isso o "Valor financiado" abaixo é específico deste Andamento.
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Linha label="Valor avaliado (do imóvel)" valor={formatMoeda(n.valor_avaliado)} />
          <Linha label="Valor de venda" valor={formatMoeda(n.valor_venda)} />
          <Linha label="Valor financiado neste imóvel" valor={formatMoeda(n.valor_financiado)} />
          <Linha label="Tem entrada?" valor={n.tem_entrada ? "Sim" : "Não"} />
          <Linha label="Valor recurso" valor={formatMoeda(n.valor_recurso)} />
          <Linha label="Valor FGTS" valor={formatMoeda(n.valor_fgts)} />
          <Linha label="Subsídio" valor={formatMoeda(n.subsidio)} />
        </div>
      </Cartao>

      <Cartao titulo="Observações">
        <p className="text-xs text-gray-700 whitespace-pre-wrap">{n.observacao || "—"}</p>
      </Cartao>
    </div>
  );
}

export function AndamentoForm({
  andamento,
  avaliacaoId,
  clientes,
  imoveis,
  valorAprovadoCliente,
  actionCriar,
  actionAtualizar,
  actionApagar,
  podeApagar
}: {
  andamento: AndamentoExistente | null;
  avaliacaoId: string;
  clientes: Cliente[];
  imoveis: Imovel[];
  valorAprovadoCliente: unknown;
  actionCriar: (formData: FormData) => void;
  actionAtualizar: (formData: FormData) => void;
  actionApagar?: (formData: FormData) => void;
  podeApagar?: boolean;
}) {
  const n = andamento;
  const [modoEdicao, setModoEdicao] = useState(!n);
  const [statusAndamento, setStatusAndamento] = useState(n?.status_andamento ?? "Pendente");

  // Cliente vendedor e Imóvel andam juntos (mesmo padrão de
  // components/administracao-form.tsx): escolhe o vendedor primeiro e a
  // busca de imóvel já filtra pelos imóveis vinculados a ele como
  // proprietário, mas continua dando pra buscar livremente por endereço
  // (por exemplo pra achar um imóvel de outro proprietário).
  const clienteVendedorInicial = n ? clientes.find((c) => c.id === n.cliente_vendedor_id) ?? null : null;
  const [clienteVendedorId, setClienteVendedorId] = useState(n?.cliente_vendedor_id ?? "");
  const [buscaClienteVendedor, setBuscaClienteVendedor] = useState(clienteVendedorInicial?.nome ?? "");
  const [listaClienteVendedorAberta, setListaClienteVendedorAberta] = useState(false);

  const imovelInicial = n ? imoveis.find((i) => i.id === n.imovel_id) ?? null : null;
  const [imovelId, setImovelId] = useState(n?.imovel_id ?? "");
  const [buscaImovel, setBuscaImovel] = useState(imovelInicial ? labelImovel(imovelInicial) : "");
  const [listaImovelAberta, setListaImovelAberta] = useState(false);

  const clientesFiltrados = useMemo(() => {
    const t = buscaClienteVendedor.trim().toLowerCase();
    if (!t) return clientes.slice(0, 30);
    return clientes.filter((c) => c.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [buscaClienteVendedor, clientes]);

  const imoveisDoVendedor = useMemo(() => {
    if (!clienteVendedorId) return imoveis;
    return imoveis.filter((i) => i.proprietarios.some((p) => p.id === clienteVendedorId));
  }, [clienteVendedorId, imoveis]);

  const imoveisFiltrados = useMemo(() => {
    const t = buscaImovel.trim().toLowerCase();
    if (!t) return imoveisDoVendedor.slice(0, 30);
    return imoveisDoVendedor
      .filter((i) => (i.endereco ?? "").toLowerCase().includes(t) || (i.inscricao ?? "").toLowerCase().includes(t))
      .slice(0, 30);
  }, [buscaImovel, imoveisDoVendedor]);

  function selecionarClienteVendedor(c: Cliente) {
    setClienteVendedorId(c.id);
    setBuscaClienteVendedor(c.nome);
    setListaClienteVendedorAberta(false);
    // Se o imóvel já escolhido não pertence a esse vendedor, limpa a escolha
    // pra forçar selecionar um dos imóveis vinculados a ele (mas continua
    // podendo digitar e buscar livre se for de outro proprietário).
    const imovelAtual = imoveis.find((i) => i.id === imovelId);
    if (imovelAtual && !imovelAtual.proprietarios.some((p) => p.id === c.id)) {
      setImovelId("");
      setBuscaImovel("");
    }
  }

  function selecionarImovel(i: Imovel) {
    setImovelId(i.id);
    setBuscaImovel(labelImovel(i));
    setListaImovelAberta(false);
  }

  const imovelAtualParaFicha = n ? imoveis.find((i) => i.id === n.imovel_id) ?? null : null;
  const clienteVendedorAtualParaFicha = n ? clientes.find((c) => c.id === n.cliente_vendedor_id) ?? null : null;

  if (n && !modoEdicao) {
    return (
      <Ficha
        andamento={n}
        clienteVendedorNome={clienteVendedorAtualParaFicha?.nome ?? null}
        imovelLabel={imovelAtualParaFicha ? labelImovel(imovelAtualParaFicha) : null}
        valorAprovadoCliente={valorAprovadoCliente}
        onEditar={() => setModoEdicao(true)}
        actionApagar={actionApagar}
        podeApagar={podeApagar}
      />
    );
  }

  const complementaresSugeridos = STATUS_ANDAMENTO_COM_OPCOES[statusAndamento] ?? [];

  return (
    <form action={n ? actionAtualizar : actionCriar} className="flex flex-col gap-4">
      {n ? <input type="hidden" name="andamentoId" value={n.id} /> : <input type="hidden" name="avaliacaoId" value={avaliacaoId} />}
      <input type="hidden" name="cliente_vendedor_id" value={clienteVendedorId} />
      <input type="hidden" name="imovel_id" value={imovelId} />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Andamento</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Status</label>
            <select
              className={CAMPO}
              name="status_andamento"
              value={statusAndamento}
              onChange={(e) => setStatusAndamento(e.target.value)}
            >
              {STATUS_ANDAMENTO_OPCOES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Status complementar</label>
            <input
              className={CAMPO}
              name="status_andamento_complementar"
              list="status-complementar-opcoes"
              defaultValue={n?.status_andamento_complementar ?? ""}
              placeholder="Opcional — detalhe do status acima"
            />
            <datalist id="status-complementar-opcoes">
              {complementaresSugeridos.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={LABEL}>Data de início</label>
            <input type="date" className={CAMPO} name="data_inicio" defaultValue={inputDate(n?.data_inicio ?? null)} />
          </div>
          <div>
            <label className={LABEL}>Data de conclusão</label>
            <input type="date" className={CAMPO} name="data_conclusao" defaultValue={inputDate(n?.data_conclusao ?? null)} />
          </div>
          <div>
            <label className={LABEL}>Tipo de contrato</label>
            <select className={CAMPO} name="tipo_contrato" defaultValue={n?.tipo_contrato ?? ""}>
              <option value="">—</option>
              {TIPO_CONTRATO_ANDAMENTO_OPCOES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Processo</label>
            <input
              className={CAMPO}
              name="processo"
              placeholder="1.2345.6789012-3"
              defaultValue={formatProcesso(n?.processo)}
            />
          </div>
          <div className="relative">
            <label className={LABEL}>Cliente vendedor</label>
            <input
              className={CAMPO}
              placeholder="Digite para buscar..."
              value={buscaClienteVendedor}
              onChange={(e) => {
                setBuscaClienteVendedor(e.target.value);
                setClienteVendedorId("");
                setListaClienteVendedorAberta(true);
              }}
              onFocus={() => setListaClienteVendedorAberta(true)}
              onBlur={() => setTimeout(() => setListaClienteVendedorAberta(false), 150)}
            />
            {listaClienteVendedorAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                {clientesFiltrados.length === 0 && <p className="text-xs text-gray-400 p-3">Nenhum cliente encontrado.</p>}
                {clientesFiltrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => selecionarClienteVendedor(c)}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {c.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <label className={LABEL}>Imóvel</label>
            {clienteVendedorId && (
              <p className="text-[11px] text-gray-400 mb-1">Mostrando só os imóveis vinculados a esse vendedor — pode buscar por endereço se for outro.</p>
            )}
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
          </div>
          <div className="flex items-center gap-2 mt-5">
            <input type="checkbox" id="abrir_conta" name="abrir_conta" defaultChecked={n?.abrir_conta ?? false} className="h-4 w-4" />
            <label htmlFor="abrir_conta" className="text-xs text-gray-700">
              Abrir conta?
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Valores</div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-3 text-[11px] text-indigo-700">
          Valor aprovado ao cliente (capacidade de crédito na Avaliação):{" "}
          <span className="font-semibold">{formatMoeda(valorAprovadoCliente)}</span> — o cliente pode não usar esse
          valor todo neste imóvel, por isso o campo "Valor financiado" abaixo é específico deste Andamento.
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Valor avaliado (do imóvel)</label>
            <input className={CAMPO} name="valor_avaliado" placeholder="0,00" defaultValue={formatValorEditavel(n?.valor_avaliado)} />
          </div>
          <div>
            <label className={LABEL}>Valor de venda</label>
            <input className={CAMPO} name="valor_venda" placeholder="0,00" defaultValue={formatValorEditavel(n?.valor_venda)} />
          </div>
          <div>
            <label className={LABEL}>Valor financiado neste imóvel</label>
            <input
              className={CAMPO}
              name="valor_financiado"
              placeholder="0,00"
              defaultValue={formatValorEditavel(n?.valor_financiado)}
            />
          </div>
          <div className="flex items-center gap-2 mt-5">
            <input type="checkbox" id="tem_entrada" name="tem_entrada" defaultChecked={n?.tem_entrada ?? false} className="h-4 w-4" />
            <label htmlFor="tem_entrada" className="text-xs text-gray-700">
              Tem entrada?
            </label>
          </div>
          <div>
            <label className={LABEL}>Valor recurso</label>
            <input className={CAMPO} name="valor_recurso" placeholder="0,00" defaultValue={formatValorEditavel(n?.valor_recurso)} />
          </div>
          <div>
            <label className={LABEL}>Valor FGTS</label>
            <input className={CAMPO} name="valor_fgts" placeholder="0,00" defaultValue={formatValorEditavel(n?.valor_fgts)} />
          </div>
          <div>
            <label className={LABEL}>Subsídio</label>
            <input className={CAMPO} name="subsidio" placeholder="0,00" defaultValue={formatValorEditavel(n?.subsidio)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Observações</div>
        <textarea className={CAMPO + " min-h-20"} name="observacao" defaultValue={n?.observacao ?? ""} />
      </div>

      <div className="flex justify-end gap-2">
        {n && (
          <button
            type="button"
            onClick={() => setModoEdicao(false)}
            className="border border-gray-300 text-gray-700 rounded-lg px-5 py-2 text-sm font-semibold hover:bg-gray-50"
          >
            Cancelar
          </button>
        )}
        <button type="submit" className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90">
          {n ? "Salvar alterações" : "Iniciar andamento"}
        </button>
      </div>
    </form>
  );
}
