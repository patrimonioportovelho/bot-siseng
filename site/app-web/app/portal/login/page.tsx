import { loginPortalAction } from "../actions";
import { PortalLoginForm } from "@/components/portal-login-form";

// Login por email + senha — só entra quem tem email @remax.com.br e função
// "Corretor" ativa no cadastro de parceiros (ver loginPortal em
// lib/portal-auth.ts). Primeiro acesso: o próprio corretor escolhe a senha
// aqui mesmo, sem precisar de aprovação — ela já vira a senha definitiva. Em
// duas etapas (PortalLoginForm) pra deixar isso explícito na tela, em vez de
// um campo "Senha" ambíguo pra todo mundo. Depois de logado, ele pode trocar
// a própria senha em /portal/senha, ou pedir pra um administrador redefinir
// em Configurações se esquecer.
export default async function PortalLoginPage({
  searchParams
}: {
  searchParams: Promise<{ erro?: string; email?: string }>;
}) {
  const { erro, email } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white border border-gray-200 rounded-xl p-8 w-full max-w-sm shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-192.png" alt="SisEng" className="h-9 w-9" />
          <div className="text-lg font-bold text-gray-900">Acesso</div>
        </div>
        <div className="text-sm text-gray-500 mb-6">Portal do corretor</div>

        <PortalLoginForm action={loginPortalAction} erro={erro} emailInicial={email} />
      </div>
    </div>
  );
}
