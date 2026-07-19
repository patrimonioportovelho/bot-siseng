"use client";

import { useRef, useState } from "react";
import { prepararUploadImagemPublicacaoAction } from "@/app/configuracoes/actions";
import { supabaseBrowser, BUCKET_PUBLICACOES } from "@/lib/supabase-browser";

const TIPOS_PUBLICACAO = ["Noticia", "Edital", "Checklist"];

function tipoPublicacaoLabel(t: string) {
  if (t === "Edital") return "Edital";
  if (t === "Checklist") return "Checklist";
  return "Notícia";
}

const CAMPO =
  "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

type PublicacaoExistente = {
  id: string;
  tipo: string;
  titulo: string;
  resumo: string | null;
  corpo: string;
  ativo: boolean;
  portal_corretor: boolean;
  imagem_url: string | null;
};

// Cuida do envio de imagem de capa das publicações (Notícias/Editais/
// Checklists) fora da Server Action — a Vercel tem limite fixo de 4,5MB por
// requisição de função, e uma foto de capa em boa resolução estourava isso
// fácil, quebrando a tela com "An unexpected response was received from the
// server". Aqui o arquivo sobe direto do navegador pro Storage via URL
// assinada (mesma solução já usada nos anexos do Portal do Corretor) e só o
// caminho salvo (texto pequeno) vai pra Server Action.
export function PublicacaoForm({
  publicacao,
  action
}: {
  publicacao: PublicacaoExistente | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const p = publicacao;
  const formRef = useRef<HTMLFormElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const form = formRef.current;
    if (!form) return;

    const fileInput = form.elements.namedItem("imagem") as HTMLInputElement | null;
    const arquivo = fileInput?.files?.[0] ?? null;

    setEnviando(true);
    try {
      let imagemCaminho = "";
      if (arquivo) {
        const preparo = await prepararUploadImagemPublicacaoAction(arquivo.name);
        if (!preparo.ok) throw new Error(preparo.erro);
        const { error: erroUpload } = await supabaseBrowser()
          .storage.from(BUCKET_PUBLICACOES)
          .uploadToSignedUrl(preparo.caminho, preparo.token, arquivo, { contentType: arquivo.type });
        if (erroUpload) throw new Error(`Falha ao enviar a imagem: ${erroUpload.message}`);
        imagemCaminho = preparo.caminho;
      }

      const fd = new FormData(form);
      fd.delete("imagem");
      if (imagemCaminho) fd.set("imagem_caminho", imagemCaminho);

      await action(fd);
    } catch (erroEnvio) {
      setErro(erroEnvio instanceof Error ? erroEnvio.message : "Falha ao salvar a publicação.");
      setEnviando(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-2">
      {p && <input type="hidden" name="publicacaoId" value={p.id} />}
      <div className="grid md:grid-cols-2 gap-2">
        <div>
          <label className={LABEL}>Tipo</label>
          <select name="tipo" defaultValue={p?.tipo ?? "Noticia"} className={CAMPO}>
            {TIPOS_PUBLICACAO.map((t) => (
              <option key={t} value={t}>
                {tipoPublicacaoLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Título</label>
          <input name="titulo" required defaultValue={p?.titulo ?? ""} className={CAMPO} />
        </div>
      </div>
      <div>
        <label className={LABEL}>Resumo (opcional, aparece na lista)</label>
        <input name="resumo" defaultValue={p?.resumo ?? ""} className={CAMPO} />
      </div>
      <div>
        <label className={LABEL}>Texto completo</label>
        <textarea name="corpo" required defaultValue={p?.corpo ?? ""} className={CAMPO + " min-h-24"} />
      </div>
      <div>
        <label className={LABEL}>Imagem{p ? "" : " (opcional)"}</label>
        {p?.imagem_url && (
          <div className="flex items-center gap-2 mb-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.imagem_url} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
            <label className="flex items-center gap-1.5 text-xs text-red-600">
              <input type="checkbox" name="remover_imagem" /> Remover imagem atual
            </label>
          </div>
        )}
        <input
          type="file"
          name="imagem"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white file:mr-2 file:text-xs file:border-0 file:bg-gray-100 file:rounded file:px-2 file:py-1"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          {p?.imagem_url
            ? "Escolha um arquivo pra trocar a imagem atual. Recomendado: 1080x1080px."
            : "Recomendado: imagem quadrada, 1080x1080px (o mesmo tamanho de um post pronto pra WhatsApp/Instagram)."}
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" name="ativo" defaultChecked={p?.ativo ?? true} /> Publicar já (visível no site)
      </label>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" name="portal_corretor" defaultChecked={p?.portal_corretor ?? false} /> Mostrar também
        no mural do Portal do Corretor
      </label>
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{erro}</div>
      )}
      <div>
        <button
          type="submit"
          disabled={enviando}
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60"
        >
          {enviando ? "Enviando..." : p ? "Salvar alterações" : "Salvar publicação"}
        </button>
      </div>
    </form>
  );
}
