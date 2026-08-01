"use server";

import { cookies } from "next/headers";
import { COOKIE_LOJA_FILTRO } from "@/lib/lojas/filtro";

// Grava a seleção de lojas do filtro (ver components/loja-filtro-botao.tsx)
// num cookie de 1 ano — preferência de navegador, não de login (não existe
// hoje um conceito de "loja do admin"; todo admin pode ver as duas).
export async function definirLojaFiltroAction(lojaIds: string[]) {
  const cookieStore = await cookies();

  if (lojaIds.length === 0) {
    // Não deixamos ficar "nenhuma loja selecionada" (mostraria zero
    // registros em tudo, o que mais parece bug do que filtro) — o próprio
    // botão do Topbar já impede desmarcar a última, isso aqui é só um
    // reforço caso chegue vazio por algum outro caminho.
    cookieStore.delete(COOKIE_LOJA_FILTRO);
    return;
  }

  cookieStore.set(COOKIE_LOJA_FILTRO, lojaIds.join(","), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax"
  });
}
