import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Cliente do Supabase com a service role key — só usado no servidor (server
// actions, lib/documentos/gerar.ts), nunca no client. Um helper só pra não
// repetir createClient(...) com as mesmas envs em cada arquivo que precisa
// falar com Storage.
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados no .env");
  }
  return createClient(url, chave);
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

// Mesmo problema do limite de 4,5MB da Vercel (ver comentário grande mais
// abaixo, em criarUploadAssinadoDocumento) só que pro upload de imagem das
// publicações (Notícias/Editais/Checklists) em Configurações — uma foto de
// capa em boa resolução ("recomendado 1080x1080") passa fácil disso e a
// tela quebrava com "An unexpected response was received from the server."
// Mesma solução: o navegador sobe a imagem direto pro Storage via URL
// assinada, e a Server Action só recebe o caminho já salvo (texto pequeno).
const EXTENSOES_IMAGEM_ACEITAS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export async function criarUploadAssinadoImagemPublicacao(
  nomeArquivo: string
): Promise<{ caminho: string; token: string }> {
  const extensaoBruta = extensaoDoNome(nomeArquivo).toLowerCase();
  const extensao = EXTENSOES_IMAGEM_ACEITAS.has(extensaoBruta) ? extensaoBruta : null;
  if (!extensao) {
    throw new Error("Formato de imagem não suportado. Envie um JPG, PNG, WEBP ou GIF.");
  }

  const caminho = `${randomUUID()}.${extensao}`;
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET_PUBLICACOES).createSignedUploadUrl(caminho);
  if (error || !data) {
    throw new Error(`Não consegui preparar o upload da imagem: ${error?.message ?? "erro desconhecido"}`);
  }
  return { caminho, token: data.token };
}

// URL pública definitiva a partir do caminho já salvo no bucket (usado depois
// que o navegador já subiu o arquivo direto via URL assinada) — é só
// formatação de string, não bate na rede.
export function publicUrlImagemPublicacao(caminho: string): string {
  const supabase = supabaseAdmin();
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

// ==================== Eventos (capa) ====================
// Mesmo esquema de upload direto pro Storage via URL assinada usado nas
// publicações (Notícias/Editais) acima — bucket público próprio pra não
// misturar com "publicacoes" (Eventos tem seu próprio ciclo de vida:
// created_at/data_inicio, capa costuma ser mais retangular/banner do que o
// quadrado das publicações, mas aceita as mesmas extensões).
const BUCKET_EVENTOS = "eventos";

// Diferente do bucket "publicacoes" (criado manualmente antes daquela
// funcionalidade existir), este se cria sozinho no primeiro upload — mesmo
// padrão de garantirBucketAvaliacoesImagens/garantirBucketDocumentosPortal
// acima, pra não depender de um passo manual no Supabase antes do módulo
// funcionar.
async function garantirBucketEventos(): Promise<void> {
  const supabase = supabaseAdmin();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Não consegui verificar o armazenamento: ${error.message}`);
  if (buckets?.some((b) => b.name === BUCKET_EVENTOS)) return;

  const { error: erroCriar } = await supabase.storage.createBucket(BUCKET_EVENTOS, {
    public: true,
    fileSizeLimit: "10MB"
  });
  // Corrida entre duas requisições criando o bucket ao mesmo tempo não é um
  // erro de verdade — só a segunda perde a corrida.
  if (erroCriar && !erroCriar.message.toLowerCase().includes("already exists")) {
    throw new Error(`Não consegui preparar o armazenamento: ${erroCriar.message}`);
  }
}

export async function criarUploadAssinadoImagemEvento(
  nomeArquivo: string
): Promise<{ caminho: string; token: string }> {
  const extensaoBruta = extensaoDoNome(nomeArquivo).toLowerCase();
  const extensao = EXTENSOES_IMAGEM_ACEITAS.has(extensaoBruta) ? extensaoBruta : null;
  if (!extensao) {
    throw new Error("Formato de imagem não suportado. Envie um JPG, PNG, WEBP ou GIF.");
  }

  await garantirBucketEventos();
  const caminho = `${randomUUID()}.${extensao}`;
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET_EVENTOS).createSignedUploadUrl(caminho);
  if (error || !data) {
    throw new Error(`Não consegui preparar o upload da imagem: ${error?.message ?? "erro desconhecido"}`);
  }
  return { caminho, token: data.token };
}

export function publicUrlImagemEvento(caminho: string): string {
  const supabase = supabaseAdmin();
  const { data } = supabase.storage.from(BUCKET_EVENTOS).getPublicUrl(caminho);
  return data.publicUrl;
}

export async function apagarImagemEvento(imagemUrl: string | null | undefined): Promise<void> {
  if (!imagemUrl) return;
  const marcador = `/storage/v1/object/public/${BUCKET_EVENTOS}/`;
  const indice = imagemUrl.indexOf(marcador);
  if (indice === -1) return;

  const caminho = imagemUrl.slice(indice + marcador.length);
  if (!caminho) return;

  const supabase = supabaseAdmin();
  await supabase.storage.from(BUCKET_EVENTOS).remove([caminho]);
}

// ==================== Foto do Corretor (ranking de honorários) ====================
// Mesmo esquema de upload direto pro Storage via URL assinada usado em
// Eventos/Publicações acima — bucket público próprio (a foto aparece no
// dashboard externo, /login, sem autenticação) porque o retrato do corretor
// (1080x1350, formato retrato/post) é bem diferente do quadrado das
// publicações e do banner de eventos.
const BUCKET_PARCEIROS_FOTOS = "parceiros-fotos";

async function garantirBucketParceirosFotos(): Promise<void> {
  const supabase = supabaseAdmin();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Não consegui verificar o armazenamento: ${error.message}`);
  if (buckets?.some((b) => b.name === BUCKET_PARCEIROS_FOTOS)) return;

  const { error: erroCriar } = await supabase.storage.createBucket(BUCKET_PARCEIROS_FOTOS, {
    public: true,
    fileSizeLimit: "10MB"
  });
  // Corrida entre duas requisições criando o bucket ao mesmo tempo não é um
  // erro de verdade — só a segunda perde a corrida.
  if (erroCriar && !erroCriar.message.toLowerCase().includes("already exists")) {
    throw new Error(`Não consegui preparar o armazenamento: ${erroCriar.message}`);
  }
}

export async function criarUploadAssinadoFotoParceiro(
  nomeArquivo: string
): Promise<{ caminho: string; token: string }> {
  const extensaoBruta = extensaoDoNome(nomeArquivo).toLowerCase();
  const extensao = EXTENSOES_IMAGEM_ACEITAS.has(extensaoBruta) ? extensaoBruta : null;
  if (!extensao) {
    throw new Error("Formato de imagem não suportado. Envie um JPG, PNG, WEBP ou GIF.");
  }

  await garantirBucketParceirosFotos();
  const caminho = `${randomUUID()}.${extensao}`;
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET_PARCEIROS_FOTOS).createSignedUploadUrl(caminho);
  if (error || !data) {
    throw new Error(`Não consegui preparar o upload da foto: ${error?.message ?? "erro desconhecido"}`);
  }
  return { caminho, token: data.token };
}

export function publicUrlFotoParceiro(caminho: string): string {
  const supabase = supabaseAdmin();
  const { data } = supabase.storage.from(BUCKET_PARCEIROS_FOTOS).getPublicUrl(caminho);
  return data.publicUrl;
}

export async function apagarFotoParceiro(fotoUrl: string | null | undefined): Promise<void> {
  if (!fotoUrl) return;
  const marcador = `/storage/v1/object/public/${BUCKET_PARCEIROS_FOTOS}/`;
  const indice = fotoUrl.indexOf(marcador);
  if (indice === -1) return;

  const caminho = fotoUrl.slice(indice + marcador.length);
  if (!caminho) return;

  const supabase = supabaseAdmin();
  await supabase.storage.from(BUCKET_PARCEIROS_FOTOS).remove([caminho]);
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

// Extensões aceitas nos anexos do portal (RG, comprovante, contrato
// assinado etc.) — achado "Médio" da auditoria de 01/08/2026: antes
// aceitava QUALQUER extensão (inclusive .exe, .html, .svg — esse último
// pode carregar script). PDF/imagem/Word cobre tudo que os formulários do
// portal já pedem de anexo hoje.
// heic/heif incluído de propósito: é o formato padrão de foto do iPhone —
// sem isso, corretor anexando foto direto da câmera do celular (bem comum
// pro RG/comprovante) ia começar a levar erro do nada depois dessa validação.
const EXTENSOES_DOCUMENTO_ACEITAS = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
  "doc",
  "docx"
]);

// Pede ao Supabase uma URL de upload assinada, de uso único, pro navegador
// subir o arquivo direto (sem passar pela função da Vercel). Devolve o
// caminho definitivo (guardado depois no formulário) e o token que
// autoriza esse upload específico.
export async function criarUploadAssinadoDocumento(
  nomeArquivo: string
): Promise<{ caminho: string; token: string }> {
  const extensao = extensaoDoNome(nomeArquivo).toLowerCase();
  if (!EXTENSOES_DOCUMENTO_ACEITAS.has(extensao)) {
    throw new Error(`Formato de arquivo não aceito ("${extensao}"). Envie PDF, JPG, PNG ou Word.`);
  }

  await garantirBucketDocumentosPortal();
  const caminho = `${randomUUID()}.${extensao}`;
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS_PORTAL).createSignedUploadUrl(caminho);
  if (error || !data) {
    throw new Error(`Não consegui preparar o upload de "${nomeArquivo}": ${error?.message ?? "erro desconhecido"}`);
  }
  return { caminho, token: data.token };
}

// Link temporário (7 dias) pra baixar um documento já enviado — vai junto
// no corpo do email pro administrativo (além do anexo de verdade, ver
// baixarDocumentoPortal), como reforço caso o anexo não caiba no limite do
// Gmail ou o link seja mais prático de abrir direto do celular.
export async function criarLinkDownloadDocumento(caminho: string): Promise<string | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS_PORTAL)
    .createSignedUrl(caminho, 60 * 60 * 24 * 7);
  if (error || !data) return null;
  return data.signedUrl;
}

// Baixa o conteúdo de verdade de um documento já enviado (server-side, do
// Supabase Storage pro Vercel) — usado pra anexar o PDF de fato no email
// pro administrativo, em vez de só mandar o link. Isso NÃO reintroduz o
// limite de 4,5MB da Vercel (aquele limite é só pro corpo da requisição do
// navegador pra função serverless — aqui é a própria função buscando o
// arquivo do Storage, servidor a servidor). Devolve null se o download
// falhar (arquivo removido, bucket indisponível etc.) — quem chama trata
// isso caindo pro link como alternativa.
export async function baixarDocumentoPortal(caminho: string): Promise<Buffer | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS_PORTAL).download(caminho);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Documentos gerados pelo motor de modelos (contratos, recibos etc. — ver
// lib/documentos/gerar.ts). Achado "Crítico" da auditoria de 01/08/2026: até
// esta mudança, esse bucket ("documentos", que continua existindo do jeito
// que está) era PÚBLICO — qualquer um com o link direto (URL permanente,
// nunca expira) abria o documento sem estar logado, e esses documentos têm
// CPF/RG/endereço/dados bancários dentro.
//
// Decisão tomada com calma (pedido explícito do usuário em 01/08/2026): em
// vez de virar o bucket "documentos" de público pra privado — o que
// quebraria, na hora, TODOS os links já gerados e possivelmente já salvos/
// enviados por alguém, já que essa configuração é do bucket inteiro, não dá
// pra deixar "alguns arquivos" público e outros não dentro do mesmo bucket —
// os documentos já existentes continuam exatamente como estavam (mesmo
// bucket, mesmo link público antigo, sem nenhuma mudança). Só os documentos
// gerados A PARTIR de agora vão para este bucket novo, privado, e são
// abertos por URL assinada (com validade, teoricamente pedida de novo a
// cada abertura da tela) em vez de link público permanente.
const BUCKET_DOCUMENTOS_GERADOS = "documentos-gerados";

async function garantirBucketDocumentosGerados(): Promise<void> {
  const supabase = supabaseAdmin();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Não consegui verificar o armazenamento: ${error.message}`);
  if (buckets?.some((b) => b.name === BUCKET_DOCUMENTOS_GERADOS)) return;

  const { error: erroCriar } = await supabase.storage.createBucket(BUCKET_DOCUMENTOS_GERADOS, {
    public: false
  });
  // Corrida entre duas requisições criando o bucket ao mesmo tempo não é um
  // erro de verdade — só a segunda perde a corrida.
  if (erroCriar && !erroCriar.message.toLowerCase().includes("already exists")) {
    throw new Error(`Não consegui preparar o armazenamento: ${erroCriar.message}`);
  }
}

// Sobe um documento recém-gerado pro bucket privado — chamado por
// gerarDocumento (lib/documentos/gerar.ts) logo depois de preencher o
// template. O caminho devolvido pra quem chama é o mesmo que fica salvo em
// documentos_gerados.arquivo_caminho, usado depois por
// criarUrlAssinadaDocumentoGerado pra reabrir o arquivo.
export async function subirDocumentoGerado(caminho: string, arquivo: Buffer, contentType: string): Promise<void> {
  await garantirBucketDocumentosGerados();
  const supabase = supabaseAdmin();
  const { error } = await supabase.storage.from(BUCKET_DOCUMENTOS_GERADOS).upload(caminho, arquivo, { contentType });
  if (error) throw new Error(`Não consegui subir o documento gerado: ${error.message}`);
}

// 24h de validade — bastante folga pra quem gerou o documento agora e quer
// abrir em seguida, e também renovada do zero toda vez que a tela que lista
// o documento é recarregada (ver resolverUrlDocumentoGerado), então nunca
// fica um link "parado" esperando expirar sem ninguém perceber.
const VALIDADE_URL_DOCUMENTO_GERADO_SEGUNDOS = 60 * 60 * 24;

export async function criarUrlAssinadaDocumentoGerado(caminho: string): Promise<string | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS_GERADOS)
    .createSignedUrl(caminho, VALIDADE_URL_DOCUMENTO_GERADO_SEGUNDOS);
  if (error || !data) return null;
  return data.signedUrl;
}

// Imagem da consulta de CPF, anexada na Avaliação (módulo Financiamento) —
// pedido do usuário em 02/08/2026: antes disso era só um campo de texto onde
// alguém colava um link à mão (sem validação — por isso os cliques
// costumavam quebrar). Agora é upload de verdade, bucket privado (mesmo
// motivo do bucket de documentos gerados: essa imagem pode ter dado pessoal
// visível), com o mesmo esquema de URL assinada de curta duração pra ver na
// tela do admin, e uma URL assinada de validade maior (7 dias) só pra ir no
// corpo do email quando o admin manda a imagem pro corretor que pediu.
const BUCKET_AVALIACOES_IMAGENS = "avaliacoes-imagens";

async function garantirBucketAvaliacoesImagens(): Promise<void> {
  const supabase = supabaseAdmin();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Não consegui verificar o armazenamento: ${error.message}`);
  if (buckets?.some((b) => b.name === BUCKET_AVALIACOES_IMAGENS)) return;

  const { error: erroCriar } = await supabase.storage.createBucket(BUCKET_AVALIACOES_IMAGENS, {
    public: false,
    fileSizeLimit: "10MB"
  });
  // Corrida entre duas requisições criando o bucket ao mesmo tempo não é um
  // erro de verdade — só a segunda perde a corrida.
  if (erroCriar && !erroCriar.message.toLowerCase().includes("already exists")) {
    throw new Error(`Não consegui preparar o armazenamento: ${erroCriar.message}`);
  }
}

// Pedido do usuário em 02/08/2026: além do print (imagem), o resultado da
// consulta às vezes já vem como PDF do próprio banco/consulta — aceita os
// dois juntos, mesmo critério já usado nos anexos do portal do corretor
// (EXTENSOES_DOCUMENTO_ACEITAS, mais acima).
const EXTENSOES_IMAGEM_CONSULTA_ACEITAS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

export async function criarUploadAssinadoImagemConsulta(
  nomeArquivo: string
): Promise<{ caminho: string; token: string }> {
  const extensaoBruta = extensaoDoNome(nomeArquivo).toLowerCase();
  const extensao = EXTENSOES_IMAGEM_CONSULTA_ACEITAS.has(extensaoBruta) ? extensaoBruta : null;
  if (!extensao) {
    throw new Error("Formato não suportado. Envie um JPG, PNG, WEBP ou PDF (print ou PDF do resultado).");
  }

  await garantirBucketAvaliacoesImagens();
  const caminho = `${randomUUID()}.${extensao}`;
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET_AVALIACOES_IMAGENS).createSignedUploadUrl(caminho);
  if (error || !data) {
    throw new Error(`Não consegui preparar o upload da imagem: ${error?.message ?? "erro desconhecido"}`);
  }
  return { caminho, token: data.token };
}

// 24h — mesma folga/mesmo motivo de VALIDADE_URL_DOCUMENTO_GERADO_SEGUNDOS,
// recalculada do zero toda vez que a tela da Avaliação é carregada.
const VALIDADE_URL_IMAGEM_CONSULTA_SEGUNDOS = 60 * 60 * 24;

export async function criarUrlAssinadaImagemConsulta(caminho: string): Promise<string | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage
    .from(BUCKET_AVALIACOES_IMAGENS)
    .createSignedUrl(caminho, VALIDADE_URL_IMAGEM_CONSULTA_SEGUNDOS);
  if (error || !data) return null;
  return data.signedUrl;
}

// Link de reforço mandado dentro do email pro corretor (além do anexo de
// verdade, ver baixarImagemConsulta) — 7 dias de validade, mesmo padrão de
// criarLinkDownloadDocumento.
export async function criarLinkImagemConsultaParaEmail(caminho: string): Promise<string | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage
    .from(BUCKET_AVALIACOES_IMAGENS)
    .createSignedUrl(caminho, 60 * 60 * 24 * 7);
  if (error || !data) return null;
  return data.signedUrl;
}

// Baixa o conteúdo de verdade da imagem (server-side) — usado pra anexar no
// email pro corretor, mesmo padrão de baixarDocumentoPortal.
export async function baixarImagemConsulta(caminho: string): Promise<Buffer | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET_AVALIACOES_IMAGENS).download(caminho);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Apaga do Storage a imagem antiga quando o admin troca por uma nova —
// mesmo cuidado de apagarImagemPublicacao, pra não deixar arquivo órfão.
export async function apagarImagemConsulta(caminho: string | null | undefined): Promise<void> {
  if (!caminho) return;
  const supabase = supabaseAdmin();
  await supabase.storage.from(BUCKET_AVALIACOES_IMAGENS).remove([caminho]);
}

// Resolve a URL certa pra abrir um documento gerado, cobrindo os dois
// formatos que convivem na mesma tabela depois desta mudança: registros
// NOVOS (têm arquivo_caminho) pedem uma URL assinada fresca, na hora —
// nunca fica um link salvo que pode expirar. Registros ANTIGOS (só têm
// arquivo_url, do bucket público de antes) continuam abrindo pelo link
// salvo, sem nenhuma mudança de comportamento — é assim que documentos já
// gerados antes de 01/08/2026 continuam funcionando exatamente como antes.
export async function resolverUrlDocumentoGerado(doc: {
  arquivo_url?: string | null;
  arquivo_caminho?: string | null;
}): Promise<string | null> {
  if (doc.arquivo_caminho) {
    return criarUrlAssinadaDocumentoGerado(doc.arquivo_caminho);
  }
  return doc.arquivo_url ?? null;
}
