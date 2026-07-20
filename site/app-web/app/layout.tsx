import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
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

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <Suspense fallback={null}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
