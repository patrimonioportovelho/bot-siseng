"use client";

import { useState, type ReactNode } from "react";
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
type Cliente = { id: string; nome: string; cpf: string | null };

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
  bancoNome,
  parceiroNome,
  onEditar
}: {
  avaliacao: AvaliacaoExistente;
  clienteNome: string | null;
  bancoNome: string | null;
  parceiroNome: string | null;
  onEditar: () => void;
}) {
  const a = avaliacao;

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
      <Cartao titulo="Cliente e parceiro" acao={BotaoEditar}>
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Cliente" valor={clienteNome} />
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
  bancos,
  parceiros,
  action
}: {
  avaliacao: AvaliacaoExistente | null;
  clientes: Cliente[];
  bancos: Banco[];
  parceiros: Parceiro[];
  action: (formData: FormData) => void;
}) {
  const a = avaliacao;
  // Cadastro novo já nasce em edição; cadastro existente abre em modo
  // visualização (Ficha), mesmo padrão do ParceiroForm.
  const [modoEdicao, setModoEdicao] = useState(!a);
  const [usaFgts, setUsaFgts] = useState(a?.usa_fgts ?? false);
  const [usaSubsidio, setUsaSubsidio] = useState(a?.usa_subsidio ?? false);

  const clienteAtual = a ? clientes.find((c) => c.id === a.cliente_id) ?? null : null;
  const bancoAtual = a ? bancos.find((b) => b.id === a.banco_id) ?? null : null;
  const parceiroAtual = a ? parceiros.find((p) => p.id === a.parceiro_id) ?? null : null;

  if (a && !modoEdicao) {
    return (
      <Ficha
        avaliacao={a}
        clienteNome={clienteAtual?.nome ?? null}
        bancoNome={bancoAtual?.nome ?? null}
        parceiroNome={parceiroAtual?.nome ?? null}
        onEditar={() => setModoEdicao(true)}
      />
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {a && <input type="hidden" name="avaliacaoId" value={a.id} />}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Cliente e parceiro</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Cliente</label>
            <select className={CAMPO} name="cliente_id" defaultValue={a?.cliente_id ?? ""}>
              <option value="">—</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.cpf ? ` — ${formatCpf(c.cpf)}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Parceiro responsável</label>
            <select className={CAMPO} name="parceiro_id" defaultValue={a?.parceiro_id ?? ""}>
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
              className={CAMPO}
              name="telefone"
              placeholder="(69) 99999-9999"
              defaultValue={a?.telefone ? formatTelefone(a.telefone) : ""}
            />
          </div>
          <div>
            <label className={LABEL}>CPF</label>
            <input className={CAMPO} name="cpf" placeholder="000.000.000-00" defaultValue={a?.cpf ? formatCpf(a.cpf) : ""} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Avaliação</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Status</label>
            <select className={CAMPO} name="status" defaultValue={a?.status ?? "Montagem de processo"}>
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
            <label className={LABEL}>Link da imagem da consulta</label>
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
