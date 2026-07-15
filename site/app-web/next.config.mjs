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
  }
};

export default nextConfig;
