import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { formatMoeda } from "@/lib/format";
import { STATUS_ADM } from "@/lib/administracoes/opcoes";

export const dynamic = "force-dynamic";

export default async function AdministracoesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const termo = (q ?? "").trim();

  const where = termo
    ? {
        OR: [
          { clientes: { nome: { contains: termo, mode: "insensitive" as const } } },
          { imoveis: { endereco: { contains: termo, mode: "insensitive" as const } } },
          { id_legado: { contains: termo, mode: "insensitive" as const } }
        ]
      }
    : undefined;

  const administracoes = await prisma.adm_imoveis.findMany({
    where,
    orderBy: { created_at: "desc" },
    include: { clientes: true, imoveis: true, lojas: true }
  });

  // Agrupa por Loja e, dentro de cada loja, por Status — na ordem do funil
  // (Captação -> Ativo -> Locado -> Encerrado), pra ficar fácil de bater o
  // olho e entender onde cada administração está.
  const porLoja = new Map<string, typeof administracoes>();
  for (const a of administracoes) {
    const nomeLoja = a.lojas?.nome ?? "Sem loja";
    if (!porLoja.has(nomeLoja)) porLoja.set(nomeLoja, []);
    porLoja.get(nomeLoja)!.push(a);
  }
  const lojasOrdenadas = [...porLoja.keys()].sort((x, y) => {
    const ordem = ["Porto Velho", "Jaru"];
    const ix = ordem.indexOf(x);
    const iy = ordem.indexOf(y);
    if (ix === -1 && iy === -1) return x.localeCompare(y);
    if (ix === -1) return 1;
    if (iy === -1) return -1;
    return ix - iy;
  });

  return (
    <div>
      <Topbar />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-800">Administrações ({administracoes.length})</div>
          <div className="flex gap-2">
            <form className="flex gap-2">
              <input
                type="text"
                name="q"
                defaultValue={termo}
                placeholder="Buscar por proprietário, imóvel ou Id..."
                className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-64 outline-none focus:border-primary"
              />
              <button type="submit" className="text-xs bg-white border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5">
                Buscar
              </button>
            </form>
            <Link
              href="/administracoes/novo"
              className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
            >
              + Adicionar administração
            </Link>
          </div>
        </div>

        {administracoes.length === 0 && (
          <div className="py-6 text-center text-gray-400 text-xs">Nenhuma administração encontrada.</div>
        )}

        {lojasOrdenadas.map((nomeLoja) => {
          const doLoja = porLoja.get(nomeLoja)!;
          const porStatus = new Map<string, typeof administracoes>();
          for (const a of doLoja) {
            const s = a.status ?? "Sem status";
            if (!porStatus.has(s)) porStatus.set(s, []);
            porStatus.get(s)!.push(a);
          }
          const statusOrdenados = [...porStatus.keys()].sort((x, y) => {
            const ix = STATUS_ADM.indexOf(x);
            const iy = STATUS_ADM.indexOf(y);
            if (ix === -1 && iy === -1) return x.localeCompare(y);
            if (ix === -1) return 1;
            if (iy === -1) return -1;
            return ix - iy;
          });

          return (
            <div key={nomeLoja} className="mb-6 last:mb-0">
              <div className="text-xs font-bold text-gray-700 bg-gray-50 rounded-lg px-3 py-2 mb-2">
                {nomeLoja} ({doLoja.length})
              </div>

              {statusOrdenados.map((status) => {
                const doStatus = porStatus.get(status)!;
                return (
                  <div key={status} className="mb-3 last:mb-0">
                    <div className="text-[11px] font-semibold text-gray-500 px-3 py-1">
                      {status} ({doStatus.length})
                    </div>
                    <div className="grid grid-cols-[1fr_1.4fr_1.6fr_auto] gap-3 px-3 py-1 text-[11px] text-gray-400 border-b border-gray-100">
                      <span>Id</span>
                      <span>Proprietário</span>
                      <span>Imóvel</span>
                      <span className="text-right">Valor</span>
                    </div>
                    <div className="flex flex-col">
                      {doStatus.map((a) => (
                        <Link
                          key={a.id}
                          href={`/administracoes/${a.id}`}
                          className="grid grid-cols-[1fr_1.4fr_1.6fr_auto] gap-3 items-center px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <span className="text-xs text-gray-500 truncate">{a.id_legado ?? a.id}</span>
                          <span className="text-xs font-medium text-gray-800 truncate">
                            {a.clientes?.nome ?? "—"}
                          </span>
                          <span className="text-xs text-gray-500 truncate">{a.imoveis?.endereco ?? "—"}</span>
                          <span className="text-xs text-gray-600 text-right whitespace-nowrap">
                            {a.valor_transacao != null ? formatMoeda(a.valor_transacao) : "—"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
