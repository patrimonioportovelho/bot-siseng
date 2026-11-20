"use client";

import { useState } from "react";
import { DEFINICOES_PARAMETROS, type ColunaTabela, type DefinicaoParametro, type TipoCampo } from "@/lib/financiamento/simulacao-parametros";

export type LinhaParametro = { chave: string; valor: unknown; descricao: string; fonte: string | null; atualizadoEm: string };

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2 py-1 outline-none focus:border-primary bg-white";

function paraTela(tipo: TipoCampo, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (tipo === "percentual") return String(Math.round(Number(v) * 1_000_000) / 10_000).replace(".", ",");
  if (tipo === "booleano") return v === true ? "sim" : "nao";
  return String(v).replace(".", ",");
}

// "7,66" na tela de percentual vira 0.0766 no banco; vazio vira null.
function deTela(tipo: TipoCampo, s: string): unknown {
  const t = s.trim();
  if (tipo === "booleano") return t === "sim" ? true : t === "nao" ? false : null;
  if (tipo === "texto") return t;
  if (!t) return null;
  const n = Number(t.replace(/\./g, tipo === "dinheiro" ? "" : ".").replace(",", "."));
  if (!Number.isFinite(n)) return Number.NaN;
  return tipo === "percentual" ? n / 100 : n;
}

type Salvar = (chave: string, valor: unknown) => Promise<{ ok: true } | { ok: false; erro: string }>;

function Escalar({ def, linha, salvar }: { def: Extract<DefinicaoParametro, { escalar: true }>; linha: LinhaParametro; salvar: Salvar }) {
  const [v, setV] = useState(paraTela(def.tipo, linha.valor));
  const [estado, setEstado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function gravar() {
    setSalvando(true);
    setEstado(null);
    const r = await salvar(def.chave, deTela(def.tipo, v));
    setSalvando(false);
    setEstado(r.ok ? "Salvo ✓" : r.erro);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {def.tipo === "booleano" ? (
        <select className={`${CAMPO} max-w-[140px]`} value={v} onChange={(e) => setV(e.target.value)}>
          <option value="">Não configurado</option>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </select>
      ) : (
        <div className="flex items-center gap-1">
          <input className={`${CAMPO} max-w-[160px]`} value={v} onChange={(e) => setV(e.target.value)} placeholder="não configurado" inputMode="decimal" />
          {def.tipo === "percentual" && <span className="text-xs text-gray-500">%</span>}
          {def.tipo === "dinheiro" && <span className="text-xs text-gray-500">R$</span>}
        </div>
      )}
      <button type="button" onClick={() => void gravar()} disabled={salvando} className="text-xs bg-primary text-white rounded-lg px-3 py-1 font-semibold disabled:opacity-50">
        {salvando ? "Salvando..." : "Salvar"}
      </button>
      {estado && <span className={`text-[11px] ${estado.startsWith("Salvo") ? "text-green-600" : "text-red-600"}`}>{estado}</span>}
    </div>
  );
}

function Tabela({ def, linha, salvar }: { def: Extract<DefinicaoParametro, { escalar: false }>; linha: LinhaParametro; salvar: Salvar }) {
  const inicial = (Array.isArray(linha.valor) ? (linha.valor as Record<string, unknown>[]) : []).map((l) => Object.fromEntries(def.colunas.map((c) => [c.chave, paraTela(c.tipo, l[c.chave])])));
  const [linhas, setLinhas] = useState<Record<string, string>[]>(inicial);
  const [estado, setEstado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const vazia = () => Object.fromEntries(def.colunas.map((c: ColunaTabela) => [c.chave, ""]));

  async function gravar() {
    setSalvando(true);
    setEstado(null);
    const valor = linhas.map((l) => Object.fromEntries(def.colunas.map((c) => [c.chave, deTela(c.tipo, l[c.chave] ?? "")])));
    const r = await salvar(def.chave, valor);
    setSalvando(false);
    setEstado(r.ok ? "Salvo ✓" : r.erro);
  }

  const sufixo = (t: TipoCampo) => (t === "percentual" ? " (%)" : "");

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="text-left text-gray-500">
              {def.colunas.map((c) => (
                <th key={c.chave} className="font-normal pb-1 pr-2 whitespace-nowrap">
                  {c.titulo}
                  {sufixo(c.tipo)}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                {def.colunas.map((c) => (
                  <td key={c.chave} className="pr-2 pb-1">
                    <input
                      className={CAMPO}
                      value={l[c.chave] ?? ""}
                      onChange={(e) => setLinhas((ls) => ls.map((x, k) => (k === i ? { ...x, [c.chave]: e.target.value } : x)))}
                    />
                  </td>
                ))}
                <td className="pb-1">
                  <button type="button" onClick={() => setLinhas((ls) => ls.filter((_, k) => k !== i))} className="text-red-500 text-sm px-1" title="Remover linha">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <button type="button" onClick={() => setLinhas((ls) => [...ls, vazia()])} className="text-xs border border-gray-300 rounded-lg px-3 py-1 text-gray-600">
          + Linha
        </button>
        <button type="button" onClick={() => void gravar()} disabled={salvando} className="text-xs bg-primary text-white rounded-lg px-3 py-1 font-semibold disabled:opacity-50">
          {salvando ? "Salvando..." : "Salvar tabela"}
        </button>
        {estado && <span className={`text-[11px] ${estado.startsWith("Salvo") ? "text-green-600" : "text-red-600"}`}>{estado}</span>}
      </div>
    </div>
  );
}

const vazioValor = (v: unknown) => v === null || v === undefined || (Array.isArray(v) && v.length === 0);

// Tela de parâmetros da simulação habitacional: taxas, tetos, cotas e seguros. Mudam por portaria ou política da
// Caixa, então ficam aqui (no banco) e não no código. Item sem valor = "não configurado": a simulação avisa.
export function SimulacaoParametrosEditor({ linhas, salvar }: { linhas: LinhaParametro[]; salvar: Salvar }) {
  const porChave = new Map(linhas.map((l) => [l.chave, l]));
  const grupos = Array.from(new Set(DEFINICOES_PARAMETROS.map((d) => d.grupo)));

  return (
    <div className="flex flex-col gap-5">
      {grupos.map((g) => (
        <section key={g} className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">{g}</div>
          <div className="flex flex-col divide-y divide-gray-100">
            {DEFINICOES_PARAMETROS.filter((d) => d.grupo === g).map((def) => {
              const linha = porChave.get(def.chave);
              if (!linha) return null;
              const confirmado = /Simulação Caixa|Editado no sistema/.test(linha.fonte ?? "");
              return (
                <div key={def.chave} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-xs font-semibold text-gray-800">{def.titulo}</div>
                    {vazioValor(linha.valor) && <span className="text-[10px] font-bold rounded-full border px-2 py-0.5 bg-red-50 text-red-600 border-red-200">Não configurado</span>}
                    {linha.fonte && (
                      <span className={`text-[10px] rounded-full border px-2 py-0.5 ${confirmado ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                        {linha.fonte}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 mb-1.5">{linha.descricao}</p>
                  {def.escalar ? <Escalar def={def} linha={linha} salvar={salvar} /> : <Tabela def={def} linha={linha} salvar={salvar} />}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
