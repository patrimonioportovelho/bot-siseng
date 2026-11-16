"use client";

import { useState } from "react";
import { CamposAnuncio } from "@/components/campos-anuncio";
import { validarIdELink, type AnuncioInformado } from "@/lib/gestoes/anuncio";

// Janela de confirmação ao mandar o imóvel para "Comercialização" — mesmo visual da janela de motivo do
// Recrutamento (components/recrutamento-kanban.tsx): fundo escurecido, cartão branco, Cancelar / Confirmar.
// Pergunta se o imóvel já foi anunciado no site; se foi, pede o ID e o link do anúncio (os dois obrigatórios).
export function ConfirmarAnuncioModal({
  endereco,
  inicial,
  aoConfirmar,
  aoCancelar,
  erro,
  salvando,
  textoIntro
}: {
  endereco: string;
  // anúncio que o imóvel já tem no cadastro (abre já marcado "Sim" e preenchido)
  inicial: { id: string | null; url: string | null };
  aoConfirmar: (anuncio: AnuncioInformado) => void;
  aoCancelar: () => void;
  // recusa do servidor / gravação em andamento (usado quando a confirmação grava na hora, sem mover o card)
  erro?: string | null;
  salvando?: boolean;
  // troca o texto de apresentação (ex.: card que já está em Comercialização e ainda não foi confirmado)
  textoIntro?: string;
}) {
  const jaTem = Boolean(inicial.id || inicial.url);
  const [resposta, setResposta] = useState<"sim" | "nao" | null>(jaTem ? "sim" : null);
  const [id, setId] = useState(inicial.id ?? "");
  const [url, setUrl] = useState(inicial.url ?? "");

  const valido = !salvando && (resposta === "nao" || (resposta === "sim" && id.trim().length > 0 && validarIdELink(id, url) === null && url.trim().length > 0));

  function confirmar() {
    if (!valido) return;
    aoConfirmar(resposta === "sim" ? { anunciado: true, id: id.trim(), url: url.trim() } : { anunciado: false });
  }

  const pill = (ativo: boolean) =>
    `flex-1 text-xs rounded-lg border px-3 py-2 font-semibold ${ativo ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-4 w-full max-w-sm flex flex-col gap-3">
        <div className="text-sm font-bold text-gray-800">Imóvel já anunciado no site? — {endereco}</div>
        <p className="text-[11px] text-gray-500">
          {textoIntro ??
            "Antes de ir para Comercialização, confirme se este imóvel já foi anunciado no site. Se foi, informe o ID e o link do anúncio — eles ficam no cadastro do imóvel."}
        </p>
        <div className="flex gap-2">
          <button type="button" className={pill(resposta === "sim")} onClick={() => setResposta("sim")}>
            Sim
          </button>
          <button type="button" className={pill(resposta === "nao")} onClick={() => setResposta("nao")}>
            Não
          </button>
        </div>
        {resposta === "sim" && <CamposAnuncio id={id} url={url} aoMudar={(i, u) => (setId(i), setUrl(u))} />}
        {resposta === "nao" && jaTem && (
          <p className="text-[11px] text-amber-600">O ID e o link do anúncio que estão no cadastro deste imóvel serão apagados.</p>
        )}
        {erro && <p className="text-[11px] text-red-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={aoCancelar} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!valido}
            onClick={confirmar}
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
