"use client";

// Achado da revisão de 01/08/2026 (relato de "tela ficou toda branca" ao
// salvar uma edição de Compra e Venda): já existia um app/error.tsx (pega
// erro dentro de uma página), mas ele só cobre erros abaixo do layout raiz
// — um erro dentro do próprio app/layout.tsx (ex.: no AppShell, no menu
// lateral, na barra de progresso) não é capturado por ele, e sem nenhum
// global-error.tsx a tela realmente fica em branco (o Next não tem mais
// nenhum lugar pra desenhar um aviso). Isso aqui é essa rede de segurança
// que faltava: precisa renderizar <html>/<body> própria (substitui o layout
// inteiro quando aciona) — por isso estilo inline em vez de classes
// Tailwind, pra não depender do CSS já ter carregado.
export default function GlobalError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffffff",
            padding: 16,
            fontFamily: "system-ui, -apple-system, sans-serif"
          }}
        >
          <div style={{ maxWidth: 380, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1f2937", marginBottom: 8 }}>Algo deu errado</div>
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16, lineHeight: 1.5 }}>
              O sistema travou por um erro inesperado. O que você já tinha salvo antes disso continua salvo — tente
              de novo; se continuar acontecendo, avise o administrativo.
            </p>
            <button
              onClick={() => reset()}
              style={{
                background: "#635bff",
                color: "#ffffff",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                border: "none",
                cursor: "pointer"
              }}
            >
              Tentar de novo
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
