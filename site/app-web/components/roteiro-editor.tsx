"use client";

import { useState } from "react";
import { ETAPAS, PERGUNTAS, type Pergunta } from "@/lib/crm/roteiro";
import { aceitaOpcaoNova, aplicarEdicoes, podeEsconder, type EdicaoOpcao, type EdicaoPergunta, type EdicoesRoteiro, type OpcaoNova } from "@/lib/crm/roteiro-edicoes";

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";
const LABEL = "text-[11px] text-gray-600 block mb-0.5";

type Salvar = (perguntaId: string, edicao: EdicaoPergunta | null) => Promise<{ ok: true; edicao: EdicaoPergunta | null } | { ok: false; erro: string }>;

// Formulário de uma pergunta: começa com o texto em vigor; salvar guarda só o que difere do original.
function Formulario({ base, edicao, salvar, aoSalvar }: { base: Pergunta; edicao: EdicaoPergunta | undefined; salvar: Salvar; aoSalvar: (e: EdicaoPergunta | null) => void }) {
  const inicial = (e: EdicaoPergunta | undefined) => ({
    texto: e?.texto ?? base.texto,
    fala: e?.fala ?? base.fala ?? "",
    dica: e?.dica ?? base.dica ?? "",
    opcoes: Object.fromEntries(
      (base.opcoes ?? []).map((o) => [o.id, { rotulo: e?.opcoes?.[o.id]?.rotulo ?? o.rotulo, resposta: e?.opcoes?.[o.id]?.resposta ?? o.resposta, oculta: !!e?.opcoes?.[o.id]?.oculta } as EdicaoOpcao])
    ),
    novas: e?.novas ?? ([] as OpcaoNova[])
  });
  const [f, setF] = useState(() => inicial(edicao));
  const [mensagem, setMensagem] = useState<{ erro: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const mudarOpcao = (id: string, p: Partial<EdicaoOpcao>) => setF((x) => ({ ...x, opcoes: { ...x.opcoes, [id]: { ...x.opcoes[id], ...p } } }));
  const mudarNova = (i: number, p: Partial<OpcaoNova>) => setF((x) => ({ ...x, novas: x.novas.map((n, j) => (j === i ? { ...n, ...p } : n)) }));

  async function gravar(valor: EdicaoPergunta | null) {
    setOcupado(true);
    setMensagem(null);
    try {
      const r = await salvar(base.id, valor);
      if (!r.ok) {
        setMensagem({ erro: true, texto: r.erro });
        return;
      }
      aoSalvar(r.edicao);
      setF(inicial(r.edicao ?? undefined));
      setMensagem({ erro: false, texto: r.edicao ? "Salvo. Já vale para os próximos atendimentos." : "Texto original em vigor." });
    } catch {
      setMensagem({ erro: true, texto: "Não foi possível salvar agora. Tente de novo." });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-3 pb-3">
      <div>
        <label className={LABEL}>Pergunta</label>
        <input className={CAMPO} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} maxLength={200} />
      </div>
      {base.id !== "Q_CONF" && (
        <div>
          <label className={LABEL}>Fala sugerida (o que dizer ao cliente)</label>
          <textarea className={CAMPO} rows={2} value={f.fala} onChange={(e) => setF({ ...f, fala: e.target.value })} maxLength={600} />
        </div>
      )}
      <div>
        <label className={LABEL}>Orientação para quem atende</label>
        <input className={CAMPO} value={f.dica} onChange={(e) => setF({ ...f, dica: e.target.value })} maxLength={400} />
      </div>

      {!!base.opcoes?.length && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold text-gray-700">Opções</div>
          {base.opcoes.map((o) => (
            <div key={o.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <input className={`${CAMPO} ${f.opcoes[o.id].oculta ? "line-through !text-gray-400" : ""}`} value={f.opcoes[o.id].rotulo ?? ""} onChange={(e) => mudarOpcao(o.id, { rotulo: e.target.value })} maxLength={80} aria-label={`Opção ${o.rotulo}`} />
                {podeEsconder(base.id, o.id) ? (
                  <label className="text-[11px] text-gray-600 flex items-center gap-1 whitespace-nowrap">
                    <input type="checkbox" checked={!!f.opcoes[o.id].oculta} onChange={(e) => mudarOpcao(o.id, { oculta: e.target.checked })} /> esconder
                  </label>
                ) : (
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">fixa</span>
                )}
              </div>
              {o.resposta !== undefined && (
                <input className={`${CAMPO} !bg-green-50`} value={f.opcoes[o.id].resposta ?? ""} onChange={(e) => mudarOpcao(o.id, { resposta: e.target.value })} maxLength={400} placeholder="Resposta sugerida" aria-label="Resposta sugerida" />
              )}
            </div>
          ))}

          {f.novas.map((n, i) => (
            <div key={n.id} className="rounded-lg border border-orange-200 bg-orange-50 p-2 grid md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <div>
                <label className={LABEL}>Opção nova</label>
                <input className={CAMPO} value={n.rotulo} onChange={(e) => mudarNova(i, { rotulo: e.target.value })} maxLength={80} />
              </div>
              <div>
                <label className={LABEL}>Funciona igual a{base.tipo === "unica" ? " *" : " (opcional)"}</label>
                <select className={CAMPO} value={n.igualA ?? ""} onChange={(e) => mudarNova(i, { igualA: e.target.value || undefined })}>
                  <option value="">{base.tipo === "unica" ? "Escolha…" : "Nenhuma"}</option>
                  {base.opcoes?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={() => setF({ ...f, novas: f.novas.filter((_, j) => j !== i) })} className="text-[11px] text-gray-500 hover:text-red-600 pb-2">
                Tirar
              </button>
              {base.opcoes?.some((o) => o.resposta !== undefined) && (
                <input className={`${CAMPO} md:col-span-3`} value={n.resposta ?? ""} onChange={(e) => mudarNova(i, { resposta: e.target.value })} maxLength={400} placeholder="Resposta sugerida (opcional)" aria-label="Resposta sugerida da opção nova" />
              )}
            </div>
          ))}
          {aceitaOpcaoNova(base) && (
            <button type="button" onClick={() => setF({ ...f, novas: [...f.novas, { id: `nova_${Date.now().toString(36)}`, rotulo: "" }] })} className="text-[11px] text-primary underline self-start">
              + criar opção
            </button>
          )}
        </div>
      )}

      {mensagem && <div className={`text-xs ${mensagem.erro ? "text-red-600" : "text-green-700"}`}>{mensagem.texto}</div>}
      <div className="flex gap-2 flex-wrap">
        <button type="button" disabled={ocupado} onClick={() => void gravar({ texto: f.texto, fala: f.fala, dica: f.dica, opcoes: f.opcoes, novas: f.novas })} className="text-xs bg-orange-600 text-white rounded-lg px-5 py-2 font-semibold disabled:opacity-50">
          {ocupado ? "Gravando..." : "Salvar"}
        </button>
        {edicao && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => {
              if (window.confirm("Voltar esta pergunta ao texto original? As alterações dela serão apagadas.")) void gravar(null);
            }}
            className="text-xs border border-gray-300 rounded-lg px-4 py-2 font-semibold text-gray-600"
          >
            Restaurar o original
          </button>
        )}
      </div>
    </div>
  );
}

export function RoteiroEditor({ edicoes: iniciais, salvar }: { edicoes: EdicoesRoteiro; salvar: Salvar }) {
  const [edicoes, setEdicoes] = useState(iniciais);
  const [aberta, setAberta] = useState<string | null>(null);
  const emVigor = new Map(aplicarEdicoes(edicoes).map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      {ETAPAS.map((e) => (
        <div key={e.id} className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-sm font-bold text-gray-800 mb-1">{e.rotulo}</div>
          <div className="flex flex-col divide-y divide-gray-100">
            {PERGUNTAS.filter((p) => p.etapa === e.id).map((base) => (
              <div key={base.id}>
                <button type="button" onClick={() => setAberta(aberta === base.id ? null : base.id)} aria-expanded={aberta === base.id} className="w-full flex items-center gap-2 py-2 px-1 text-left">
                  <span className="text-gray-400 text-xs w-3">{aberta === base.id ? "▾" : "▸"}</span>
                  <span className="text-xs text-gray-800 flex-1">
                    {emVigor.get(base.id)?.texto}
                    <span className="text-gray-400"> · {base.resumo}</span>
                  </span>
                  {edicoes[base.id] && <span className="text-[10px] font-bold rounded-full border px-2 py-0.5 bg-orange-50 text-orange-700 border-orange-200">editada</span>}
                </button>
                {aberta === base.id && (
                  <Formulario
                    base={base}
                    edicao={edicoes[base.id]}
                    salvar={salvar}
                    aoSalvar={(nova) =>
                      setEdicoes((x) => {
                        const y = { ...x };
                        if (nova) y[base.id] = nova;
                        else delete y[base.id];
                        return y;
                      })
                    }
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
