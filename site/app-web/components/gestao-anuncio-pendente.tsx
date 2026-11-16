"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmarAnuncioModal } from "@/components/confirmar-anuncio-modal";
import type { AnuncioInformado } from "@/lib/gestoes/anuncio";

// Aparece sozinha ao abrir a ficha de um card que JÁ está em Comercialização mas ainda não teve a pergunta "o imóvel
// já foi anunciado no site?" respondida (os cards que estavam lá antes da pergunta existir). Confirma na hora,
// sem mover o card. "Cancelar" só fecha por agora — volta a aparecer na próxima vez que abrir, até responder.
export function GestaoAnuncioPendente({
  gestaoId,
  endereco,
  confirmar
}: {
  gestaoId: string;
  endereco: string;
  confirmar: (id: string, anuncio: AnuncioInformado) => Promise<{ ok: true } | { ok: false; erro: string }>;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!aberto) return null;

  async function aoConfirmar(anuncio: AnuncioInformado) {
    setErro(null);
    setSalvando(true);
    try {
      const r = await confirmar(gestaoId, anuncio);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setAberto(false);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ConfirmarAnuncioModal
      endereco={endereco}
      inicial={{ id: null, url: null }}
      textoIntro="Este card já está em Comercialização e ainda não tem a confirmação do anúncio. Informe se o imóvel já foi anunciado no site; se foi, coloque o ID e o link do anúncio — eles ficam no cadastro do imóvel."
      erro={erro}
      salvando={salvando}
      aoConfirmar={aoConfirmar}
      aoCancelar={() => setAberto(false)}
    />
  );
}
