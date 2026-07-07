import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { FUNCOES_EQUIPE, FUNCOES_EXTERNAS } from "@/lib/parceiros/opcoes";
import { formatTelefone } from "@/lib/format";

export const dynamic = "force-dynamic";

type Parceiro = Awaited<ReturnType<typeof buscarParceiros>>[number];

async function buscarParceiros(termo: string) {
  return prisma.parceiros.findMany({
    where: termo
      ? {
          OR: [
            { nome: { contains: termo, mode: "insensitive" } },
            { email: { contains: termo, mode: "insensitive" } },
            { funcao: { contains: termo, mode: "insensitive" } }
          ]
        }
      : undefined,
    orderBy: { nome: "asc" },
    take: 500,
    include: { lojas: true }
  });
}

function ParceiroRow({ p }: { p: Parceiro }) {
  const excluido = p.status_funcao === "Excluído";
  return (
    <Link
      href={`/parceiros/${p.id}`}
      className={
        "grid grid-cols-1 gap-0.5 md:grid-cols-[2fr_1fr_1fr_1fr_1.4fr_auto] md:gap-3 md:items-center px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors " +
        (excluido ? "opacity-50" : "")
      }
    >
      <span className="text-xs font-medium text-gray-800 truncate">{p.nome}</span>
      <span className="text-xs text-gray-500">{p.status_funcao}</span>
      <span className="text-xs text-gray-500 truncate">{p.lojas?.nome ?? "—"}</span>
      <span className="text-xs text-gray-500 truncate">{p.telefone ? formatTelefone(p.telefone) : "—"}</span>
      <span className="text-xs text-gray-500 truncate">{p.email ?? "—"}</span>
      <span className="text-gray-300 text-xs">›</span>
    </Link>
  );
}

function GrupoFuncao({ titulo, parceiros }: { titulo: string; parceiros: Parceiro[] }) {
  if (parceiros.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">{titulo}</div>
        <div className="text-[11px] text-gray-400">{parceiros.length}</div>
      </div>
      <div className="hidden md:grid md:grid-cols-[2fr_1fr_1fr_1fr_1.4fr_auto] gap-3 px-3 py-1 text-[11px] text-gray-400">
        <span>Nome</span>
        <span>Status</span>
        <span>Loja</span>
        <span>Telefone</span>
        <span>E-mail</span>
        <span></span>
      </div>
      <div className="flex flex-col">
        {parceiros.map((p) => (
          <ParceiroRow key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}

export default async function ParceirosPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; excluido?: string }>;
}) {
  const { q, excluido } = await searchParams;
  const termo = (q ?? "").trim();
  const parceiros = await buscarParceiros(termo);

  const porFuncao = new Map<string, Parceiro[]>();
  for (const p of parceiros) {
    const lista = porFuncao.get(p.funcao) ?? [];
    lista.push(p);
    porFuncao.set(p.funcao, lista);
  }

  const funcoesEquipePresentes = FUNCOES_EQUIPE.filter((f) => porFuncao.has(f));
  const funcoesExternasPresentes = FUNCOES_EXTERNAS.filter((f) => porFuncao.has(f));
  const outrasFuncoes = [...porFuncao.keys()].filter(
    (f) => !FUNCOES_EQUIPE.includes(f) && !FUNCOES_EXTERNAS.includes(f)
  );

  return (
    <div>
      <Topbar />

      {excluido === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Cadastro apagado com sucesso.
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-gray-800">Parceiros ({parceiros.length})</div>
        <div className="flex gap-2">
          <form className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={termo}
              placeholder="Buscar por nome, e-mail ou função..."
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-64 outline-none focus:border-primary"
            />
            <button type="submit" className="text-xs bg-white border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5">
              Buscar
            </button>
          </form>
          <Link
            href="/parceiros/novo"
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
          >
            + Novo parceiro
          </Link>
        </div>
      </div>

      {parceiros.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          Nenhum parceiro encontrado.
        </div>
      )}

      {funcoesEquipePresentes.length > 0 && (
        <>
          <div className="text-xs font-bold text-primary uppercase tracking-wide mb-2 mt-1">Nossa equipe</div>
          {funcoesEquipePresentes.map((f) => (
            <GrupoFuncao key={f} titulo={f} parceiros={porFuncao.get(f)!} />
          ))}
        </>
      )}

      {(funcoesExternasPresentes.length > 0 || outrasFuncoes.length > 0) && (
        <>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 mt-3">Parceiros externos</div>
          {funcoesExternasPresentes.map((f) => (
            <GrupoFuncao key={f} titulo={f} parceiros={porFuncao.get(f)!} />
          ))}
          {outrasFuncoes.map((f) => (
            <GrupoFuncao key={f} titulo={f} parceiros={porFuncao.get(f)!} />
          ))}
        </>
      )}
    </div>
  );
}
