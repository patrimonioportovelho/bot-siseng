import { getAdminSession } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";

function iniciais(nome: string | undefined) {
  if (!nome) return "—";
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

export async function Topbar() {
  const session = await getAdminSession();

  return (
    <div className="flex items-center justify-between mb-4">
      <button className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600">
        Porto Velho
      </button>
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
          {iniciais(session?.nome)}
        </div>
        <span className="text-xs text-gray-700">
          {session?.nome ?? "Não identificado"} {session?.isAdm ? "· ADM" : ""}
        </span>
        <form action={logoutAction}>
          <button type="submit" className="text-xs text-gray-400 hover:text-gray-700">
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
