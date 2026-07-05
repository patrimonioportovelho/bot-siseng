import { prisma } from "@/lib/prisma";
import { loginPortalAction } from "../actions";

const FUNCOES_CORRETOR = ["Corretor", "Corretor Externo", "Corretor Estagiário", "Parceiro Externa"];

export default async function PortalLoginPage({
  searchParams
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  const corretores = await prisma.parceiros.findMany({
    where: { funcao: { in: FUNCOES_CORRETOR }, status_funcao: "Ativo" },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" }
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form action={loginPortalAction} className="bg-white border border-gray-200 rounded-xl p-8 w-full max-w-sm shadow-sm">
        <div className="text-lg font-bold text-gray-900 mb-1">SisEng</div>
        <div className="text-sm text-gray-500 mb-6">Portal do corretor</div>

        {erro && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            {erro}
          </div>
        )}

        <label className="text-xs text-gray-600 block mb-1">Quem é você?</label>
        <select
          name="parceiroId"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-primary bg-white"
        >
          <option value="">Prefiro não informar</option>
          {corretores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>

        <label className="text-xs text-gray-600 block mb-1">Senha de acesso</label>
        <input
          type="password"
          name="senha"
          required
          autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-6 outline-none focus:border-primary"
          placeholder="Senha fornecida pela imobiliária"
        />

        <button
          type="submit"
          className="w-full bg-primary text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90"
        >
          Entrar
        </button>

        <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
          Informe seu nome para marcar itens do checklist como concluídos. Sem nome, você só
          consegue visualizar as notícias.
        </p>
      </form>
    </div>
  );
}
