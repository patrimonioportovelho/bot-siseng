"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MODELOS_MENSAGEM,
  MODELO_POR_ID,
  diaMensagem,
  dataCurta,
  modeloSugerido,
  numeroWhatsapp,
  preencherMensagem,
  primeiroNome,
  type ContextoMensagem
} from "@/lib/recrutamento/mensagens";
import type { ColunaId } from "@/lib/recrutamento/opcoes";
import { Rotulo } from "@/components/recrutamento-campos";
import type { AtividadeRegistrada } from "@/app/recrutamento/actions";

export type TurmaMensagem = {
  nome: string;
  inicio: string;
  passosInicio: string | null;
  passosFim: string | null;
  especificosA: string | null;
  especificosB: string | null;
  acolhida: string | null;
};

type Registrar = (
  id: string,
  dados: { tipo: string; resultado: string | null; nota: string | null; proximaAcaoData: string | null }
) => Promise<{ ok: true; atividade: AtividadeRegistrada } | { ok: false; erro: string }>;

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";

// Gerador de mensagem de WhatsApp: escolhe o modelo (já sugerido pela etapa),
// ajusta o texto e abre a conversa no WhatsApp em outra aba. O clique também
// registra o contato em "Contatos e retornos".
export function RecrutamentoWhatsapp({
  id,
  nome,
  telefoneDigitos,
  coluna,
  remetentes,
  remetenteIdPadrao,
  remetenteFallback,
  reuniao1,
  reuniao2,
  turma,
  acolhidaEm,
  faltou,
  followupPendente,
  registrarAtividade,
  aoRegistrar
}: {
  id: string;
  nome: string;
  telefoneDigitos: string | null;
  coluna: ColunaId;
  // Quem assina a mensagem: lista de responsáveis; o padrão é o responsável
  // do item (ou o da etapa, ou quem está logado) — ver Etiqueta.
  remetentes: { id: string; nome: string }[];
  remetenteIdPadrao: string | null;
  remetenteFallback: string;
  reuniao1: { data: string | null; status: string | null };
  reuniao2: { data: string | null; status: string | null };
  turma: TurmaMensagem | null;
  acolhidaEm: string | null;
  faltou: boolean;
  followupPendente: string | null;
  registrarAtividade: Registrar;
  aoRegistrar: (a: AtividadeRegistrada) => void;
}) {
  const numero = numeroWhatsapp(telefoneDigitos);

  // Remetente: acompanha o responsável do item enquanto ninguém escolher outro
  // nome na lista.
  const [remetenteId, setRemetenteId] = useState<string>(remetenteIdPadrao ?? "");
  const escolhidoNaMao = useRef(false);
  useEffect(() => {
    if (!escolhidoNaMao.current) setRemetenteId(remetenteIdPadrao ?? "");
  }, [remetenteIdPadrao]);
  const remetente = primeiroNome(remetentes.find((r) => r.id === remetenteId)?.nome ?? remetenteFallback) || remetenteFallback;

  const ctx: ContextoMensagem = useMemo(
    () => ({
      nome: primeiroNome(nome),
      remetente,
      data_reuniao1: diaMensagem(reuniao1.data),
      data_reuniao2: diaMensagem(reuniao2.data),
      turma: turma?.nome ?? null,
      inicio_turma: dataCurta(turma?.inicio),
      passos_inicio: dataCurta(turma?.passosInicio),
      passos_fim: dataCurta(turma?.passosFim),
      especificos_a: dataCurta(turma?.especificosA),
      especificos_b: dataCurta(turma?.especificosB),
      acolhida: diaMensagem(acolhidaEm ?? turma?.acolhida ?? null)
    }),
    [nome, remetente, reuniao1.data, reuniao2.data, turma, acolhidaEm]
  );

  const [modeloId, setModeloId] = useState(
    modeloSugerido({
      coluna,
      faltou,
      statusReuniao1: reuniao1.status,
      statusReuniao2: reuniao2.status,
      followupPendente
    })
  );
  const modelo = MODELO_POR_ID.get(modeloId) ?? MODELOS_MENSAGEM[0];
  const [texto, setTexto] = useState(() => preencherMensagem(modelo.texto, ctx));
  const [editado, setEditado] = useState(false);
  const remetenteAnterior = useRef(remetente);
  // Trocou o remetente: refaz o texto (se não foi editado) ou troca só o nome
  // em "aqui é <nome>" (se já foi editado).
  useEffect(() => {
    const antigo = remetenteAnterior.current;
    if (antigo === remetente) return;
    remetenteAnterior.current = remetente;
    if (!editado) {
      setTexto(preencherMensagem(modelo.texto, ctx));
    } else {
      const escapado = antigo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      setTexto((t) => t.replace(new RegExp(`(aqui é )${escapado}\\b`, "gi"), `$1${remetente}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remetente]);
  const [estado, setEstado] = useState<"ocioso" | "registrando" | "registrado" | "erro">("ocioso");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  function trocarModelo(novo: string) {
    setModeloId(novo);
    setEditado(false);
    const m = MODELO_POR_ID.get(novo);
    if (m) setTexto(preencherMensagem(m.texto, ctx));
  }

  const pendentes = (texto.match(/\[[^\]]+\]/g) ?? []).length;

  function abrirWhatsapp() {
    if (!numero) return;
    // window.open precisa acontecer direto no clique (senão o navegador
    // bloqueia a aba nova) — o registro do contato vem logo depois.
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
    void registrar();
  }

  async function registrar() {
    setEstado("registrando");
    setErro("");
    const r = await registrarAtividade(id, {
      tipo: "WhatsApp",
      resultado: "Mensagem enviada",
      nota: `Modelo: ${modelo.titulo}\n${texto}`,
      proximaAcaoData: null
    });
    if (r.ok) {
      aoRegistrar(r.atividade);
      setEstado("registrado");
      setTimeout(() => setEstado((e) => (e === "registrado" ? "ocioso" : e)), 4000);
    } else {
      setErro(r.erro);
      setEstado("erro");
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não foi possível copiar.");
    }
  }

  const grupos = Array.from(new Set(MODELOS_MENSAGEM.map((m) => m.grupo)));

  return (
    <div className="bg-white border border-green-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="text-sm font-bold text-gray-800">Mensagem de WhatsApp</div>
        <div className="text-[11px] text-gray-400">
          {numero ? "Abre a conversa em outra aba e registra o contato." : "Sem telefone cadastrado — adicione no cadastro do parceiro."}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-2">
        <div>
          <Rotulo>Quem envia (responsável do item)</Rotulo>
          <select
            className={CAMPO}
            value={remetenteId}
            onChange={(e) => {
              escolhidoNaMao.current = true;
              setRemetenteId(e.target.value);
            }}
          >
            <option value="">{remetenteFallback} (você)</option>
            {remetentes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <Rotulo>Modelo (sugerido para esta etapa)</Rotulo>
          <select className={CAMPO} value={modeloId} onChange={(e) => trocarModelo(e.target.value)}>
            {grupos.map((g) => (
              <optgroup key={g} label={g}>
                {MODELOS_MENSAGEM.filter((m) => m.grupo === g).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.titulo}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <textarea
        className={CAMPO}
        rows={6}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setEditado(true);
        }}
      />
      <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
        <div className="text-[10px] text-gray-400">
          {pendentes > 0 ? (
            <span className="text-amber-700">Complete os trechos entre [colchetes] antes de enviar.</span>
          ) : (
            "Você pode editar o texto antes de enviar."
          )}
          {editado && (
            <button type="button" onClick={() => trocarModelo(modeloId)} className="ml-2 underline">
              restaurar modelo
            </button>
          )}
        </div>
        <div className="text-[10px] text-gray-400">Evite falar em “vaga” e nunca prometa ganho.</div>
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button
          type="button"
          onClick={abrirWhatsapp}
          disabled={!numero || estado === "registrando"}
          className="text-xs bg-green-600 text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50 hover:opacity-90"
        >
          Abrir no WhatsApp
        </button>
        <button type="button" onClick={() => void copiar()} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600">
          {copiado ? "Copiado ✓" : "Copiar mensagem"}
        </button>
        {estado === "registrando" && <span className="text-[11px] text-gray-400">Registrando o contato…</span>}
        {estado === "registrado" && <span className="text-[11px] text-green-600">Contato registrado em “Contatos e retornos” ✓</span>}
        {estado === "erro" && <span className="text-[11px] text-red-600">{erro || "Não foi possível registrar o contato."}</span>}
      </div>
    </div>
  );
}
