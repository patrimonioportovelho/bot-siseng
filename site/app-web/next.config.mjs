/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Removido em 29/08/2026 (achado "Alto" da auditoria): o motivo original
  // (schema.prisma sem os models reais) não existe mais há tempos, e a
  // flag estava mascarando o type-check do build inteiro — inclusive
  // possíveis erros novos introduzidos depois. Rodado `npx tsc --noEmit`
  // antes de remover: só havia 1 erro pendente (lib/auth.ts, Uint8Array vs
  // BufferSource — typing puro do lib.dom.d.ts, sem efeito em runtime),
  // corrigido com um cast de tipo. Se aparecer erro novo daqui pra frente,
  // o build vai travar de propósito — é o comportamento certo.
  experimental: {
    serverActions: {
      // ATUALIZADO em 29/08/2026 (achado "menor" da auditoria): todo upload
      // de arquivo (documentos do portal, fotos de evento/publicação/parceiro)
      // hoje sobe DIRETO pro Supabase Storage via URL assinada
      // (uploadToSignedUrl) — o Storage não passa mais pelo corpo da Server
      // Action, só o caminho/nome do arquivo (texto). Isso já era necessário
      // de qualquer forma por causa do limite fixo de 4,5MB da própria
      // Vercel (bem menor que os 25mb configurados aqui, que nunca protegiam
      // contra esse teto). O limite abaixo cobre só o JSON/texto que ainda
      // vai nas Server Actions (listas de sócios, compradores, documentos
      // etc.) — 2mb é folgado pra isso.
      bodySizeLimit: "2mb"
    }
  },
  // Headers de segurança (achado "Baixo" da auditoria de 01/08/2026).
  // De propósito SEM Content-Security-Policy aqui: o sistema carrega
  // imagem/documento de domínio externo (Supabase Storage) e uma CSP
  // errada quebraria isso silenciosamente sem eu poder testar contra o
  // ambiente real — fica como melhoria futura, testada com calma. Os
  // headers abaixo são de baixo risco (não dependem de saber toda origem
  // externa usada pelo site).
  //
  // X-Frame-Options era "DENY" até 08/08/2026, mas isso também bloqueava o
  // próprio painel lateral (components/painel-lateral.tsx) — o "abrir
  // cliente/imóvel sem sair da tela" carrega a ficha num iframe com
  // ?embed=1 DO MESMO domínio, e "DENY" barra até isso (aparecia como
  // ícone de conteúdo quebrado no painel). "SAMEORIGIN" mantém a proteção
  // contra clickjacking de outros sites, só permitindo iframe de dentro do
  // próprio sistema.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }
        ]
      }
    ];
  }
};

export default nextConfig;
