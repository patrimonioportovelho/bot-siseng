"use client";

import { useState, type ReactNode } from "react";
import {
  STATUS_ANDAMENTO_OPCOES,
  STATUS_ANDAMENTO_COM_OPCOES,
  TIPO_CONTRATO_ANDAMENTO_OPCOES
} from "@/lib/financiamento/opcoes";
import { formatMoeda, formatDataCalendario, formatValorEditavel } from "@/lib/format";

type Cliente = { id: string; nome: string };
type Imovel = { id: string; endereco: string | null };

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
  imovelEndereco,
  onEditar
}: {
  andamento: AndamentoExistente;
  clienteVendedorNome: string | null;
  imovelEndereco: string | null;
  onEditar: () => void;
}) {
  const n = andamento;

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
      <Cartao titulo="Andamento" acao={BotaoEditar}>
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Status" valor={n.status_andamento} />
          <Linha label="Status complementar" valor={n.status_andamento_complementar} />
          <Linha label="Data de início" valor={formatDataCalendario(n.data_inicio)} />
          <Linha label="Data de conclusão" valor={formatDataCalendario(n.data_conclusao)} />
          <Linha label="Tipo de contrato" valor={n.tipo_contrato} />
          <Linha label="Processo" valor={n.processo} />
          <Linha label="Imóvel" valor={imovelEndereco} />
          <Linha label="Cliente vendedor" valor={clienteVendedorNome} />
          <Linha label="Abrir conta?" valor={n.abrir_conta ? "Sim" : "Não"} />
        </div>
      </Cartao>

      <Cartao titulo="Valores">
        <div className="grid md:grid-cols-3 gap-3">
          <Linha label="Valor avaliado" valor={formatMoeda(n.valor_avaliado)} />
          <Linha label="Valor de venda" valor={formatMoeda(n.valor_venda)} />
          <Linha label="Valor financiado" valor={formatMoeda(n.valor_financiado)} />
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
  actionCriar,
  actionAtualizar
}: {
  andamento: AndamentoExistente | null;
  avaliacaoId: string;
  clientes: Cliente[];
  imoveis: Imovel[];
  actionCriar: (formData: FormData) => void;
  actionAtualizar: (formData: FormData) => void;
}) {
  const n = andamento;
  const [modoEdicao, setModoEdicao] = useState(!n);
  const [statusAndamento, setStatusAndamento] = useState(n?.status_andamento ?? "Pendente");

  const clienteVendedorAtual = n ? clientes.find((c) => c.id === n.cliente_vendedor_id) ?? null : null;
  const imovelAtual = n ? imoveis.find((i) => i.id === n.imovel_id) ?? null : null;

  if (n && !modoEdicao) {
    return (
      <Ficha
        andamento={n}
        clienteVendedorNome={clienteVendedorAtual?.nome ?? null}
        imovelEndereco={imovelAtual?.endereco ?? null}
        onEditar={() => setModoEdicao(true)}
      />
    );
  }

  const complementaresSugeridos = STATUS_ANDAMENTO_COM_OPCOES[statusAndamento] ?? [];

  return (
    <form action={n ? actionAtualizar : actionCriar} className="flex flex-col gap-4">
      {n ? <input type="hidden" name="andamentoId" value={n.id} /> : <input type="hidden" name="avaliacaoId" value={avaliacaoId} />}

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
            <input className={CAMPO} name="processo" defaultValue={n?.processo ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Imóvel</label>
            <select className={CAMPO} name="imovel_id" defaultValue={n?.imovel_id ?? ""}>
              <option value="">—</option>
              {imoveis.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.endereco ?? "Imóvel sem endereço"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Cliente vendedor</label>
            <select className={CAMPO} name="cliente_vendedor_id" defaultValue={n?.cliente_vendedor_id ?? ""}>
              <option value="">—</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
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
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Valor avaliado</label>
            <input className={CAMPO} name="valor_avaliado" placeholder="0,00" defaultValue={formatValorEditavel(n?.valor_avaliado)} />
          </div>
          <div>
            <label className={LABEL}>Valor de venda</label>
            <input className={CAMPO} name="valor_venda" placeholder="0,00" defaultValue={formatValorEditavel(n?.valor_venda)} />
          </div>
          <div>
            <label className={LABEL}>Valor financiado</label>
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
