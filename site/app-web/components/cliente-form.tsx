"use client";

import { useState } from "react";
import {
  ESTADOS_CIVIS,
  TIPOS_CONTA,
  TIPOS_PIX,
  TIPOS_CLIENTE,
  SEXO_OPCOES,
  CAT_PROFISSAO_OPCOES
} from "@/lib/clientes/opcoes";
import { formatCpf, formatCnpj, formatTelefone, formatValorEditavel } from "@/lib/format";

type Loja = { id: string; nome: string };
type Banco = { id: string; nome: string };
type ParceiroOpcao = { id: string; nome: string };

type ClienteExistente = {
  id: string;
  nome: string;
  tipo_cliente: string;
  sexo: string | null;
  cpf: string | null;
  cnpj: string | null;
  rg: string | null;
  expedicao: string | null;
  telefone: string | null;
  email: string | null;
  estado_civil: string | null;
  renda_bruta: unknown;
  data_nascimento: Date | null;
  cat_profissao: string | null;
  tipo_servidor: string | null;
  profissao: string | null;
  endereco: string | null;
  observacao: string | null;
  parceiro_id: string | null;
  loja_id: string | null;
  banco_id: string | null;
  codigo_banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  tipo_pix: string | null;
  pix: string | null;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

export function ClienteForm({
  cliente,
  lojas,
  bancos,
  parceiros,
  action
}: {
  cliente: ClienteExistente | null;
  lojas: Loja[];
  bancos: Banco[];
  parceiros: ParceiroOpcao[];
  action: (formData: FormData) => void;
}) {
  const c = cliente;
  const [tipoCliente, setTipoCliente] = useState(c?.tipo_cliente ?? "");
  const mostrarCpf = tipoCliente !== "Pessoa Jurídica";
  const mostrarCnpj = tipoCliente !== "Pessoa Física";

  return (
    <form action={action} className="flex flex-col gap-5">
      {c && <input type="hidden" name="clienteId" value={c.id} />}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Identificação</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Nome completo</label>
            {c ? (
              <input className={CAMPO} value={c.nome} disabled />
            ) : (
              <input className={CAMPO} name="nome" required placeholder="Nome completo" />
            )}
          </div>
          <div>
            <label className={LABEL}>Tipo de cliente</label>
            <select
              className={CAMPO}
              name="tipo_cliente"
              value={tipoCliente}
              onChange={(e) => setTipoCliente(e.target.value)}
              required
            >
              <option value="" disabled>
                Selecione...
              </option>
              {TIPOS_CLIENTE.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {mostrarCpf && (
            <div>
              <label className={LABEL}>CPF</label>
              <input
                className={CAMPO}
                name="cpf"
                placeholder="000.000.000-00"
                defaultValue={c?.cpf ? formatCpf(c.cpf) : ""}
              />
            </div>
          )}
          {mostrarCnpj && (
            <div>
              <label className={LABEL}>CNPJ</label>
              <input
                className={CAMPO}
                name="cnpj"
                placeholder="00.000.000/0000-00"
                defaultValue={c?.cnpj ? formatCnpj(c.cnpj) : ""}
              />
            </div>
          )}
          <div>
            <label className={LABEL}>RG</label>
            <input className={CAMPO} name="rg" defaultValue={c?.rg ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Estado de expedição</label>
            <input className={CAMPO} name="expedicao" defaultValue={c?.expedicao ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Sexo</label>
            <select className={CAMPO} name="sexo" defaultValue={c?.sexo ?? ""}>
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
            <select className={CAMPO + " capitalize"} name="estado_civil" defaultValue={c?.estado_civil ?? ""}>
              <option value="">—</option>
              {ESTADOS_CIVIS.map((e) => (
                <option key={e} value={e} className="capitalize">
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Data de nascimento</label>
            <input
              type="date"
              className={CAMPO}
              name="data_nascimento"
              defaultValue={inputDate(c?.data_nascimento ?? null)}
            />
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
              defaultValue={c?.telefone ? formatTelefone(c.telefone) : ""}
            />
          </div>
          <div>
            <label className={LABEL}>E-mail</label>
            <input className={CAMPO} type="email" name="email" defaultValue={c?.email ?? ""} />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Endereço</label>
            <input className={CAMPO} name="endereco" defaultValue={c?.endereco ?? ""} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Profissional</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Profissão</label>
            <input className={CAMPO} name="profissao" defaultValue={c?.profissao ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Categoria de profissão</label>
            <select className={CAMPO} name="cat_profissao" defaultValue={c?.cat_profissao ?? ""}>
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
            <input className={CAMPO} name="tipo_servidor" defaultValue={c?.tipo_servidor ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Renda bruta (R$)</label>
            <input
              className={CAMPO}
              name="renda_bruta"
              placeholder="2.500,00"
              defaultValue={formatValorEditavel(c?.renda_bruta)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Vínculo</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Parceiro responsável</label>
            <select className={CAMPO} name="parceiro_id" defaultValue={c?.parceiro_id ?? ""}>
              <option value="">—</option>
              {parceiros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Loja</label>
            <select className={CAMPO} name="loja_id" defaultValue={c?.loja_id ?? ""}>
              <option value="">—</option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Observação</label>
            <textarea
              className={CAMPO + " min-h-20"}
              name="observacao"
              defaultValue={c?.observacao ?? ""}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Dados bancários</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Banco</label>
            <select className={CAMPO} name="banco_id" defaultValue={c?.banco_id ?? ""}>
              <option value="">—</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </select>
            {!c?.banco_id && c?.codigo_banco && (
              <p className="text-[11px] text-gray-400 mt-1">
                Código {c.codigo_banco} importado da planilha, ainda não vinculado a um banco da lista —
                selecione acima.
              </p>
            )}
          </div>
          <div>
            <label className={LABEL}>Código do banco</label>
            <input className={CAMPO} name="codigo_banco" defaultValue={c?.codigo_banco ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Agência</label>
            <input className={CAMPO} name="agencia" defaultValue={c?.agencia ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Conta</label>
            <input className={CAMPO} name="conta" defaultValue={c?.conta ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Tipo de conta</label>
            <select className={CAMPO} name="tipo_conta" defaultValue={c?.tipo_conta ?? ""}>
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
            <select className={CAMPO} name="tipo_pix" defaultValue={c?.tipo_pix ?? ""}>
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
            <input className={CAMPO} name="pix" defaultValue={c?.pix ?? ""} />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90">
          {c ? "Salvar alterações" : "Cadastrar cliente"}
        </button>
      </div>
    </form>
  );
}
