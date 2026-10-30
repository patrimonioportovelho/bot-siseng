"use client";

import { useEffect, useState } from "react";
import { valorEditavelParaDecimal } from "@/lib/format";
import {
  FORMAS_PAGAMENTO,
  QUEM_ARCA,
  QUEM_PAGA,
  moeda,
  totaisPagamento,
  type LinhaPagamento
} from "@/lib/manutencao/orcamento";

type Resultado = { ok: true } | { ok: false; erro: string };

export type AcoesPagamento = {
  salvarCampo: (id: string, campo: string, valor: string | null) => Promise<Resultado>;
  adicionarLinha: (
    id: string,
    dados: { descricao: string; forma: string; valor: number; vencimento: string | null }
  ) => Promise<{ ok: true; linha: LinhaPagamento } | { ok: false; erro: string }>;
  atualizarLinha: (
    linhaId: string,
    patch: { descricao?: string; forma?: string; valor?: number; vencimento?: string | null; pagoEm?: string | null }
  ) => Promise<Resultado>;
  removerLinha: (linhaId: string) => Promise<Resultado>;
  gerarParcelas: (
    id: string,
    dados: { descricao: string; forma: string; total: number; parcelas: number; primeiroVencimento: string }
  ) => Promise<{ ok: true; linhas: LinhaPagamento[] } | { ok: false; erro: string }>;
};

export type CaucaoImovel = { valor: number | null; garantia: string | null } | null;

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";
const CELULA = "text-xs border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-primary bg-white";
const ROTULO = "text-[11px] text-gray-500 block mb-0.5";

function CampoValor({ valor, aoSalvar }: { valor: number; aoSalvar: (n: number) => void }) {
  const formatar = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [texto, setTexto] = useState(formatar(valor));
  useEffect(() => setTexto(formatar(valor)), [valor]);
  return (
    <input
      className={`${CELULA} w-24 text-right`}
      inputMode="decimal"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const n = valorEditavelParaDecimal(texto);
        if (n === null || n === valor) return setTexto(formatar(valor));
        aoSalvar(n);
      }}
    />
  );
}

// Forma de pagamento — aparece depois que o orçamento é aprovado: quem arca com
// o custo, quem paga o fornecedor (a imobiliária adianta e cobra, ou direto),
// e as linhas de pagamento (caução, boleto, PIX, desconto no repasse, parcelas).
export function ManutencaoPagamento({
  manutencaoId,
  totalOrcamento,
  quemArca,
  quemPaga,
  obs,
  linhas,
  caucao,
  hoje,
  aoMudarCampo,
  aoMudarLinhas,
  acoes,
  aoEnviar
}: {
  manutencaoId: string;
  totalOrcamento: number;
  quemArca: string | null;
  quemPaga: string | null;
  obs: string | null;
  linhas: LinhaPagamento[];
  caucao: CaucaoImovel;
  hoje: string;
  aoMudarCampo: (campo: "quemArca" | "quemPaga" | "obs", valor: string | null) => void;
  aoMudarLinhas: (atualizar: (atual: LinhaPagamento[]) => LinhaPagamento[]) => void;
  acoes: AcoesPagamento;
  aoEnviar: () => void;
}) {
  const [erro, setErro] = useState("");
  const [obsTexto, setObsTexto] = useState(obs ?? "");
  const [parc, setParc] = useState({ descricao: "Total", forma: "boleto", total: "", parcelas: "1", vencimento: hoje });
  const [gerando, setGerando] = useState(false);

  const t = totaisPagamento(linhas, totalOrcamento);
  const dicaQuemPaga = QUEM_PAGA.find((q) => q.valor === quemPaga)?.dica;

  async function salvarCampo(campo: "quemArca" | "quemPaga" | "obs", coluna: string, valor: string | null) {
    setErro("");
    aoMudarCampo(campo, valor);
    const r = await acoes.salvarCampo(manutencaoId, coluna, valor);
    if (!r.ok) setErro(r.erro);
  }

  async function usarCaucao() {
    if (!caucao?.valor) return;
    setErro("");
    const valor = Math.min(caucao.valor, t.faltaAlocar > 0 ? t.faltaAlocar : totalOrcamento);
    const r = await acoes.adicionarLinha(manutencaoId, { descricao: "Abatido da caução", forma: "caucao", valor, vencimento: null });
    if (r.ok) aoMudarLinhas((l) => [...l, r.linha]);
    else setErro(r.erro);
  }

  async function gerar() {
    setErro("");
    const total = valorEditavelParaDecimal(parc.total) ?? (t.faltaAlocar > 0 ? t.faltaAlocar : 0);
    const parcelas = Number(parc.parcelas);
    setGerando(true);
    const r = await acoes.gerarParcelas(manutencaoId, {
      descricao: parc.descricao,
      forma: parc.forma,
      total,
      parcelas,
      primeiroVencimento: parc.vencimento
    });
    setGerando(false);
    if (r.ok) {
      aoMudarLinhas((l) => [...l, ...r.linhas]);
      setParc((p) => ({ ...p, total: "" }));
    } else setErro(r.erro);
  }

  async function atualizar(l: LinhaPagamento, patch: Partial<Pick<LinhaPagamento, "descricao" | "forma" | "valor" | "vencimento" | "pagoEm">>) {
    setErro("");
    aoMudarLinhas((lista) => lista.map((x) => (x.id === l.id ? { ...x, ...patch } : x)));
    const r = await acoes.atualizarLinha(l.id, patch);
    if (!r.ok) {
      aoMudarLinhas((lista) => lista.map((x) => (x.id === l.id ? l : x)));
      setErro(r.erro);
    }
  }

  async function remover(l: LinhaPagamento) {
    setErro("");
    aoMudarLinhas((lista) => lista.filter((x) => x.id !== l.id));
    const r = await acoes.removerLinha(l.id);
    if (!r.ok) {
      aoMudarLinhas((lista) => [...lista, l]);
      setErro(r.erro);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
        <div>
          <div className="text-sm font-bold text-gray-800">Forma de pagamento</div>
          <div className="text-[11px] text-gray-500">Definida depois da aprovação do orçamento ({moeda(totalOrcamento)}).</div>
        </div>
        <button
          type="button"
          onClick={aoEnviar}
          disabled={linhas.length === 0 && !quemArca}
          className="text-[11px] border border-green-300 text-green-700 rounded-lg px-2.5 py-1 hover:bg-green-50 disabled:opacity-40"
        >
          ✉ Enviar forma de pagamento
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={ROTULO}>Quem arca com o custo</label>
          <select className={CAMPO} value={quemArca ?? ""} onChange={(e) => void salvarCampo("quemArca", "pagamento_quem_arca", e.target.value || null)}>
            <option value="">—</option>
            {QUEM_ARCA.map((q) => (
              <option key={q.valor} value={q.valor}>
                {q.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={ROTULO}>Quem paga o fornecedor</label>
          <select className={CAMPO} value={quemPaga ?? ""} onChange={(e) => void salvarCampo("quemPaga", "pagamento_quem_paga", e.target.value || null)}>
            <option value="">—</option>
            {QUEM_PAGA.map((q) => (
              <option key={q.valor} value={q.valor}>
                {q.rotulo}
              </option>
            ))}
          </select>
          {dicaQuemPaga && <div className="text-[10px] text-gray-400 mt-0.5">{dicaQuemPaga}</div>}
        </div>
      </div>

      {caucao?.valor ? (
        <div className="flex items-center justify-between gap-2 flex-wrap bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-xs text-amber-800">
          <span>
            O contrato de locação deste imóvel tem caução de <strong>{moeda(caucao.valor)}</strong>
            {caucao.garantia ? ` (garantia: ${caucao.garantia})` : ""}.
          </span>
          <button type="button" onClick={() => void usarCaucao()} className="border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-100">
            Usar caução
          </button>
        </div>
      ) : null}

      {/* Totais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {[
          { rotulo: "Orçamento", valor: totalOrcamento, cor: "text-gray-800" },
          { rotulo: "Planejado", valor: t.planejado, cor: "text-gray-800" },
          { rotulo: "Pago", valor: t.pago, cor: "text-green-700" },
          { rotulo: t.faltaAlocar < 0 ? "Passou do orçamento" : "Falta definir", valor: Math.abs(t.faltaAlocar), cor: t.faltaAlocar === 0 ? "text-green-700" : "text-amber-700" }
        ].map((k) => (
          <div key={k.rotulo} className="border border-gray-100 rounded-lg px-3 py-2">
            <div className="text-[10px] text-gray-400">{k.rotulo}</div>
            <div className={`text-sm font-bold ${k.cor}`}>{moeda(k.valor)}</div>
          </div>
        ))}
      </div>

      {/* Parcelar / lançar */}
      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 mb-3">
        <div className="text-[11px] font-semibold text-gray-600 mb-2">Adicionar pagamento ou parcelar</div>
        <div className="grid md:grid-cols-6 gap-2">
          <div>
            <label className={ROTULO}>Refere-se a</label>
            <select className={CAMPO} value={parc.descricao} onChange={(e) => setParc((p) => ({ ...p, descricao: e.target.value }))}>
              <option>Total</option>
              <option>Material</option>
              <option>Mão de obra</option>
              <option>Entrada</option>
              <option>Saldo</option>
            </select>
          </div>
          <div>
            <label className={ROTULO}>Forma</label>
            <select className={CAMPO} value={parc.forma} onChange={(e) => setParc((p) => ({ ...p, forma: e.target.value }))}>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ROTULO}>Valor (R$)</label>
            <input
              className={CAMPO}
              inputMode="decimal"
              placeholder={t.faltaAlocar > 0 ? moeda(t.faltaAlocar) : "0,00"}
              value={parc.total}
              onChange={(e) => setParc((p) => ({ ...p, total: e.target.value }))}
            />
          </div>
          <div>
            <label className={ROTULO}>Parcelas</label>
            <input className={CAMPO} inputMode="numeric" value={parc.parcelas} onChange={(e) => setParc((p) => ({ ...p, parcelas: e.target.value }))} />
          </div>
          <div>
            <label className={ROTULO}>1º vencimento</label>
            <input type="date" className={CAMPO} value={parc.vencimento} onChange={(e) => setParc((p) => ({ ...p, vencimento: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void gerar()}
              disabled={gerando}
              className="w-full text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
            >
              {gerando ? "Gerando…" : "+ Adicionar"}
            </button>
          </div>
        </div>
        <div className="text-[10px] text-gray-400 mt-1">Deixe o valor vazio para usar o que falta definir. Com mais de 1 parcela, os vencimentos são mensais.</div>
      </div>

      {/* Linhas */}
      {linhas.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhum pagamento definido ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] text-gray-400 border-b border-gray-100">
                <th className="py-1 pr-2 font-medium">Descrição</th>
                <th className="py-1 px-1 font-medium">Forma</th>
                <th className="py-1 px-1 font-medium text-right">Valor</th>
                <th className="py-1 px-1 font-medium">Vencimento</th>
                <th className="py-1 px-1 font-medium">Pago em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-gray-50">
                  <td className="py-1.5 pr-2 text-gray-800">{l.descricao}</td>
                  <td className="py-1.5 px-1">
                    <select className={CELULA} value={l.forma} onChange={(e) => void atualizar(l, { forma: e.target.value })}>
                      {FORMAS_PAGAMENTO.map((f) => (
                        <option key={f.valor} value={f.valor}>
                          {f.rotulo}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 px-1 text-right">
                    <CampoValor valor={l.valor} aoSalvar={(n) => void atualizar(l, { valor: n })} />
                  </td>
                  <td className="py-1.5 px-1">
                    <input type="date" className={CELULA} value={l.vencimento ?? ""} onChange={(e) => void atualizar(l, { vencimento: e.target.value || null })} />
                  </td>
                  <td className="py-1.5 px-1 whitespace-nowrap">
                    {l.pagoEm ? (
                      <span className="inline-flex items-center gap-1">
                        <input type="date" className={`${CELULA} text-green-700`} value={l.pagoEm} onChange={(e) => void atualizar(l, { pagoEm: e.target.value || null })} />
                      </span>
                    ) : (
                      <button type="button" onClick={() => void atualizar(l, { pagoEm: hoje })} className="text-[11px] border border-gray-300 rounded px-2 py-0.5 text-gray-600 hover:bg-gray-50">
                        marcar pago
                      </button>
                    )}
                  </td>
                  <td className="py-1.5 pl-1 text-right">
                    <button type="button" onClick={() => void remover(l)} className="text-[11px] text-gray-300 hover:text-red-500">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3">
        <label className={ROTULO}>Observações do pagamento</label>
        <textarea
          className={CAMPO}
          rows={2}
          placeholder="Ex.: proprietário vai pagar o material no boleto da loja; mão de obra descontada do repasse de dezembro."
          value={obsTexto}
          onChange={(e) => setObsTexto(e.target.value)}
          onBlur={() => {
            if ((obsTexto.trim() || null) !== (obs?.trim() || null)) void salvarCampo("obs", "pagamento_obs", obsTexto.trim() || null);
          }}
        />
      </div>
      {erro && <div className="text-[11px] text-red-600 mt-2">{erro}</div>}
    </div>
  );
}
