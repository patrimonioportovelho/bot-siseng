"use client";

import { useState } from "react";

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
// acesso administrativo): quem digita esse email/senha pela primeira vez
// (email @remax.com.br + função Corretor ativa no cadastro) já sai logado —
// a senha digitada vira a senha definitiva na hora. Ver loginPortal em
// lib/portal-auth.ts.
export function PortalLoginPanel({
  action,
  erro
}: {
  action: (formData: FormData) => void;
  erro?: string;
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
          <form
            action={action}
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

            {erro && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{erro}</div>
            )}

            <label className="text-xs text-gray-600 block mb-1">Email @remax.com.br</label>
            <input
              name="email"
              type="email"
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-primary"
              placeholder="seunome@remax.com.br"
            />

            <label className="text-xs text-gray-600 block mb-1">Senha</label>
            <input
              name="senha"
              type="password"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-6 outline-none focus:border-primary"
              placeholder="Sua senha"
            />

            <button
              type="submit"
              className="w-full bg-primary text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90"
            >
              Entrar
            </button>

            <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
              Acesso restrito a quem tem função Corretor ativa no cadastro de parceiros, com esse email
              cadastrado na ficha. Primeiro acesso? Digite o email e escolha a senha que quiser aqui
              mesmo — já fica valendo na hora. Esqueceu a senha depois? Peça pra um administrador
              redefinir.
            </p>
          </form>
        </div>
      )}
    </>
  );
}
