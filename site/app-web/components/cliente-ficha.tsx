"use client";

import { useState } from "react";
import {
  AVISO_LGPD,
  CAMPOS_FICHA,
  GRUPOS_FICHA,
  textoDoCampo,
  type CampoFicha,
  type FichaDados,
  type FichaDoCliente,
  type Filho
} from "@/lib/crm/ficha";
import type { RespostaFicha } from "@/lib/crm/ficha-servidor";

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white disabled:bg-gray-100 disabled:text-gray-500";
const LABEL = "text-[11px] text-gray-600 block mb-0.5";
const data = (iso: string) => iso.split("-").reverse().join("/");

export type AcoesFicha = {
  salvar: (clienteId: string, dados: FichaDados) => Promise<RespostaFicha>;
  adicionarGancho: (clienteId: string, texto: string, lembrarEm: string | null) => Promise<RespostaFicha>;
  removerGancho: (ganchoId: string) => Promise<RespostaFicha>;
};

// Um campo da ficha (usado aqui e dentro do roteiro, em "O que você descobriu nesta conversa?").
export function CampoDaFicha({ campo, valor, aoMudar, travado }: { campo: CampoFicha; valor: string | Filho[] | undefined; aoMudar: (v: string | Filho[]) => void; travado?: string }) {
  const texto = typeof valor === "string" ? valor : "";
  let controle;
  if (travado !== undefined) {
    controle = <input className={CAMPO} value={travado} disabled />;
  } else if (campo.tipo === "filhos") {
    const filhos = Array.isArray(valor) ? valor : [];
    const mudar = (i: number, p: Partial<Filho>) => aoMudar(filhos.map((f, j) => (j === i ? { ...f, ...p } : f)));
    controle = (
      <div className="flex flex-col gap-1.5">
        {filhos.map((f, i) => (
          <div key={i} className="flex gap-1.5">
            <input className={CAMPO} value={f.nome} onChange={(e) => mudar(i, { nome: e.target.value })} placeholder="Nome" maxLength={80} aria-label="Nome do filho" />
            <input className={`${CAMPO} !w-28`} value={f.ano} onChange={(e) => mudar(i, { ano: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Ano nasc." inputMode="numeric" aria-label="Ano de nascimento (aproximado)" />
            <button type="button" onClick={() => aoMudar(filhos.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600 text-sm px-1" aria-label="Tirar">
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={() => aoMudar([...filhos, { nome: "", ano: "" }])} className="text-[11px] text-primary underline self-start">
          + adicionar filho(a)
        </button>
      </div>
    );
  } else if (campo.tipo === "escolha") {
    controle = (
      <div className="flex flex-wrap gap-1.5">
        {campo.opcoes?.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={texto === o}
            onClick={() => aoMudar(texto === o ? "" : o)}
            className={`text-xs rounded-full border px-3 py-1.5 font-semibold ${texto === o ? "bg-orange-600 text-white border-orange-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            {o}
          </button>
        ))}
      </div>
    );
  } else if (campo.tipo === "tags") {
    const tags = texto.split(",").map((x) => x.trim()).filter(Boolean);
    controle = (
      <div className="flex flex-col gap-1.5">
        <input className={CAMPO} value={texto} onChange={(e) => aoMudar(e.target.value)} placeholder="Separe por vírgula" maxLength={200} />
        <div className="flex flex-wrap gap-1">
          {campo.opcoes?.map((o) => {
            const tem = tags.some((t) => t.toLowerCase() === o.toLowerCase());
            return (
              <button
                key={o}
                type="button"
                onClick={() => aoMudar((tem ? tags.filter((t) => t.toLowerCase() !== o.toLowerCase()) : [...tags, o]).join(", "))}
                className={`text-[11px] rounded-full border px-2 py-0.5 ${tem ? "bg-orange-100 border-orange-400 text-orange-800" : "bg-white border-gray-300 text-gray-600"}`}
              >
                {tem ? "✓ " : "+ "}
                {o}
              </button>
            );
          })}
        </div>
      </div>
    );
  } else {
    controle = <input type={campo.tipo === "data" ? "date" : "text"} className={CAMPO} value={texto} onChange={(e) => aoMudar(e.target.value)} placeholder={campo.exemplo} maxLength={200} />;
  }
  return (
    <div className={campo.tipo === "filhos" || campo.tipo === "tags" ? "sm:col-span-2" : ""}>
      <label className={LABEL}>{campo.rotulo}</label>
      {controle}
    </div>
  );
}

// Datas que já vêm do sistema: aniversário do cadastro e data do contrato.
export function dataDoSistema(campoId: string, ficha: FichaDoCliente): string | undefined {
  if (campoId === "nascimento" && ficha.nascimentoCadastro) return `${data(ficha.nascimentoCadastro)} (do cadastro)`;
  if (campoId === "casa" && ficha.casaContrato) return `${data(ficha.casaContrato.data)} (contrato de ${ficha.casaContrato.tipo.toLowerCase()})`;
  return undefined;
}

// Ficha de relacionamento: o que o cliente compartilhou e os ganchos para a próxima conversa.
export function ClienteFicha({
  clienteId,
  hoje,
  ficha,
  optOut,
  acoes,
  aoMudar
}: {
  clienteId: string;
  hoje: string;
  ficha: FichaDoCliente;
  optOut: boolean;
  acoes: AcoesFicha;
  aoMudar: (r: Extract<RespostaFicha, { ok: true }>) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [dados, setDados] = useState<FichaDados>(ficha.dados);
  const [gancho, setGancho] = useState("");
  const [lembrar, setLembrar] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function executar(f: () => Promise<RespostaFicha>, depois?: () => void) {
    setOcupado(true);
    setErro("");
    try {
      const r = await f();
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      aoMudar(r);
      depois?.();
    } catch {
      setErro("Não foi possível gravar agora. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  const preenchidos = GRUPOS_FICHA.map((g) => ({
    grupo: g,
    itens: CAMPOS_FICHA.filter((c) => c.grupo === g)
      .map((c) => ({ rotulo: c.rotulo, texto: dataDoSistema(c.id, ficha) ?? textoDoCampo(ficha.dados[c.id], c.tipo) }))
      .filter((i) => i.texto)
  })).filter((g) => g.itens.length > 0);
  const doCadastro = [ficha.estadoCivil ? `Estado civil: ${ficha.estadoCivil}` : "", ficha.conjugeCadastro ? `Cônjuge no cadastro: ${ficha.conjugeCadastro}` : ""].filter(Boolean).join(" · ");

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-bold text-gray-800">Ficha de relacionamento</div>
        {!editando && (
          <button
            type="button"
            onClick={() => {
              setDados(ficha.dados);
              setErro("");
              setEditando(true);
            }}
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-gray-600 hover:bg-gray-50"
          >
            ✏️ Editar ficha
          </button>
        )}
      </div>
      <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-2">🔒 {AVISO_LGPD}</div>
      {doCadastro && <div className="text-[11px] text-gray-500 mt-2">{doCadastro}</div>}

      {editando ? (
        <div className="mt-3 flex flex-col gap-4">
          {GRUPOS_FICHA.map((g) => (
            <div key={g}>
              <div className="text-xs font-bold text-gray-700 mb-1.5">{g}</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {CAMPOS_FICHA.filter((c) => c.grupo === g).map((c) => (
                  <CampoDaFicha key={c.id} campo={c} valor={dados[c.id]} travado={dataDoSistema(c.id, ficha)} aoMudar={(v) => setDados((d) => ({ ...d, [c.id]: v }))} />
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" disabled={ocupado} onClick={() => void executar(() => acoes.salvar(clienteId, dados), () => setEditando(false))} className="text-xs bg-orange-600 text-white rounded-lg px-5 py-2 font-semibold disabled:opacity-50">
              {ocupado ? "Gravando..." : "Salvar ficha"}
            </button>
            <button type="button" disabled={ocupado} onClick={() => setEditando(false)} className="text-xs border border-gray-300 rounded-lg px-4 py-2 font-semibold text-gray-600">
              Cancelar
            </button>
          </div>
        </div>
      ) : preenchidos.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          {preenchidos.map((g) => (
            <div key={g.grupo} className="rounded-lg border border-gray-100 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400 mb-1">{g.grupo}</div>
              {g.itens.map((i) => (
                <div key={i.rotulo} className="text-xs text-gray-700">
                  <span className="text-gray-500">{i.rotulo.replace(/\?$/, "")}:</span> {i.texto}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-gray-400 mt-3">Ainda sem informações. Preencha aqui ou durante o roteiro de atendimento.</div>
      )}

      <div className="border-t border-gray-100 mt-4 pt-3">
        <div className="text-xs font-bold text-gray-800 mb-1.5">Ganchos de conversa</div>
        <div className="grid md:grid-cols-[1fr_auto_auto] gap-2 items-end">
          <div>
            <label className={LABEL}>Assunto para a próxima conversa</label>
            <input className={CAMPO} value={gancho} onChange={(e) => setGancho(e.target.value)} maxLength={200} placeholder="Ex.: vai para Portugal em março" />
          </div>
          <div>
            <label className={LABEL}>Lembrar em (opcional)</label>
            <input type="date" min={hoje} className={CAMPO} value={lembrar} onChange={(e) => setLembrar(e.target.value)} disabled={optOut} />
          </div>
          <button
            type="button"
            disabled={ocupado || !gancho.trim()}
            onClick={() =>
              void executar(
                () => acoes.adicionarGancho(clienteId, gancho, lembrar || null),
                () => {
                  setGancho("");
                  setLembrar("");
                }
              )
            }
            className="text-xs bg-orange-600 text-white rounded-lg px-4 py-2 font-semibold disabled:opacity-40"
          >
            Adicionar
          </button>
        </div>
        {ficha.ganchos.length > 0 && (
          <div className="flex flex-col divide-y divide-gray-100 mt-2 max-h-64 overflow-y-auto">
            {ficha.ganchos.map((g) => (
              <div key={g.id} className="py-1.5 flex items-start gap-2 text-xs">
                <div className="flex-1">
                  <div className="text-gray-800">{g.texto}</div>
                  <div className="text-[10px] text-gray-400">
                    {new Date(g.criadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho" })}
                    {g.por ? ` · ${g.por.split(" ")[0]}` : ""}
                    {g.lembrarEm ? ` · lembrar em ${data(g.lembrarEm)}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => {
                    if (window.confirm("Remover este gancho?")) void executar(() => acoes.removerGancho(g.id));
                  }}
                  className="text-[11px] text-gray-400 hover:text-red-600"
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {erro && <div className="text-xs text-red-600 mt-2">{erro}</div>}
    </div>
  );
}
