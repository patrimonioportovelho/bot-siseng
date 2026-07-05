"use server";

import { redirect } from "next/navigation";
import { loginAdmin, logoutAdmin } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const nome = String(formData.get("nome") ?? "");
  const cpf = String(formData.get("cpf") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  const result = await loginAdmin(nome, cpf);
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
