"use client";

import { useMemo, useRef, useState } from "react";
import { MODELOS_MENSAGEM_GESTAO, MODELO_GESTAO_POR_ID, modeloSugeridoGestao } from "@/lib/gestoes/mensagens";
import { numeroWhatsapp, preencherMensagem, primeiroNome } from "@/lib/whatsapp";

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";
const LABEL = "text-[11px] text-gray-600 block mb-0.5";

// Gerador de mensagem de WhatsApp da Ficha de Captação: o modelo já vem sugerido pela coluna do quadro, o texto pode
// ser ajustado e o clique só abre a conversa com o proprietário (não grava nada). Arquivos (ficha, proposta) o
// WhatsApp não recebe por link: o botão "Baixar a ficha" fica ao lado para anexar na conversa.
export function GestaoWhatsapp({
  coluna,
  nome,
  telefone,
  endereco,
  remetente,
  anuncioUrl,
  urlFicha,
  rotuloFicha
}: {
  coluna: string;
  nome: string;
  telefone: string | null;
  endereco: string;
  remetente: string;
  anuncioUrl: string | null;
  urlFicha: string | null;
  rotuloFicha: string;
}) {
  const numero = numeroWhatsapp(telefone);
  const [link, setLink] = useState(anuncioUrl ?? "");
  const [modeloId, setModeloId] = useState(modeloSugeridoGestao(coluna));
  const modelo = MODELO_GESTAO_POR_ID.get(modeloId) ?? MODELOS_MENSAGEM_GESTAO[0];

  const ctx = useMemo(
    () => ({ nome: primeiroNome(nome), remetente: primeiroNome(remetente) || remetente, imovel: endereco, link_do_anuncio: link.trim() }),
    [nome, remetente, endereco, link]
  );

  const [texto, setTexto] = useState(() => preencherMensagem(modelo.texto, ctx));
  const [editado, setEditado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState("");
  const linkAnterior = useRef(link.trim());

  function trocarModelo(novo: string) {
    setModeloId(novo);
    setEditado(false);
    const m = MODELO_GESTAO_POR_ID.get(novo);
    if (m) setTexto(preencherMensagem(m.texto, ctx));
  }

  // Mudou o link do anúncio: refaz o texto (se não foi editado) ou troca só o link dentro do texto já editado.
  function mudarLink(novo: string) {
    setLink(novo);
    const antigo = linkAnterior.current;
    const atual = novo.trim();
    linkAnterior.current = atual;
    if (!editado) {
      setTexto(preencherMensagem(modelo.texto, { ...ctx, link_do_anuncio: atual }));
      return;
    }
    setTexto((t) => {
      if (antigo && t.includes(antigo)) return t.split(antigo).join(atual || "[link do anuncio]");
      if (atual && t.includes("[link do anuncio]")) return t.split("[link do anuncio]").join(atual);
      return t;
    });
  }

  const usaLink = modelo.texto.includes("{link_do_anuncio}");
  const pendentes = (texto.match(/\[[^\]]+\]/g) ?? []).length;

  function abrirWhatsapp() {
    if (!numero) return;
    // window.open precisa acontecer direto no clique (senão o navegador bloqueia a aba nova)
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setErro("");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não foi possível copiar.");
    }
  }

  const grupos = Array.from(new Set(MODELOS_MENSAGEM_GESTAO.map((m) => m.grupo)));

  return (
    <div className="bg-white border border-green-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="text-sm font-bold text-gray-800">Mensagem de WhatsApp para o proprietário</div>
        <div className="text-[11px] text-gray-400">
          {numero ? "Abre a conversa em outra aba; o envio é seu." : "Sem telefone cadastrado — complete na ficha do cliente."}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-2">
        <div>
          <label className={LABEL}>Modelo (sugerido para esta etapa)</label>
          <select className={CAMPO} value={modeloId} onChange={(e) => trocarModelo(e.target.value)}>
            {grupos.map((g) => (
              <optgroup key={g} label={g}>
                {MODELOS_MENSAGEM_GESTAO.filter((m) => m.grupo === g).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.titulo}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Link do anúncio {usaLink && <span className="text-amber-600">(vai na mensagem)</span>}</label>
          <input
            className={CAMPO}
            value={link}
            onChange={(e) => mudarLink(e.target.value)}
            placeholder="https://www.remax.com.br/pt-br/imoveis/…"
            autoComplete="off"
          />
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

      {modelo.anexo && (
        <div className="mt-2 text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          {modelo.anexo === "ficha" ? (
            urlFicha ? (
              <>
                Esta mensagem leva a ficha em anexo: baixe o arquivo abaixo e anexe na conversa do WhatsApp.{" "}
                <a href={urlFicha} target="_blank" rel="noreferrer" className="font-semibold underline">
                  {rotuloFicha} ↓
                </a>
              </>
            ) : (
              "Esta mensagem leva a ficha em anexo, mas a ficha ainda não foi gerada."
            )
          ) : (
            "Esta mensagem leva a proposta em anexo: abra a conversa e anexe o arquivo da proposta antes de enviar."
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button
          type="button"
          onClick={abrirWhatsapp}
          disabled={!numero}
          className="text-xs bg-green-600 text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50 hover:opacity-90"
        >
          Abrir no WhatsApp
        </button>
        <button type="button" onClick={() => void copiar()} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600">
          {copiado ? "Copiado ✓" : "Copiar mensagem"}
        </button>
        {erro && <span className="text-[11px] text-red-600">{erro}</span>}
      </div>
    </div>
  );
}
