"use client";

import { useState, type ReactNode } from "react";
import { TODAS_FUNCOES, STATUS_FUNCAO, ESTADOS_CIVIS, TIPOS_CONTA, TIPOS_PIX } from "@/lib/parceiros/opcoes";
import { formatCpf, formatTelefone, formatPercentual, formatMoeda, formatDataCalendario } from "@/lib/format";

const FUNCOES_COM_COMISSIONAMENTO = ["Corretor", "Corretor Estagiário"];

type Loja = { id: string; nome: string };
type Banco = { id: string; nome: string };

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
  creci: string | null;
  endereco: string | null;
  data_entrada: Date | null;
  data_saida: Date | null;
  obs_funcao: string | null;
  fee: unknown;
  porc_compr: unknown;
  porc_vend: unknown;
  dia_fee: number | null;
  banco_id: string | null;
  codigo_banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  tipo_pix: string | null;
  pix: string | null;
  link_drive: string | null;
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
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Nome completo" valor={p.nome} />
          <Linha label="CPF" valor={p.cpf ? formatCpf(p.cpf) : null} />
          <Linha label="Função" valor={p.funcao} />
          <Linha label="Status" valor={p.status_funcao} />
          <Linha label="CRECI" valor={p.creci} />
          <Linha label="Estado civil" valor={p.estado_civil} />
          <Linha label="Data de nascimento" valor={formatDataCalendario(p.data_nascimento)} />
          <Linha label="Identidade (RG)" valor={p.identidade} />
          <Linha label="Estado de expedição" valor={p.expedicao_estado} />
          <Linha label="Data de entrada" valor={formatDataCalendario(p.data_entrada)} />
          {mostrarDataSaida && <Linha label="Data de saída" valor={formatDataCalendario(p.data_saida)} />}
        </div>
      </Cartao>

      <Cartao titulo="Contato">
        <div className="grid md:grid-cols-2 gap-3">
          <Linha label="Telefone" valor={p.telefone ? formatTelefone(p.telefone) : null} />
          <Linha label="E-mail" valor={p.email} />
          <Linha label="Empresa" valor={p.empresa} />
          <Linha label="Endereço" valor={p.endereco} />
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
            <Linha label="% compra" valor={p.porc_compr != null ? formatPercentual(p.porc_compr) : null} />
            <Linha label="% venda" valor={p.porc_vend != null ? formatPercentual(p.porc_vend) : null} />
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
  action
}: {
  parceiro: ParceiroExistente | null;
  lojas: Loja[];
  bancos: Banco[];
  action: (formData: FormData) => void;
}) {
  const p = parceiro;
  // Cadastro novo já nasce em modo de edição (não tem ficha pra mostrar
  // ainda). Cadastro existente abre em modo visualização — só entra em
  // edição clicando em "Editar" (mesmo padrão do AppSheet: side-by-side,
  // sem campo nenhum editável até isso acontecer).
  const [modoEdicao, setModoEdicao] = useState(!p);
  const [statusFuncao, setStatusFuncao] = useState(p?.status_funcao ?? "Ativo");

  if (p && !modoEdicao) {
    return <Ficha parceiro={p} onEditar={() => setModoEdicao(true)} />;
  }

  return (
    <form action={action} className="flex flex-col gap-5">
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
            <label className={LABEL}>Loja</label>
            <select className={CAMPO} name="loja_id" defaultValue={p?.loja_id ?? ""}>
              <option value="">—</option>
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
            <select className={CAMPO + " capitalize"} name="estado_civil" defaultValue={p?.estado_civil ?? ""}>
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
          <div>
            <label className={LABEL}>Endereço</label>
            <input className={CAMPO} name="endereco" defaultValue={p?.endereco ?? ""} />
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
            Visível apenas para Corretor e Corretor Estagiário.
          </p>
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <label className={LABEL}>Fee (R$)</label>
              <input className={CAMPO} name="fee" defaultValue={p?.fee != null ? String(p.fee) : ""} />
            </div>
            <div>
              <label className={LABEL}>% compra</label>
              <input
                className={CAMPO}
                name="porc_compr"
                placeholder="Ex.: 22,5"
                defaultValue={p?.porc_compr != null ? formatPercentual(p.porc_compr) : ""}
              />
            </div>
            <div>
              <label className={LABEL}>% venda</label>
              <input
                className={CAMPO}
                name="porc_vend"
                placeholder="Ex.: 22,5"
                defaultValue={p?.porc_vend != null ? formatPercentual(p.porc_vend) : ""}
              />
            </div>
            <div>
              <label className={LABEL}>Dia do fee</label>
              <input className={CAMPO} name="dia_fee" defaultValue={p?.dia_fee ?? ""} />
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Dados bancários</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Banco</label>
            <select className={CAMPO} name="banco_id" defaultValue={p?.banco_id ?? ""}>
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
            <input className={CAMPO} name="codigo_banco" defaultValue={p?.codigo_banco ?? ""} />
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
        <button type="submit" className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90">
          {p ? "Salvar alterações" : "Cadastrar parceiro"}
        </button>
      </div>
    </form>
  );
}
