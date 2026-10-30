"use client";

import { useEffect, useRef, useState } from "react";
import { formatValorEditavel, valorEditavelParaDecimal } from "@/lib/format";
import {
  CATEGORIAS_OBRA,
  MODALIDADES_SERVICO,
  UNIDADES_MATERIAL,
  diferencaRef,
  moeda,
  quantidadeTexto,
  subtotalItem,
  totaisOrcamento,
  type GrupoOrcamento,
  type ItemCatalogo,
  type ItemOrcamento
} from "@/lib/manutencao/orcamento";

type Resultado = { ok: true } | { ok: false; erro: string };

export type AcoesOrcamento = {
  buscarCatalogo: (grupo: GrupoOrcamento, categoria: string | null, termo: string) => Promise<{ itens: ItemCatalogo[]; total: number }>;
  adicionar: (
    id: string,
    dados: {
      grupo: GrupoOrcamento;
      categoria: string | null;
      descricao: string;
      unidade: string;
      quantidade: number;
      valorUnitario: number;
      fornecedor: string | null;
      catalogoId: string | null;
    }
  ) => Promise<{ ok: true; item: ItemOrcamento } | { ok: false; erro: string }>;
  atualizar: (
    itemId: string,
    patch: { quantidade?: number; valorUnitario?: number; descricao?: string; unidade?: string; fornecedor?: string | null }
  ) => Promise<Resultado>;
  remover: (itemId: string) => Promise<Resultado>;
};

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";
const ROTULO = "text-[11px] text-gray-500 block mb-0.5";

// Campo numérico que salva ao sair (blur) só se mudou.
function CampoNumero({
  valor,
  casas,
  aoSalvar,
  largura = "w-20"
}: {
  valor: number;
  casas: 2 | 3;
  aoSalvar: (n: number) => void;
  largura?: string;
}) {
  const formatar = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas === 2 ? 2 : 0, maximumFractionDigits: casas });
  const [texto, setTexto] = useState(formatar(valor));
  useEffect(() => setTexto(formatar(valor)), [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      className={`${largura} text-xs border border-gray-200 rounded px-1.5 py-1 text-right outline-none focus:border-primary bg-white`}
      value={texto}
      inputMode="decimal"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const n = valorEditavelParaDecimal(texto);
        if (n === null || n === valor) {
          setTexto(formatar(valor));
          return;
        }
        aoSalvar(n);
      }}
    />
  );
}

// Orçamento do ticket: materiais que serão comprados e reforma/mão de obra
// (m², linear, diária...). O responsável já cotou com fornecedores e lança aqui
// o valor que adotou. O catálogo (SINAPI) sugere os itens por categoria, com a
// unidade e o preço de referência para comparar.
export function ManutencaoOrcamento({
  manutencaoId,
  coluna,
  itens,
  aoMudar,
  acoes,
  aoEnviar
}: {
  manutencaoId: string;
  coluna: string;
  itens: ItemOrcamento[];
  aoMudar: (atualizar: (atual: ItemOrcamento[]) => ItemOrcamento[]) => void;
  acoes: AcoesOrcamento;
  aoEnviar: () => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(coluna === "orcamento");
  const [aba, setAba] = useState<GrupoOrcamento>("material");
  const [erro, setErro] = useState("");

  // Quando o ticket entra em Orçamento, a seção abre sozinha.
  const colunaAnterior = useRef(coluna);
  useEffect(() => {
    if (colunaAnterior.current !== coluna && coluna === "orcamento") {
      setAberto(true);
      raiz.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    colunaAnterior.current = coluna;
  }, [coluna]);

  // formulário de novo item
  const vazio = { categoria: "", descricao: "", unidade: "", quantidade: "1", valor: "", fornecedor: "", catalogoId: null as string | null, precoRef: null as number | null };
  const [novo, setNovo] = useState(vazio);
  const [sugestoes, setSugestoes] = useState<ItemCatalogo[]>([]);
  const [totalCatalogo, setTotalCatalogo] = useState(0);
  const [listaAberta, setListaAberta] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const busca = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totais = totaisOrcamento(itens);
  const daAba = itens.filter((i) => i.grupo === aba);
  const unidadesOpcoes = aba === "material" ? UNIDADES_MATERIAL.map((u) => ({ valor: u, rotulo: u })) : MODALIDADES_SERVICO;

  function trocarAba(g: GrupoOrcamento) {
    setAba(g);
    setNovo(vazio);
    setSugestoes([]);
    setErro("");
  }

  function pesquisar(categoria: string, termo: string) {
    if (busca.current) clearTimeout(busca.current);
    if (!categoria && termo.trim().length < 2) {
      setSugestoes([]);
      setTotalCatalogo(0);
      return;
    }
    busca.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await acoes.buscarCatalogo(aba, categoria || null, termo);
        setSugestoes(r.itens);
        setTotalCatalogo(r.total);
      } catch {
        setSugestoes([]);
        setTotalCatalogo(0);
      } finally {
        setBuscando(false);
      }
    }, 250);
  }

  function escolher(c: ItemCatalogo) {
    setNovo((n) => ({
      ...n,
      descricao: c.descricao,
      unidade: c.unidade,
      catalogoId: c.id,
      precoRef: c.precoRef,
      categoria: n.categoria || c.categoria
    }));
    setListaAberta(false);
  }

  async function adicionar() {
    setErro("");
    const quantidade = valorEditavelParaDecimal(novo.quantidade);
    const valorUnitario = valorEditavelParaDecimal(novo.valor);
    if (!novo.descricao.trim()) return setErro("Escolha ou digite o item.");
    if (!novo.unidade) return setErro(aba === "material" ? "Escolha a unidade de medida." : "Escolha como é cobrado (m², linear, diária...).");
    if (!quantidade || quantidade <= 0) return setErro("Informe a quantidade.");
    if (valorUnitario === null) return setErro("Informe o valor em reais.");
    setAdicionando(true);
    const r = await acoes.adicionar(manutencaoId, {
      grupo: aba,
      categoria: novo.categoria || null,
      descricao: novo.descricao,
      unidade: novo.unidade,
      quantidade,
      valorUnitario,
      fornecedor: novo.fornecedor || null,
      catalogoId: novo.catalogoId
    });
    setAdicionando(false);
    if (r.ok) {
      aoMudar((l) => [...l, r.item]);
      setNovo({ ...vazio, categoria: novo.categoria });
      setSugestoes([]);
    } else setErro(r.erro);
  }

  async function atualizar(item: ItemOrcamento, patch: { quantidade?: number; valorUnitario?: number }) {
    setErro("");
    aoMudar((l) => l.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    const r = await acoes.atualizar(item.id, patch);
    if (!r.ok) {
      aoMudar((l) => l.map((i) => (i.id === item.id ? item : i)));
      setErro(r.erro);
    }
  }

  async function remover(item: ItemOrcamento) {
    setErro("");
    aoMudar((l) => l.filter((i) => i.id !== item.id));
    const r = await acoes.remover(item.id);
    if (!r.ok) {
      aoMudar((l) => [...l, item]);
      setErro(r.erro);
    }
  }

  return (
    <div ref={raiz} className={`bg-white border rounded-xl p-4 ${coluna === "orcamento" ? "border-primary/50 ring-1 ring-primary/20" : "border-gray-200"}`}>
      <button type="button" onClick={() => setAberto((a) => !a)} className="w-full flex items-center justify-between gap-2 text-left">
        <div>
          <div className="text-sm font-bold text-gray-800">
            Orçamento {coluna === "orcamento" && <span className="text-[10px] font-semibold text-primary ml-1">etapa atual</span>}
          </div>
          <div className="text-[11px] text-gray-500">
            {itens.length === 0
              ? "Nenhum item ainda — comece pelos materiais."
              : `${itens.length} item(ns) · Materiais ${moeda(totais.material)} · Reforma e mão de obra ${moeda(totais.servico)}`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-gray-900">{moeda(totais.total)}</span>
          <span className="text-gray-400 text-xs">{aberto ? "▲" : "▼"}</span>
        </div>
      </button>

      {aberto && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div className="flex gap-1">
              {(
                [
                  { id: "material", rotulo: "Materiais a comprar" },
                  { id: "servico", rotulo: "Reforma e mão de obra" }
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => trocarAba(t.id)}
                  className={`text-xs rounded-lg px-3 py-1.5 border ${aba === t.id ? "bg-primary text-white border-primary" : "bg-white border-gray-300 text-gray-600"}`}
                >
                  {t.rotulo} <span className="opacity-70">({itens.filter((i) => i.grupo === t.id).length})</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={aoEnviar}
              disabled={itens.length === 0}
              className="text-[11px] border border-green-300 text-green-700 rounded-lg px-2.5 py-1 hover:bg-green-50 disabled:opacity-40"
            >
              ✉ Enviar orçamento ao proprietário
            </button>
          </div>

          {/* Novo item */}
          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 mb-3">
            <div className="grid md:grid-cols-6 gap-2">
              <div className="md:col-span-2">
                <label className={ROTULO}>Categoria</label>
                <select
                  className={CAMPO}
                  value={novo.categoria}
                  onChange={(e) => {
                    setNovo((n) => ({ ...n, categoria: e.target.value, catalogoId: null, precoRef: null }));
                    pesquisar(e.target.value, novo.descricao);
                    setListaAberta(true);
                  }}
                >
                  <option value="">Todas as categorias</option>
                  {CATEGORIAS_OBRA.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-4 relative">
                <label className={ROTULO}>{aba === "material" ? "Material (busque no catálogo ou digite)" : "Serviço (busque no catálogo ou digite)"}</label>
                <input
                  className={CAMPO}
                  placeholder={novo.categoria ? `Itens de ${novo.categoria}...` : "Digite para buscar..."}
                  value={novo.descricao}
                  onChange={(e) => {
                    setNovo((n) => ({ ...n, descricao: e.target.value, catalogoId: null, precoRef: null }));
                    pesquisar(novo.categoria, e.target.value);
                    setListaAberta(true);
                  }}
                  onFocus={() => {
                    setListaAberta(true);
                    if (sugestoes.length === 0) pesquisar(novo.categoria, novo.descricao);
                  }}
                  onBlur={() => setTimeout(() => setListaAberta(false), 150)}
                />
                {listaAberta && (novo.categoria || novo.descricao.trim().length >= 2) && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-80 overflow-auto shadow-lg">
                    {buscando && <p className="text-xs text-gray-400 p-3">Buscando…</p>}
                    {!buscando && sugestoes.length === 0 && (
                      <p className="text-xs text-gray-400 p-3">Nada no catálogo — o texto digitado vira um item livre.</p>
                    )}
                    {!buscando && sugestoes.length > 0 && (
                      <p className="text-[10px] text-gray-400 px-3 py-1.5 border-b border-gray-100 bg-gray-50 sticky top-0">
                        {totalCatalogo > sugestoes.length
                          ? `Mostrando ${sugestoes.length} de ${totalCatalogo} — digite mais palavras para achar o item.`
                          : `${totalCatalogo} item(ns).`}
                      </p>
                    )}
                    {sugestoes.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => escolher(c)}
                        className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50"
                      >
                        <span className="text-gray-800">{c.descricao}</span>
                        <span className="text-gray-400">
                          {" "}
                          · {c.unidade}
                          {c.precoRef != null ? ` · ref. ${moeda(c.precoRef)}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className={ROTULO}>{aba === "material" ? "Unidade" : "Cobrado por"}</label>
                <select className={CAMPO} value={novo.unidade} onChange={(e) => setNovo((n) => ({ ...n, unidade: e.target.value }))}>
                  <option value="">—</option>
                  {/* unidade vinda do catálogo que não está na lista padrão */}
                  {novo.unidade && !unidadesOpcoes.some((u) => u.valor === novo.unidade) && <option value={novo.unidade}>{novo.unidade}</option>}
                  {unidadesOpcoes.map((u) => (
                    <option key={u.valor} value={u.valor}>
                      {u.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={ROTULO}>Quantidade</label>
                <input className={CAMPO} inputMode="decimal" placeholder="ex.: 12,5" value={novo.quantidade} onChange={(e) => setNovo((n) => ({ ...n, quantidade: e.target.value }))} />
              </div>
              <div>
                <label className={ROTULO}>Valor unitário (R$)</label>
                <input className={CAMPO} inputMode="decimal" placeholder="0,00" value={novo.valor} onChange={(e) => setNovo((n) => ({ ...n, valor: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className={ROTULO}>Fornecedor (opcional)</label>
                <input className={CAMPO} placeholder="Quem cotou" value={novo.fornecedor} onChange={(e) => setNovo((n) => ({ ...n, fornecedor: e.target.value }))} />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void adicionar()}
                  disabled={adicionando}
                  className="w-full text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
                >
                  {adicionando ? "Adicionando…" : "+ Adicionar"}
                </button>
              </div>
            </div>
            {novo.precoRef != null && (
              <div className="text-[11px] text-gray-500 mt-2">
                Referência SINAPI: <strong>{moeda(novo.precoRef)}</strong> por {novo.unidade}.{" "}
                <button type="button" className="underline text-primary" onClick={() => setNovo((n) => ({ ...n, valor: formatValorEditavel(n.precoRef) }))}>
                  usar como valor
                </button>
              </div>
            )}
            {erro && <div className="text-[11px] text-red-600 mt-2">{erro}</div>}
          </div>

          {/* Lista */}
          {daAba.length === 0 ? (
            <p className="text-xs text-gray-400">{aba === "material" ? "Nenhum material lançado." : "Nenhum serviço lançado."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] text-gray-400 border-b border-gray-100">
                    <th className="py-1 pr-2 font-medium">Item</th>
                    <th className="py-1 px-1 font-medium">{aba === "material" ? "Un." : "Cobrança"}</th>
                    <th className="py-1 px-1 font-medium text-right">Qtd.</th>
                    <th className="py-1 px-1 font-medium text-right">Valor unit.</th>
                    <th className="py-1 px-1 font-medium text-right">Ref.</th>
                    <th className="py-1 px-1 font-medium text-right">Subtotal</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {daAba.map((i) => {
                    const dif = diferencaRef(i.valorUnitario, i.precoRef);
                    return (
                      <tr key={i.id} className="border-b border-gray-50 align-top">
                        <td className="py-1.5 pr-2">
                          <div className="text-gray-800">{i.descricao}</div>
                          <div className="text-[10px] text-gray-400">
                            {[i.categoria, i.fornecedor && `cotado com ${i.fornecedor}`].filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td className="py-1.5 px-1 text-gray-600 whitespace-nowrap">{MODALIDADES_SERVICO.find((m) => m.valor === i.unidade && aba === "servico")?.rotulo ?? i.unidade}</td>
                        <td className="py-1.5 px-1 text-right">
                          <CampoNumero valor={i.quantidade} casas={3} aoSalvar={(n) => void atualizar(i, { quantidade: n })} />
                        </td>
                        <td className="py-1.5 px-1 text-right">
                          <CampoNumero valor={i.valorUnitario} casas={2} largura="w-24" aoSalvar={(n) => void atualizar(i, { valorUnitario: n })} />
                        </td>
                        <td className="py-1.5 px-1 text-right whitespace-nowrap text-[10px] text-gray-400">
                          {i.precoRef != null ? (
                            <>
                              {moeda(i.precoRef)}
                              {dif !== null && (
                                <div className={Math.abs(dif) >= 30 ? "text-amber-600 font-semibold" : ""}>{dif > 0 ? `+${dif}%` : `${dif}%`}</div>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-1.5 px-1 text-right font-medium text-gray-800 whitespace-nowrap">{moeda(subtotalItem(i))}</td>
                        <td className="py-1.5 pl-1 text-right">
                          <button type="button" onClick={() => void remover(i)} className="text-[11px] text-gray-300 hover:text-red-500">
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="pt-2 text-right text-[11px] text-gray-500">
                      {aba === "material" ? "Total de materiais" : "Total de reforma e mão de obra"} ({quantidadeTexto(daAba.length)} item{daAba.length === 1 ? "" : "s"})
                    </td>
                    <td className="pt-2 px-1 text-right font-bold text-gray-900 whitespace-nowrap">{moeda(aba === "material" ? totais.material : totais.servico)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
