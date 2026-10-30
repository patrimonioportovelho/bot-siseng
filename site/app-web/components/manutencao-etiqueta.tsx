"use client";

import { useMemo, useState } from "react";
import {
  CHAVE_POSSE,
  CHAVE_POSSE_LABEL,
  COLUNAS_KANBAN,
  SOLICITADO_POR,
  SOLICITADO_POR_LABEL,
  TIPOS_ATIVIDADE,
  TIPOS_SERVICO,
  TIPO_ATIVIDADE_LABEL,
  URGENCIAS,
  URGENCIA_COR,
  URGENCIA_LABEL,
  iconeTipoServico
} from "@/lib/manutencao/opcoes";
import { COR_SLA_MAN, diasParado, situacaoSlaMan, textoMeta } from "@/lib/manutencao/quadro";
import { CampoSelectAuto, CampoTextoAuto, Rotulo, type ResultadoSalvar } from "@/components/recrutamento-campos";
import { ManutencaoWhatsapp, type PedidoMensagem } from "@/components/manutencao-whatsapp";
import { BotaoFichaCompleta } from "@/components/botao-ficha-completa";
import type { AtividadeMan, ItemChecklistMan, NotaManutencao } from "@/app/manutencao/actions";

export type DadosMan = {
  id: string;
  titulo: string;
  tipoServico: string;
  urgencia: string;
  solicitadoPor: string | null;
  coluna: string;
  desde: string; // ISO — entrou na coluna atual
  imovelId: string;
  imovelIdLegado: string | null;
  endereco: string | null;
  proprietario: { nome: string; telefone: string | null } | null;
  prestadorId: string | null;
  chavePosse: string;
  chaveCom: string | null;
  chaveAtualizadaEm: string | null; // ISO
  checklist: ItemChecklistMan[];
  atividades: AtividadeMan[];
  notas: NotaManutencao[];
};

type Resultado<T> = ({ ok: true } & T) | { ok: false; erro: string };

type Acoes = {
  moverColuna: (id: string, novaColuna: string) => Promise<void>;
  salvarCampo: (id: string, campo: string, valor: string | null) => Promise<ResultadoSalvar>;
  adicionarNota: (id: string, texto: string) => Promise<Resultado<{ nota: NotaManutencao }>>;
  registrarContato: (id: string, dados: { para: string; modelo: string; texto: string }) => Promise<Resultado<{ nota: NotaManutencao }>>;
  adicionarChecklist: (id: string, label: string) => Promise<Resultado<{ item: ItemChecklistMan }>>;
  marcarChecklist: (itemId: string, done: boolean) => Promise<ResultadoSalvar>;
  removerChecklist: (itemId: string) => Promise<ResultadoSalvar>;
  criarAtividade: (
    id: string,
    dados: { tipo: string; titulo: string; data: string; notas: string | null }
  ) => Promise<Resultado<{ atividade: AtividadeMan }>>;
  marcarAtividade: (atividadeId: string, feito: boolean) => Promise<ResultadoSalvar>;
  removerAtividade: (atividadeId: string) => Promise<ResultadoSalvar>;
};

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";
const CARTAO = "bg-white border border-gray-200 rounded-xl p-4";

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Porto_Velho" });
}

function dataBr(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// Etiqueta da Manutenção — o ticket inteiro numa tela (sem precisar abrir a
// ficha): dados do serviço, chave, atividades agendadas (que podem ser
// enviadas como mensagem às partes), checklist, mensagem de WhatsApp e notas.
// Tudo salva sozinho. A ficha completa continua disponível ao lado.
export function ManutencaoEtiqueta({
  d,
  prestadores,
  remetentes,
  remetenteLogado,
  agoraMs,
  hoje,
  acoes
}: {
  d: DadosMan;
  prestadores: { id: string; nome: string; telefone: string | null }[];
  remetentes: { id: string; nome: string }[];
  remetenteLogado: { id: string; primeiroNome: string };
  agoraMs: number;
  hoje: string; // yyyy-mm-dd
  acoes: Acoes;
}) {
  const [titulo, setTitulo] = useState(d.titulo);
  const [tipoServico, setTipoServico] = useState(d.tipoServico);
  const [coluna, setColuna] = useState(d.coluna);
  const [desde, setDesde] = useState(d.desde);
  const [urgencia, setUrgencia] = useState(d.urgencia);
  const [prestadorId, setPrestadorId] = useState(d.prestadorId);
  const [chavePosse, setChavePosse] = useState(d.chavePosse);
  const [chaveCom, setChaveCom] = useState(d.chaveCom);
  const [chaveEm, setChaveEm] = useState(d.chaveAtualizadaEm);
  const [notas, setNotas] = useState(d.notas);
  const [checklist, setChecklist] = useState(d.checklist);
  const [atividades, setAtividades] = useState(d.atividades);
  const [pedido, setPedido] = useState<PedidoMensagem | null>(null);

  const [movendo, setMovendo] = useState(false);
  const [erroMover, setErroMover] = useState("");
  const [textoNota, setTextoNota] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [erroNota, setErroNota] = useState("");
  const [novoItem, setNovoItem] = useState("");
  const [erroLista, setErroLista] = useState("");
  const [novaAtiv, setNovaAtiv] = useState({ tipo: "", titulo: "", data: hoje, notas: "" });
  const [agendando, setAgendando] = useState(false);

  const colunaDef = COLUNAS_KANBAN.find((c) => c.id === coluna);
  const dias = diasParado(desde, agoraMs);
  const sla = situacaoSlaMan(coluna, urgencia, dias);
  const cor = URGENCIA_COR[urgencia] ?? URGENCIA_COR.media;
  const prestador = prestadores.find((p) => p.id === prestadorId) ?? null;
  const servico = TIPOS_SERVICO.find((t) => t.value === tipoServico)?.label ?? tipoServico;
  const chaveTexto = chaveCom ? `${CHAVE_POSSE_LABEL[chavePosse] ?? chavePosse} (${chaveCom})` : (CHAVE_POSSE_LABEL[chavePosse] ?? chavePosse);
  const feitosChecklist = checklist.filter((i) => i.done).length;
  const proximoN = (pedido?.n ?? 0) + 1;

  async function mover(novaColuna: string) {
    if (novaColuna === coluna) return;
    const anterior = { coluna, desde };
    setErroMover("");
    setMovendo(true);
    // na hora na tela; volta se o servidor recusar
    setColuna(novaColuna);
    setDesde(new Date().toISOString());
    try {
      await acoes.moverColuna(d.id, novaColuna);
    } catch (e) {
      setColuna(anterior.coluna);
      setDesde(anterior.desde);
      setErroMover(e instanceof Error ? e.message : "Não foi possível mover o ticket.");
    } finally {
      setMovendo(false);
    }
  }

  async function guardarNota() {
    if (!textoNota.trim()) return;
    setSalvandoNota(true);
    setErroNota("");
    const r = await acoes.adicionarNota(d.id, textoNota);
    setSalvandoNota(false);
    if (r.ok) {
      setNotas((l) => [r.nota, ...l]);
      setTextoNota("");
    } else setErroNota(r.erro);
  }

  async function adicionarItem() {
    const label = novoItem.trim();
    if (!label) return;
    setErroLista("");
    const r = await acoes.adicionarChecklist(d.id, label);
    if (r.ok) {
      setChecklist((l) => [...l, r.item]);
      setNovoItem("");
    } else setErroLista(r.erro);
  }

  async function alternarItem(item: ItemChecklistMan) {
    setErroLista("");
    setChecklist((l) => l.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
    const r = await acoes.marcarChecklist(item.id, !item.done);
    if (!r.ok) {
      setChecklist((l) => l.map((i) => (i.id === item.id ? item : i)));
      setErroLista(r.erro);
    }
  }

  async function removerItem(item: ItemChecklistMan) {
    setErroLista("");
    setChecklist((l) => l.filter((i) => i.id !== item.id));
    const r = await acoes.removerChecklist(item.id);
    if (!r.ok) {
      setChecklist((l) => [...l, item]);
      setErroLista(r.erro);
    }
  }

  async function agendar() {
    if (!novaAtiv.tipo || !novaAtiv.titulo.trim() || !novaAtiv.data) {
      setErroLista("Escolha o tipo, escreva a descrição e a data da atividade.");
      return;
    }
    setAgendando(true);
    setErroLista("");
    const r = await acoes.criarAtividade(d.id, { ...novaAtiv, notas: novaAtiv.notas || null });
    setAgendando(false);
    if (r.ok) {
      setAtividades((l) => [...l, r.atividade].sort((a, b) => a.data.localeCompare(b.data)));
      setNovaAtiv({ tipo: "", titulo: "", data: hoje, notas: "" });
    } else setErroLista(r.erro);
  }

  async function alternarAtividade(a: AtividadeMan) {
    setErroLista("");
    setAtividades((l) => l.map((x) => (x.id === a.id ? { ...x, feito: !x.feito } : x)));
    const r = await acoes.marcarAtividade(a.id, !a.feito);
    if (!r.ok) {
      setAtividades((l) => l.map((x) => (x.id === a.id ? a : x)));
      setErroLista(r.erro);
    }
  }

  async function removerAtividade(a: AtividadeMan) {
    setErroLista("");
    setAtividades((l) => l.filter((x) => x.id !== a.id));
    const r = await acoes.removerAtividade(a.id);
    if (!r.ok) {
      setAtividades((l) => [...l, a].sort((x, y) => x.data.localeCompare(y.data)));
      setErroLista(r.erro);
    }
  }

  const contexto = useMemo(
    () => ({
      servico,
      titulo,
      imovel: d.endereco,
      custoEstimado: null,
      custoFinal: null,
      urgencia: URGENCIA_LABEL[urgencia] ?? urgencia,
      chave: chaveTexto
    }),
    [servico, titulo, d.endereco, urgencia, chaveTexto]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className={CARTAO}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-base font-bold text-gray-900">
              {iconeTipoServico(tipoServico)} {titulo}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-700">{colunaDef?.label}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cor.bg} ${cor.texto} ${cor.borda}`}>
                {URGENCIA_LABEL[urgencia] ?? urgencia}
              </span>
              {sla !== "sem_meta" && (
                <span className={`text-[11px] font-semibold ${COR_SLA_MAN[sla]}`}>
                  {dias === 0 ? "entrou hoje nesta etapa" : `parado há ${dias} dia${dias === 1 ? "" : "s"}`} · {textoMeta(coluna, urgencia)}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-600 mt-2 flex items-center gap-3 flex-wrap">
              <span>
                Imóvel: {d.imovelIdLegado ?? d.imovelId.slice(0, 8)} — {d.endereco ?? "Sem endereço"}
              </span>
              {d.proprietario && <span>Proprietário: {d.proprietario.nome}</span>}
              {prestador && <span>Prestador: {prestador.nome}</span>}
            </div>
            <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
              <span>🔑 {chaveTexto}</span>
              {checklist.length > 0 && (
                <span>
                  Checklist {feitosChecklist}/{checklist.length}
                </span>
              )}
              {atividades.some((a) => !a.feito) && <span>{atividades.filter((a) => !a.feito).length} atividade(s) a fazer</span>}
            </div>
          </div>
          <BotaoFichaCompleta avaliacaoId={d.id} base={`/manutencao/${d.id}`} nome={titulo} />
        </div>
      </div>

      {/* Dados do serviço */}
      <div className={CARTAO}>
        <div className="text-xs font-bold text-gray-700 mb-3">Dados do serviço</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Rotulo>Título</Rotulo>
            <CampoTextoAuto
              valor={d.titulo}
              salvar={(v) => {
                if (v) setTitulo(v);
                return acoes.salvarCampo(d.id, "titulo", v);
              }}
            />
          </div>
          <div>
            <Rotulo>Etapa do quadro</Rotulo>
            <select className={CAMPO} value={coluna} onChange={(e) => void mover(e.target.value)}>
              {COLUNAS_KANBAN.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {movendo && <span className="text-[10px] text-gray-400">Movendo…</span>}
            {erroMover && <div className="text-[11px] text-red-600 mt-1">{erroMover}</div>}
          </div>
          <div>
            <Rotulo>Urgência</Rotulo>
            <CampoSelectAuto
              valor={urgencia}
              vazio="—"
              opcoes={URGENCIAS.map((u) => ({ valor: u, rotulo: URGENCIA_LABEL[u] }))}
              salvar={(v) => {
                if (v) setUrgencia(v);
                return acoes.salvarCampo(d.id, "urgencia", v);
              }}
            />
          </div>
          <div>
            <Rotulo>Tipo de serviço</Rotulo>
            <CampoSelectAuto
              valor={tipoServico}
              vazio="—"
              opcoes={TIPOS_SERVICO.map((t) => ({ valor: t.value, rotulo: `${t.icone} ${t.label}` }))}
              salvar={(v) => {
                if (v) setTipoServico(v);
                return acoes.salvarCampo(d.id, "tipo_servico", v);
              }}
            />
          </div>
          <div>
            <Rotulo>Solicitado por</Rotulo>
            <CampoSelectAuto
              valor={d.solicitadoPor}
              vazio="—"
              opcoes={SOLICITADO_POR.map((s) => ({ valor: s, rotulo: SOLICITADO_POR_LABEL[s] }))}
              salvar={(v) => acoes.salvarCampo(d.id, "solicitado_por", v)}
            />
          </div>
          <div className="md:col-span-2">
            <Rotulo>Prestador de serviço</Rotulo>
            <CampoSelectAuto
              valor={prestadorId}
              vazio="Sem prestador"
              opcoes={prestadores.map((p) => ({ valor: p.id, rotulo: p.nome }))}
              salvar={(v) => {
                setPrestadorId(v);
                return acoes.salvarCampo(d.id, "prestador_id", v);
              }}
            />
          </div>
        </div>
      </div>

      {/* Chave */}
      <div className={CARTAO}>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="text-xs font-bold text-gray-700">🔑 Chave do imóvel</div>
          <button
            type="button"
            onClick={() => setPedido({ tipo: "chave", n: proximoN })}
            className="text-[11px] border border-green-300 text-green-700 rounded-lg px-2.5 py-1 hover:bg-green-50"
          >
            ✉ Enviar mensagem sobre a chave
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Rotulo>Com quem está a chave</Rotulo>
            <CampoSelectAuto
              valor={chavePosse}
              vazio="—"
              opcoes={CHAVE_POSSE.map((c) => ({ valor: c, rotulo: CHAVE_POSSE_LABEL[c] }))}
              salvar={(v) => {
                if (v) {
                  setChavePosse(v);
                  setChaveEm(new Date().toISOString());
                }
                return acoes.salvarCampo(d.id, "chave_posse", v);
              }}
            />
          </div>
          <div>
            <Rotulo>Nome de quem está com ela</Rotulo>
            <CampoTextoAuto
              valor={d.chaveCom}
              placeholder="Ex.: João (corretor)"
              salvar={(v) => {
                setChaveCom(v);
                setChaveEm(new Date().toISOString());
                return acoes.salvarCampo(d.id, "chave_com", v);
              }}
            />
          </div>
        </div>
        {chaveEm && <div className="text-[11px] text-gray-400 mt-2">Posição da chave atualizada em {dataHora(chaveEm)}.</div>}
      </div>

      {/* Atividades */}
      <div className={CARTAO}>
        <div className="text-xs font-bold text-gray-700 mb-1">Atividades agendadas</div>
        <p className="text-[11px] text-gray-400 mb-3">Aparecem também no calendário. O botão ✉ monta a mensagem da atividade para quem você escolher.</p>
        <div className="grid md:grid-cols-4 gap-2 mb-3">
          <select className={CAMPO} value={novaAtiv.tipo} onChange={(e) => setNovaAtiv((a) => ({ ...a, tipo: e.target.value }))}>
            <option value="">Tipo...</option>
            {TIPOS_ATIVIDADE.map((t) => (
              <option key={t} value={t}>
                {TIPO_ATIVIDADE_LABEL[t]}
              </option>
            ))}
          </select>
          <input
            className={`${CAMPO} md:col-span-2`}
            placeholder="Descrição"
            value={novaAtiv.titulo}
            onChange={(e) => setNovaAtiv((a) => ({ ...a, titulo: e.target.value }))}
          />
          <input type="date" className={CAMPO} value={novaAtiv.data} onChange={(e) => setNovaAtiv((a) => ({ ...a, data: e.target.value }))} />
          <input
            className={`${CAMPO} md:col-span-3`}
            placeholder="Observação (vai na mensagem, opcional)"
            value={novaAtiv.notas}
            onChange={(e) => setNovaAtiv((a) => ({ ...a, notas: e.target.value }))}
          />
          <button
            type="button"
            onClick={() => void agendar()}
            disabled={agendando}
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap disabled:opacity-50"
          >
            {agendando ? "Agendando…" : "+ Agendar"}
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {atividades.map((a) => {
            const atrasada = !a.feito && a.data < hoje;
            return (
              <div
                key={a.id}
                className={`flex items-center gap-2 border rounded-lg px-2.5 py-1.5 group ${atrasada ? "bg-[#B14226]/5 border-[#B14226]/30" : "border-gray-100"}`}
              >
                <input type="checkbox" checked={a.feito} onChange={() => void alternarAtividade(a)} className="rounded" />
                <div className="flex-1 min-w-0">
                  <span className={`text-xs ${a.feito ? "line-through text-gray-400" : atrasada ? "text-[#B14226] font-medium" : "text-gray-700"}`}>
                    {TIPO_ATIVIDADE_LABEL[a.tipo] ?? a.tipo} — {a.titulo}
                  </span>
                  {a.notas && <div className="text-[11px] text-gray-400">{a.notas}</div>}
                </div>
                <span className={`text-[11px] whitespace-nowrap ${atrasada ? "text-[#B14226]" : "text-gray-400"}`}>{dataBr(a.data)}</span>
                <button
                  type="button"
                  onClick={() => setPedido({ tipo: "atividade", atividade: a, n: proximoN })}
                  title="Enviar esta atividade como mensagem"
                  className="text-[11px] border border-green-300 text-green-700 rounded-lg px-2 py-0.5 hover:bg-green-50 whitespace-nowrap"
                >
                  ✉ Enviar
                </button>
                <button
                  type="button"
                  onClick={() => void removerAtividade(a)}
                  className="text-[11px] text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                >
                  remover
                </button>
              </div>
            );
          })}
          {atividades.length === 0 && <p className="text-xs text-gray-400">Nenhuma atividade agendada ainda.</p>}
        </div>
        {erroLista && <div className="text-[11px] text-red-600 mt-2">{erroLista}</div>}
      </div>

      {/* Mensagem de WhatsApp */}
      <ManutencaoWhatsapp
        ticketId={d.id}
        coluna={coluna}
        proprietario={d.proprietario}
        prestador={prestador ? { nome: prestador.nome, telefone: prestador.telefone } : null}
        remetentes={remetentes}
        remetenteIdPadrao={remetentes.some((r) => r.id === remetenteLogado.id) ? remetenteLogado.id : null}
        remetenteFallback={remetenteLogado.primeiroNome}
        contexto={contexto}
        pedido={pedido}
        registrarContato={acoes.registrarContato}
        aoRegistrar={(nota) => setNotas((l) => [nota, ...l])}
      />

      {/* Checklist */}
      <div className={CARTAO}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold text-gray-700">Checklist</div>
          {checklist.length > 0 && (
            <span className="text-[11px] text-gray-400">
              {feitosChecklist}/{checklist.length} concluído{feitosChecklist === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex gap-2 mb-3">
          <input
            className={CAMPO}
            placeholder="Novo item do checklist..."
            value={novoItem}
            onChange={(e) => setNovoItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void adicionarItem();
            }}
          />
          <button
            type="button"
            onClick={() => void adicionarItem()}
            disabled={!novoItem.trim()}
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap disabled:opacity-50"
          >
            + Item
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {checklist.map((i) => (
            <div key={i.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-2.5 py-1.5 group">
              <input type="checkbox" checked={i.done} onChange={() => void alternarItem(i)} className="rounded" />
              <span className={`flex-1 text-xs ${i.done ? "line-through text-gray-400" : "text-gray-700"}`}>{i.label}</span>
              <button
                type="button"
                onClick={() => void removerItem(i)}
                className="text-[11px] text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100"
              >
                remover
              </button>
            </div>
          ))}
          {checklist.length === 0 && <p className="text-xs text-gray-400">Nenhum item ainda.</p>}
        </div>
      </div>

      {/* Notas e contatos */}
      <div className={CARTAO}>
        <div className="text-xs font-bold text-gray-700 mb-3">Notas e contatos</div>
        <div className="flex gap-2 mb-3">
          <input
            className={CAMPO}
            placeholder="Escreva uma nota..."
            value={textoNota}
            onChange={(e) => setTextoNota(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void guardarNota();
            }}
          />
          <button
            type="button"
            onClick={() => void guardarNota()}
            disabled={salvandoNota || !textoNota.trim()}
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap disabled:opacity-50"
          >
            {salvandoNota ? "Salvando…" : "+ Nota"}
          </button>
        </div>
        {erroNota && <div className="text-[11px] text-red-600 mb-2">{erroNota}</div>}
        <div className="flex flex-col gap-2">
          {notas.map((n) => (
            <div key={n.id} className="border border-gray-100 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-700 whitespace-pre-wrap">{n.texto}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{dataHora(n.criadoEm)}</div>
            </div>
          ))}
          {notas.length === 0 && <p className="text-xs text-gray-400">Nenhuma nota ainda. As mensagens enviadas por aqui ficam registradas.</p>}
        </div>
      </div>
    </div>
  );
}
