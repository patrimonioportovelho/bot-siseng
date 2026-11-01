import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { CarregandoTelaCheia } from "@/components/carregando-tela-cheia";
import { getAdminSession } from "@/lib/auth";
import { acessosDaSessao } from "@/lib/acessos";
import "./globals.css";

export const metadata: Metadata = {
  title: "SisEng",
  description: "Sistema de gestão da imobiliária",
  // appleWebApp faz o iOS/Safari usar a logo (app/apple-icon.png) e o nome
  // "SisEng" quando o usuário faz "Adicionar à Tela de Início" — sem isso,
  // o iOS cai no fallback de print da página como ícone do atalho.
  appleWebApp: {
    capable: true,
    title: "SisEng",
    statusBarStyle: "default"
  }
};

// theme_color/background_color do manifest (app/manifest.ts) cobrem
// Android/Chrome; viewport.themeColor aqui cobre a barra de status quando
// o app já está instalado como atalho/PWA.
export const viewport: Viewport = {
  themeColor: "#635bff"
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // Papéis de quem está logado no administrativo (filtra o menu e avisa
  // "somente consulta") — null fora do administrativo. Quem de fato pode
  // abrir/gravar é decidido no middleware e nas Server Actions.
  const sessao = await getAdminSession();
  const acessos = sessao ? acessosDaSessao(sessao) : null;
  return (
    <html lang="pt-BR">
      <body>
        <Suspense fallback={<CarregandoTelaCheia />}>
          <AppShell acessos={acessos}>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
