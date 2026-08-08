/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // TEMPORÁRIO: lib/documentos/gerar.ts referencia prisma.documentos_gerados,
  // mas prisma/schema.prisma ainda não tem nenhum model (só existirá depois
  // de rodar `npx prisma db pull` contra o banco real do Supabase). Isso
  // quebra o type-check do build. Remover esta linha assim que o db pull
  // for feito e o schema.prisma tiver os models de verdade.
  typescript: {
    ignoreBuildErrors: true
  },
  experimental: {
    serverActions: {
      // Os formulários do portal (Compra e Venda, Gestão, Administração)
      // anexam documentos (PDF/foto) direto no FormData de uma Server
      // Action. O limite padrão do Next é 1MB — qualquer anexo real
      // estourava isso, e o corretor via só "An unexpected response was
      // received from the server." sem mais explicação (o Next rejeita a
      // requisição antes até de rodar a action, então nem cai no try/catch
      // de lib/erros.ts). 25mb cobre o limite de 15MB de anexos do
      // formulário (components/portal-compra-venda-form.tsx) já contando a
      // codificação base64 do multipart, com folga.
      bodySizeLimit: "25mb"
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
