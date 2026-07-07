"use server";

import { redirect } from "next/navigation";
import { loginAdmin, logoutAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function loginAction(formData: FormData) {
  const nome = String(formData.get("nome") ?? "");
  const email = String(formData.get("email") ?? "");
  const senha = String(formData.get("senha") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  const result = await loginAdmin(nome, email, senha);
  if (!result.ok) {
    const campo = result.pendente ? "pendente" : "erro";
    redirect(`/login?${campo}=${encodeURIComponent(result.error)}`);
  }
  redirect(next || "/dashboard");
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
