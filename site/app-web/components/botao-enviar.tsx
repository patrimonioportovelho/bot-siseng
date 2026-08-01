"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

// Botão de submit com estado de "processando" via useFormStatus — funciona
// com qualquer <form action={...}>, mesmo sem useActionState (só precisa
// estar dentro do <form>). Resolve a reclamação de "clico em Entrar e não
// sei se travou": sem isso, o botão ficava com aparência normal até a
// Server Action terminar (login demora um pouco: verifica sessão, grava
// log de acesso, redireciona).
export function BotaoEnviar({
  children,
  textoEnviando = "Enviando...",
  className,
  disabled
}: {
  children: ReactNode;
  textoEnviando?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {pending ? textoEnviando : children}
    </button>
  );
}
