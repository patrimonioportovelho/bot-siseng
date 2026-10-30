"use client";

import { useMemo, useState } from "react";
import { COLUNAS_KANBAN, AUTORIZADO_POR_LABEL, CHAVE_POSSE_LABEL, URGENCIAS, URGENCIA_COR, URGENCIA_LABEL, iconeTipoServico } from "@/lib/manutencao/opcoes";
import { COR_SLA_MAN, diasParado, situacaoSlaMan, textoMeta } from "@/lib/manutencao/quadro";
import { CampoSelectAuto, Rotulo, type ResultadoSalvar } from "@/components/recrutamento-campos";
import { ManutencaoWhatsapp } from "@/components/manutencao-whatsapp";
import { BotaoFichaCompleta } from "@/components/botao-ficha-completa";
import type { NotaManutencao } from "@/app/manutencao/actions";

export type DadosMan = {
  id: string;
  titulo: string;
  tipoServico: string;
  servico: string; // rótulo do tipo de serviço
  urgencia: string;
  coluna: string;
  desde: string; // ISO — entrou na coluna atual
  imovelId: string;
  imovelIdLegado: string | null;
  endereco: string | null;
  proprietario: { nome: string; telefone: string | null } | null;
  prestadorId: string | null;
  autorizadoPor: string;
  custoEstimado: string | null; // já formatado em R$
  custoFinal: string | null;
  chavePosse: string;
  chaveCom: string | null;
  checklist: { feitos: number; total: number };
  proximasAtividades: { titulo: string; data: string }[]; // data dd/mm
  notas: NotaManutencao[];
};

type Acoes = {
  moverColuna: (id: string, novaColuna: string) => Promise<void>;
  salvarCampo: (id: string, campo: string, valor: string | null) => Promise<ResultadoSalvar>;
  adicionarNota: (id: string, texto: string) => Promise<{ ok: true; nota: NotaManutencao } | { ok: false; erro: string }>;
  registrarContato: (
    id: string,
    dados: { para: string; modelo: string; texto: string }
  ) => Promise<{ ok: true; nota: NotaManutencao } | { ok: false; erro: string }>;
};

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";

function dataHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Porto_Velho" });
}

// Etiqueta da Manutenção — mesmo desenho da etiqueta do Financiamento e do
// Recrutamento: o ticket inteiro numa tela, com mover de etapa, mensagem de
// WhatsApp, notas/contatos e salvamento automático. A ficha completa abre ao
// lado (computador) ou em outra tela (celular).
export function ManutencaoEtiqueta({
  d,
  prestadores,
  remetentes,
  remetenteLogado,
  agoraMs,
  acoes
}: {
  d: DadosMan;
  prestadores: { id: string; nome: string; telefone: string | null }[];
  remetentes: { id: string; nome: string }[];
  remetenteLogado: { id: string; primeiroNome: string };
  agoraMs: number;
  acoes: Acoes;
}) {
  const [coluna, setColuna] = useState(d.coluna);
  const [desde, setDesde] = useState(d.desde);
  const [urgencia, setUrgencia] = useState(d.urgencia);
  const [prestadorId, setPrestadorId] = useState(d.prestadorId);
  const [notas, setNotas] = useState(d.notas);
  const [movendo, setMovendo] = useState(false);
  const [erroMover, setErroMover] = useState("");
  const [textoNota, setTextoNota] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [erroNota, setErroNota] = useState("");

  const colunaDef = COLUNAS_KANBAN.find((c) => c.id === coluna);
  const dias = diasParado(desde, agoraMs);
  const sla = situacaoSlaMan(coluna, urgencia, dias);
  const cor = URGENCIA_COR[urgencia] ?? URGENCIA_COR.media;
  const prestador = prestadores.find((p) => p.id === prestadorId) ?? null;

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

  const contexto = useMemo(
    () => ({
      servico: d.servico,
      titulo: d.titulo,
      imovel: d.endereco,
      custoEstimado: d.custoEstimado,
      custoFinal: d.custoFinal ?? d.custoEstimado,
      urgencia: URGENCIA_LABEL[urgencia] ?? urgencia,
      chave: d.chaveCom ? `${CHAVE_POSSE_LABEL[d.chavePosse] ?? d.chavePosse} (${d.chaveCom})` : (CHAVE_POSSE_LABEL[d.chavePosse] ?? d.chavePosse)
    }),
    [d, urgencia]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-base font-bold text-gray-900">
              {iconeTipoServico(d.tipoServico)} {d.titulo}
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
              {d.custoEstimado && <span>Estimado: {d.custoEstimado}</span>}
              {d.custoFinal && <span>Final: {d.custoFinal}</span>}
              <span>
                🔑 {CHAVE_POSSE_LABEL[d.chavePosse] ?? d.chavePosse}
                {d.chaveCom ? ` (${d.chaveCom})` : ""}
              </span>
              {d.checklist.total > 0 && (
                <span>
                  Checklist {d.checklist.feitos}/{d.checklist.total}
                </span>
              )}
            </div>
          </div>
          <BotaoFichaCompleta avaliacaoId={d.id} base={`/manutencao/${d.id}`} nome={d.titulo} />
        </div>
      </div>

      {/* Etapa e responsáveis */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="grid md:grid-cols-2 gap-3">
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
          <div>
            <Rotulo>Quem autorizou o serviço</Rotulo>
            <CampoSelectAuto
              valor={d.autorizadoPor}
              vazio="—"
              opcoes={Object.entries(AUTORIZADO_POR_LABEL).map(([v, l]) => ({ valor: v, rotulo: l }))}
              salvar={(v) => acoes.salvarCampo(d.id, "autorizado_por", v)}
            />
          </div>
        </div>
        {d.proximasAtividades.length > 0 && (
          <div className="mt-3 text-[11px] text-gray-500">
            <span className="font-semibold">Agendado:</span> {d.proximasAtividades.map((a) => `${a.data} — ${a.titulo}`).join(" · ")}
          </div>
        )}
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
        registrarContato={acoes.registrarContato}
        aoRegistrar={(nota) => setNotas((l) => [nota, ...l])}
      />

      {/* Notas e contatos */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Notas e contatos</div>
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
