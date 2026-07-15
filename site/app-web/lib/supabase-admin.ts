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

// Documentos anexados nos formulários do portal do corretor (Compra e
// Venda) — RG, comprovante, contrato assinado etc. Bucket separado do
// "publicacoes" (privado, não é conteúdo do site).
//
// Por que isso existe: a Vercel tem um limite FIXO de 4,5MB por requisição
// de função serverless (Server Action incluída) — não dá pra aumentar por
// configuração nenhuma, é limite da plataforma, não do Next.js. Um PDF
// escaneado ou foto de celular já estoura isso fácil. A solução oficial da
// própria Vercel é subir o arquivo direto do navegador pro armazenamento
// (bypassando a função) e só mandar pra Server Action um texto pequeno (o
// caminho do arquivo já salvo) — é isso que as funções abaixo viabilizam:
// o navegador pede uma URL assinada de upload (essa chamada é minúscula,
// só o nome do arquivo) e sobe o arquivo direto pro Supabase, sem passar
// pela função da Vercel em nenhum momento.
const BUCKET_DOCUMENTOS_PORTAL = "documentos-portal";

async function garantirBucketDocumentosPortal(): Promise<void> {
  const supabase = supabaseAdmin();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Não consegui verificar o armazenamento: ${error.message}`);
  if (buckets?.some((b) => b.name === BUCKET_DOCUMENTOS_PORTAL)) return;

  const { error: erroCriar } = await supabase.storage.createBucket(BUCKET_DOCUMENTOS_PORTAL, {
    public: false,
    fileSizeLimit: "20MB"
  });
  // Corrida entre duas requisições criando o bucket ao mesmo tempo não é um
  // erro de verdade — só a segunda perde a corrida.
  if (erroCriar && !erroCriar.message.toLowerCase().includes("already exists")) {
    throw new Error(`Não consegui preparar o armazenamento: ${erroCriar.message}`);
  }
}

function extensaoDoNome(nomeArquivo: string): string {
  const partes = nomeArquivo.split(".");
  return partes.length > 1 ? partes[partes.length - 1].slice(0, 10) : "bin";
}

// Pede ao Supabase uma URL de upload assinada, de uso único, pro navegador
// subir o arquivo direto (sem passar pela função da Vercel). Devolve o
// caminho definitivo (guardado depois no formulário) e o token que
// autoriza esse upload específico.
export async function criarUploadAssinadoDocumento(
  nomeArquivo: string
): Promise<{ caminho: string; token: string }> {
  await garantirBucketDocumentosPortal();
  const caminho = `${randomUUID()}.${extensaoDoNome(nomeArquivo)}`;
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS_PORTAL).createSignedUploadUrl(caminho);
  if (error || !data) {
    throw new Error(`Não consegui preparar o upload de "${nomeArquivo}": ${error?.message ?? "erro desconhecido"}`);
  }
  return { caminho, token: data.token };
}

// Link temporário (7 dias) pra baixar um documento já enviado — usado no
// corpo do email pro administrativo em vez de anexar o arquivo de verdade
// (isso também evita o limite de anexo do Gmail).
export async function criarLinkDownloadDocumento(caminho: string): Promise<string | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS_PORTAL)
    .createSignedUrl(caminho, 60 * 60 * 24 * 7);
  if (error || !data) return null;
  return data.signedUrl;
}
