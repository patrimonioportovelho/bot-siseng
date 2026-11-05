"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MODELOS_MENSAGEM_CLIENTE, MODELO_CLIENTE_POR_ID, modeloSugeridoCliente } from "@/lib/clientes/mensagens";
import type { EtapaFunilId } from "@/lib/clientes/funil";
import { numeroWhatsapp, preencherMensagem, primeiroNome } from "@/lib/whatsapp";
import type { ContatoCliente } from "@/app/clientes/funil-actions";

type Registrar = (
  clienteId: string,
  dados: { tipo: string; resultado: string | null; nota: string | null }
) => Promise<{ ok: true; contato: ContatoCliente } | { ok: false; erro: string }>;

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";
const LABEL = "text-[11px] text-gray-600 block mb-0.5";

// Gerador de mensagem de WhatsApp do cliente: o modelo já vem sugerido pela etapa, o texto pode ser
// ajustado e o clique abre a conversa em outra aba e registra o contato no histórico.
export function ClienteWhatsapp({
  clienteId,
  nome,
  telefoneDigitos,
  etapa,
  jaContatado,
  imovelReferencia,
  remetentes,
  remetenteIdPadrao,
  remetenteFallback,
  registrar,
  aoRegistrar
}: {
  clienteId: string;
  nome: string;
  telefoneDigitos: string | null;
  etapa: EtapaFunilId;
  jaContatado: boolean;
  imovelReferencia: string | null;
  remetentes: { id: string; nome: string }[];
  remetenteIdPadrao: string | null;
  remetenteFallback: string;
  registrar: Registrar;
  aoRegistrar: (c: ContatoCliente) => void;
}) {
  const numero = numeroWhatsapp(telefoneDigitos);

  const [remetenteId, setRemetenteId] = useState(remetenteIdPadrao ?? "");
  const remetente = primeiroNome(remetentes.find((r) => r.id === remetenteId)?.nome ?? remetenteFallback) || remetenteFallback;

  const ctx = useMemo(() => ({ nome: primeiroNome(nome), remetente, imovel: imovelReferencia }), [nome, remetente, imovelReferencia]);

  const [modeloId, setModeloId] = useState(modeloSugeridoCliente(etapa, jaContatado));
  const modelo = MODELO_CLIENTE_POR_ID.get(modeloId) ?? MODELOS_MENSAGEM_CLIENTE[0];
  const [texto, setTexto] = useState(() => preencherMensagem(modelo.texto, ctx));
  const [editado, setEditado] = useState(false);
  const remetenteAnterior = useRef(remetente);
  // Trocou quem assina: refaz o texto (se não foi editado) ou troca só o nome em "Aqui é <nome>".
  useEffect(() => {
    const antigo = remetenteAnterior.current;
    if (antigo === remetente) return;
    remetenteAnterior.current = remetente;
    if (!editado) setTexto(preencherMensagem(modelo.texto, ctx));
    else {
      const escapado = antigo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      setTexto((t) => t.replace(new RegExp(`(Aqui é )${escapado}\\b`, "g"), `$1${remetente}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remetente]);

  const [estado, setEstado] = useState<"ocioso" | "registrando" | "registrado" | "erro">("ocioso");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  function trocarModelo(novo: string) {
    setModeloId(novo);
    setEditado(false);
    const m = MODELO_CLIENTE_POR_ID.get(novo);
    if (m) setTexto(preencherMensagem(m.texto, ctx));
  }

  const pendentes = (texto.match(/\[[^\]]+\]/g) ?? []).length;

  function abrirWhatsapp() {
    if (!numero) return;
    // window.open precisa acontecer direto no clique (senão o navegador bloqueia a aba nova)
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
    void registrarContato();
  }

  async function registrarContato() {
    setEstado("registrando");
    setErro("");
    const r = await registrar(clienteId, { tipo: "WhatsApp", resultado: "Mensagem enviada", nota: `Modelo: ${modelo.titulo}\n${texto}` });
    if (r.ok) {
      aoRegistrar(r.contato);
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

  const grupos = Array.from(new Set(MODELOS_MENSAGEM_CLIENTE.map((m) => m.grupo)));

  return (
    <div className="bg-white border border-green-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="text-sm font-bold text-gray-800">Mensagem de WhatsApp</div>
        <div className="text-[11px] text-gray-400">
          {numero ? "Abre a conversa em outra aba e registra o contato." : "Sem telefone cadastrado — adicione na ficha do cliente."}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-2">
        <div>
          <label className={LABEL}>Quem envia</label>
          <select className={CAMPO} value={remetenteId} onChange={(e) => setRemetenteId(e.target.value)}>
            <option value="">{remetenteFallback} (você)</option>
            {remetentes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={LABEL}>Modelo (sugerido para esta etapa)</label>
          <select className={CAMPO} value={modeloId} onChange={(e) => trocarModelo(e.target.value)}>
            {grupos.map((g) => (
              <optgroup key={g} label={g}>
                {MODELOS_MENSAGEM_CLIENTE.filter((m) => m.grupo === g).map((m) => (
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
      <div className="text-[10px] text-gray-400 mt-1">
        {pendentes > 0 ? <span className="text-amber-700">Complete os trechos entre [colchetes] antes de enviar.</span> : "Você pode editar o texto antes de enviar."}
        {editado && (
          <button type="button" onClick={() => trocarModelo(modeloId)} className="ml-2 underline">
            restaurar modelo
          </button>
        )}
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
        {estado === "registrado" && <span className="text-[11px] text-green-600">Contato registrado no histórico ✓</span>}
        {estado === "erro" && <span className="text-[11px] text-red-600">{erro || "Não foi possível registrar o contato."}</span>}
      </div>
    </div>
  );
}
