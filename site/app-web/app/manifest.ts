import type { MetadataRoute } from "next";

// Arquivo especial do Next.js (App Router) — gera /manifest.webmanifest
// automaticamente e já injeta o <link rel="manifest"> no <head>. É isso que
// faz o Android/Chrome usar a logo (em vez de um print da tela) quando o
// usuário faz "Adicionar à tela inicial", e permite abrir em modo app
// (sem a barra de endereço do navegador).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SisEng",
    short_name: "SisEng",
    description: "Sistema de gestão da imobiliária",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#635bff",
    icons: [
      {
        src: "/logo-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/logo-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/logo-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/logo-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
