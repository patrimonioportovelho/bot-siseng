import { loginPortalAction } from "../actions";

// Login por email + senha — só entra quem tem email @remax.com.br e função
// "Corretor" ativa no cadastro de parceiros (ver loginPortal em
// lib/portal-auth.ts). Primeiro acesso: o próprio corretor escolhe a senha
// aqui mesmo, sem precisar de aprovação — ela já vira a senha definitiva.
// Depois de logado, ele pode trocar a própria senha em /portal/senha, ou
// pedir pra um administrador redefinir em Configurações se esquecer.
export default async function PortalLoginPage({
  searchParams
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form action={loginPortalAction} className="bg-white border border-gray-200 rounded-xl p-8 w-full max-w-sm shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-192.png" alt="SisEng" className="h-9 w-9" />
          <div className="text-lg font-bold text-gray-900">Acesso</div>
        </div>
        <div className="text-sm text-gray-500 mb-6">Portal do corretor</div>

        {erro && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            {erro}
          </div>
        )}

        <label className="text-xs text-gray-600 block mb-1">Email @remax.com.br</label>
        <input
          type="email"
          name="email"
          required
          autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-primary"
          placeholder="seunome@remax.com.br"
        />

        <label className="text-xs text-gray-600 block mb-1">Senha</label>
        <input
          type="password"
          name="senha"
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
          Acesso restrito a quem tem função Corretor ativa no cadastro de parceiros, com esse
          email cadastrado na ficha. Primeiro acesso? Escolha a senha que quiser aqui mesmo — já
          fica valendo na hora. Esqueceu a senha depois? Peça pra um administrador redefinir.
        </p>
      </form>
    </div>
  );
}
