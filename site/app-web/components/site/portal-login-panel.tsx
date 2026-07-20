"use client";

import { useState } from "react";
import { PortalLoginForm } from "@/components/portal-login-form";

// Painel de "Acesso do corretor" — mesmo padrão do AdminLoginPanel: vive
// dentro da página pública (app/login/page.tsx) como um botão que abre o
// formulário de login por cima do site, em vez de navegar pra uma página
// separada (/portal/login). Essa página separada continua existindo — é
// pra onde o middleware manda o corretor quando a sessão dele expira
// enquanto já está dentro do portal — mas aqui, a partir do site público,
// fica igual ao acesso administrativo (pedido do usuário). Abre sozinho se
// já vier um erro da tentativa anterior, pra pessoa não perder a mensagem.
//
// Primeiro acesso é self-service (pedido explícito do usuário, diferente do
// acesso administrativo): quem digita esse email pela primeira vez (email
// @remax.com.br + função Corretor ativa no cadastro) recebe a chance de
// criar a senha na hora — ver PortalLoginForm, que também cuida de deixar
// isso explícito na tela (em vez de um campo "Senha" ambíguo).
export function PortalLoginPanel({
  action,
  erro,
  emailInicial
}: {
  action: (formData: FormData) => void;
  erro?: string;
  emailInicial?: string;
}) {
  const [aberto, setAberto] = useState(Boolean(erro));

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-xs bg-accent text-white rounded-lg px-3 py-1.5 font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
      >
        Acesso do corretor
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setAberto(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-gray-200 rounded-xl p-8 w-full max-w-sm shadow-xl relative"
          >
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-sm"
            >
              ✕
            </button>

            <div className="flex items-center gap-2 mb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-192.png" alt="SisEng" className="h-8 w-8" />
              <div className="text-lg font-bold text-gray-900">Acesso do corretor</div>
            </div>
            <div className="text-sm text-gray-500 mb-6">Portal do corretor</div>

            <PortalLoginForm action={action} erro={erro} emailInicial={emailInicial} />
          </div>
        </div>
      )}
    </>
  );
}
