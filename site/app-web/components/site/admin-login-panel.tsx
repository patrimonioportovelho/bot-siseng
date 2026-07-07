"use client";

import { useState } from "react";

// Painel de "Acesso administrativo" — vive dentro da página pública
// (app/login/page.tsx) como um botão discreto que abre o formulário de
// login já existente por cima do site, em vez de ocupar a tela inteira
// como antes. Abre sozinho se já vier um erro/pendência da tentativa
// anterior, pra pessoa não perder a mensagem.
export function AdminLoginPanel({
  action,
  erro,
  pendente,
  next
}: {
  action: (formData: FormData) => void;
  erro?: string;
  pendente?: string;
  next?: string;
}) {
  const [aberto, setAberto] = useState(Boolean(erro || pendente));

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-xs bg-white/10 border border-white/30 text-white rounded-lg px-3 py-1.5 font-semibold hover:bg-white/20 transition-colors whitespace-nowrap"
      >
        Acesso administrativo
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

            <div className="text-lg font-bold text-gray-900 mb-1">Acesso administrativo</div>
            <div className="text-sm text-gray-500 mb-6">SisEng</div>

            {erro && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{erro}</div>
            )}

            {pendente && (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                {pendente}
              </div>
            )}

            <input type="hidden" name="next" value={next ?? "/dashboard"} />

            <label className="text-xs text-gray-600 block mb-1">Nome completo</label>
            <input
              name="nome"
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-primary"
              placeholder="Seu nome completo"
            />

            <label className="text-xs text-gray-600 block mb-1">Email</label>
            <input
              name="email"
              type="email"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-primary"
              placeholder="seuemail@exemplo.com"
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
              O email precisa estar cadastrado na ficha de parceiro ativo. Se for seu primeiro acesso,
              escolha a senha que quiser aqui — sua solicitação fica pendente até um administrador
              aprovar, e depois disso essa mesma senha já funciona. Toda ação no sistema fica registrada
              nos logs de auditoria.
            </p>
          </form>
        </div>
      )}
    </>
  );
}
