"use client";

import { useFormStatus } from "react-dom";

// Botão de submit com estado de carregamento — pedido do usuário em
// 09/08/2026: "os botões de salvar, adicionar ou agendar precisam mostrar
// o carregamento pra verem que está processando". useFormStatus só
// funciona dentro de um <form> (lê o estado do form pai), por isso este é
// sempre usado COMO FILHO do <form action={...}>, nunca fora dele.
//
// Cuidado importante pra quem for usar isso num <form> que embrulha a
// action pra dar reset (ex.: components/marketing-checklist.tsx): o
// wrapper precisa ser `async (formData) => { await action(formData); ... }`
// — se não retornar/aguardar a promise da action, o React marca o form como
// "resolvido" na hora e o spinner nem chega a aparecer.
export function BotaoSubmit({
  children,
  carregandoTexto,
  className,
  variante = "primario",
  disabled
}: {
  children: React.ReactNode;
  carregandoTexto?: string;
  className?: string;
  variante?: "primario" | "secundario" | "perigo";
  // Condição extra de desabilitar vinda de fora (ex.: validação de campo
  // ainda incompleta) — consolidado aqui em 30/08/2026 ao unificar com o
  // então-duplicado components/botao-enviar.tsx, que só tinha essa prop.
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  const corSpinner =
    variante === "primario" ? "border-white/40 border-t-white" : "border-current/30 border-t-current";

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={`${className ?? ""} ${pending ? "opacity-70 cursor-wait" : disabled ? "opacity-60 cursor-not-allowed" : ""} inline-flex items-center justify-center gap-1.5`}
    >
      {pending && <span className={`w-3 h-3 border-2 rounded-full animate-spin shrink-0 ${corSpinner}`} />}
      {pending ? carregandoTexto ?? "Enviando..." : children}
    </button>
  );
}
