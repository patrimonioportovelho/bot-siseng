import { createClient } from "@supabase/supabase-js";

// Cliente do Supabase pro NAVEGADOR — usa só a URL e a chave "anon"
// (pública por natureza: protegida por política do Supabase, não por estar
// escondida — é segura de expor no bundle do client). Usado só pra subir
// documentos direto pro Storage via URL assinada (ver
// lib/supabase-admin.ts#criarUploadAssinadoDocumento), sem passar pela
// função da Vercel — que tem limite FIXO de 4,5MB por requisição, sem
// configuração que aumente isso, e é o que travava o cadastro de Compra e
// Venda quando o corretor anexava documento.
let cliente: ReturnType<typeof createClient> | null = null;

export function supabaseBrowser() {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY não configurados no .env — veja .env.example."
      );
    }
    cliente = createClient(url, anonKey);
  }
  return cliente;
}

// Precisa bater com BUCKET_DOCUMENTOS_PORTAL em lib/supabase-admin.ts —
// esse arquivo não pode importar de lá porque lib/supabase-admin.ts usa a
// service role key (só pode rodar no servidor).
export const BUCKET_DOCUMENTOS_PORTAL = "documentos-portal";

// Precisa bater com BUCKET_PUBLICACOES em lib/supabase-admin.ts — usado pro
// upload direto da imagem de capa das publicações (Notícias/Editais), pelo
// mesmo motivo do bucket acima (limite de 4,5MB da Vercel).
export const BUCKET_PUBLICACOES = "publicacoes";

// Precisa bater com BUCKET_AVALIACOES_IMAGENS em lib/supabase-admin.ts —
// upload direto da imagem da consulta de CPF (Avaliação, no Financiamento).
export const BUCKET_AVALIACOES_IMAGENS = "avaliacoes-imagens";

// Precisa bater com BUCKET_EVENTOS em lib/supabase-admin.ts — upload direto
// da imagem de capa dos Eventos.
export const BUCKET_EVENTOS = "eventos";

// Precisa bater com BUCKET_PARCEIROS_FOTOS em lib/supabase-admin.ts —
// upload direto da foto do Corretor (ranking de honorários).
export const BUCKET_PARCEIROS_FOTOS = "parceiros-fotos";
