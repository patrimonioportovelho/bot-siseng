import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ erro?: string; pendente?: string; next?: string }>;
}) {
  const { erro, pendente, next } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form action={loginAction} className="bg-white border border-gray-200 rounded-xl p-8 w-full max-w-sm shadow-sm">
        <div className="text-lg font-bold text-gray-900 mb-1">Acesso administrativo</div>
        <div className="text-sm text-gray-500 mb-6">SisEng</div>

        {erro && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            {erro}
          </div>
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

        <label className="text-xs text-gray-600 block mb-1">CPF</label>
        <input
          name="cpf"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-6 outline-none focus:border-primary"
          placeholder="000.000.000-00"
        />

        <button
          type="submit"
          className="w-full bg-primary text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90"
        >
          Entrar
        </button>

        <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
          O nome precisa estar cadastrado como parceiro ativo. Se for seu primeiro acesso, sua
          solicitação fica pendente até um administrador aprovar. Toda ação no sistema fica
          registrada nos logs de auditoria.
        </p>
      </form>
    </div>
  );
}
