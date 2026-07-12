import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { trocarSenhaPortalAction } from "../actions";

export const dynamic = "force-dynamic";

// Troca de senha do próprio corretor — pede a senha atual, então usa o
// mesmo campo senha_hash do login administrativo (ver trocarSenhaPortal em
// lib/portal-auth.ts). Não existe "esqueci minha senha" aqui: se o corretor
// esquecer, quem resolve é um administrador em Configurações.
export default async function PortalSenhaPage({
  searchParams
}: {
  searchParams: Promise<{ erro?: string; salvo?: string }>;
}) {
  const session = await requirePortalSession();
  const { erro, salvo } = await searchParams;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-sm mx-auto px-4 py-6">
        <Link href="/portal" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-lg font-bold text-gray-900 mb-1">Trocar senha</div>
          <p className="text-xs text-gray-500 mb-4">
            Essa é a mesma senha usada pra entrar no sistema administrativo, se você também tiver
            acesso lá.
          </p>

          {salvo === "1" && (
            <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              Senha alterada com sucesso.
            </div>
          )}
          {erro && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              {erro}
            </div>
          )}

          <form action={trocarSenhaPortalAction} className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Senha atual</label>
              <input
                type="password"
                name="senhaAtual"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Nova senha</label>
              <input
                type="password"
                name="senhaNova"
                required
                minLength={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Confirmar nova senha</label>
              <input
                type="password"
                name="senhaNovaConfirma"
                required
                minLength={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              type="submit"
              className="bg-primary text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90 mt-1"
            >
              Salvar nova senha
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
