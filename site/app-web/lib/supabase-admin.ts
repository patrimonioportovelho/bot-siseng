import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Cliente do Supabase com a service role key — só usado no servidor (server
// actions, lib/documentos/gerar.ts), nunca no client. Um helper só pra não
// repetir createClient(...) com as mesmas envs em cada arquivo que precisa
// falar com Storage.
export function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const BUCKET_PUBLICACOES = "publicacoes";

// Extensões aceitas pro upload de imagem das publicações (Notícias/Editais).
// Só isso porque é sempre uma arte/flyer pronta (a maioria em 1080x1080,
// formato de post de Instagram/WhatsApp) — não faz sentido aceitar
// documentos aqui.
const EXTENSOES_IMAGEM: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

// Sobe a imagem de uma publicação (Notícia/Edital) pro bucket público
// "publicacoes" e devolve a URL pública já pronta pra salvar em
// publicacoes_site.imagem_url. Aceita qualquer tamanho — o site sempre
// mostra em moldura quadrada (recomendação de 1080x1080, mas não trava se
// vier diferente).
export async function subirImagemPublicacao(arquivo: File): Promise<string> {
  const extensao = EXTENSOES_IMAGEM[arquivo.type];
  if (!extensao) {
    throw new Error("Formato de imagem não suportado. Envie um JPG, PNG, WEBP ou GIF.");
  }

  const caminho = `${randomUUID()}.${extensao}`;
  const supabase = supabaseAdmin();
  const { error } = await supabase.storage
    .from(BUCKET_PUBLICACOES)
    .upload(caminho, arquivo, { contentType: arquivo.type });

  if (error) throw new Error(`Não consegui subir a imagem: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET_PUBLICACOES).getPublicUrl(caminho);
  return data.publicUrl;
}

// Apaga do Storage a imagem de uma publicação — chamado ao trocar a imagem
// por uma nova ou ao excluir a publicação, pra não deixar arquivo órfão
// ocupando espaço no bucket à toa.
export async function apagarImagemPublicacao(imagemUrl: string | null | undefined): Promise<void> {
  if (!imagemUrl) return;
  const marcador = `/storage/v1/object/public/${BUCKET_PUBLICACOES}/`;
  const indice = imagemUrl.indexOf(marcador);
  if (indice === -1) return; // URL de fora do bucket (link antigo colado à mão) — não mexe.

  const caminho = imagemUrl.slice(indice + marcador.length);
  if (!caminho) return;

  const supabase = supabaseAdmin();
  await supabase.storage.from(BUCKET_PUBLICACOES).remove([caminho]);
}
