"use server";

import { redirect } from "next/navigation";
import { loginAdmin, logoutAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Achado de segurança (auditoria de 01/08/2026): "next" vem de um query
// param que qualquer link pode montar (ex.: /login?next=https://site-falso.com).
// Sem essa checagem, depois de logar de verdade a pessoa era mandada pra
// fora do domínio — vetor clássico de phishing pós-login. Só aceita caminho
// relativo que começa com uma única barra (bloqueia "//evil.com", que o
// navegador trata como protocol-relative pra outro domínio, e bloqueia
// "http(s)://...").
function caminhoInternoSeguro(valor: string): string {
  if (valor.startsWith("/") && !valor.startsWith("//") && !valor.startsWith("/\\")) {
    return valor;
  }
  return "/dashboard";
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const senha = String(formData.get("senha") ?? "");
  const next = caminhoInternoSeguro(String(formData.get("next") ?? "/dashboard"));

  const result = await loginAdmin(email, senha);
  if (!result.ok) {
    redirect(`/login?erro=${encodeURIComponent(result.error)}`);
  }
  redirect(next);
}

export async function logoutAction() {
  await logoutAdmin();
  redirect("/login");
}

// Formulário de SAC do site público — sem sessão nenhuma (qualquer visitante
// pode enviar). Só grava a mensagem; não manda e-mail (ver observação em
// mensagens_sac no schema) — o time acompanha e resolve manualmente dentro
// de Configurações.
export async function criarMensagemSacAction(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const telefone = String(formData.get("telefone") ?? "").trim() || null;
  const assunto = String(formData.get("assunto") ?? "").trim() || null;
  const mensagem = String(formData.get("mensagem") ?? "").trim();

  if (!nome || !email || !mensagem) {
    redirect(`/login?sac_erro=${encodeURIComponent("Preencha nome, e-mail e mensagem.")}#sac`);
  }

  await prisma.mensagens_sac.create({
    data: { nome, email, telefone, assunto, mensagem }
  });

  redirect("/login?sac_ok=1#sac");
}
