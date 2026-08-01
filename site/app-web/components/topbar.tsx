import { getAdminSession } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { listarLojas, lojasSelecionadas } from "@/lib/lojas/filtro";
import { LojaFiltroBotao } from "@/components/loja-filtro-botao";

function iniciais(nome: string | undefined) {
  if (!nome) return "—";
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

export async function Topbar() {
  const session = await getAdminSession();
  const [lojas, selecionadas] = await Promise.all([listarLojas(), lojasSelecionadas()]);

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
      <LojaFiltroBotao lojas={lojas} selecionadas={selecionadas} />
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">
          {iniciais(session?.nome)}
        </div>
        <span className="text-xs text-gray-700 hidden sm:inline">
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
