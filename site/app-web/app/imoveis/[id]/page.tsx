import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { ImovelForm } from "@/components/imovel-form";
import { FUNCOES_CAPTADOR } from "@/lib/imoveis/opcoes";
import { URGENCIA_COR, URGENCIA_LABEL, labelColuna } from "@/lib/manutencao/opcoes";
import { atualizarImovelAction, apagarImovelAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ImovelDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;
  const session = await getAdminSession();

  const [imovel, clientes, parceiros, estados, cidades, manutencoes, bairrosCadastrados] = await Promise.all([
    prisma.imoveis.findUnique({
      where: { id },
      include: {
        parceiros: true,
        cidades: true,
        estados: true,
        imoveis_proprietarios: { include: { clientes: true }, orderBy: { ordem: "asc" } }
      }
    }),
    prisma.clientes.findMany({
      // NULL em status_cadastro conta como "não arquivado" — ver mesmo
      // comentário em app/imoveis/novo/page.tsx.
      where: { OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, id_legado: true, parceiro_id: true }
    }),
    prisma.parceiros.findMany({
      where: { funcao: { in: FUNCOES_CAPTADOR } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    prisma.estados.findMany({ orderBy: { nome: "asc" } }),
    prisma.cidades.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, estado_id: true } }),
    // Relação inversa: manutenções abertas pra este imóvel — pedido do
    // usuário, pra dar pra ver o histórico de manutenção direto na ficha do
    // imóvel, sem precisar ir procurar no quadro de Manutenção.
    prisma.manutencoes.findMany({
      where: { imovel_id: id, excluido: false },
      orderBy: { created_at: "desc" },
      include: { parceiros: { select: { nome: true } } }
    }),
    // Autocomplete de Bairro por Cidade (tipo EnumList do AppSheet) — ver
    // mesmo comentário em app/imoveis/novo/page.tsx.
    prisma.imoveis.findMany({
      where: { excluido: false, bairro: { not: null }, cidade_id: { not: null } },
      select: { cidade_id: true, bairro: true },
      distinct: ["cidade_id", "bairro"]
    })
  ]);

  if (!imovel) notFound();

  const enderecoMontado = [imovel.rua, imovel.n_predial].filter(Boolean).join(", ");
  const titulo = imovel.endereco || enderecoMontado || "Imóvel sem endereço";
  const proprietarios = imovel.imoveis_proprietarios.map((v) => v.clientes);
  const nomesProprietarios = proprietarios.map((c) => c.nome).join(", ");

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3">
        <Link href="/imoveis" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Imóveis
        </Link>
        {session?.isAdm && !imovel.excluido && (
          <form action={apagarImovelAction}>
            <input type="hidden" name="imovelId" value={imovel.id} />
            <button
              type="submit"
              className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50"
            >
              Apagar cadastro
            </button>
          </form>
        )}
      </div>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Imóvel salvo com sucesso.
        </div>
      )}

      <div className="text-sm font-bold text-gray-800 mb-1">{titulo}</div>
      <div className="text-xs text-gray-500 mb-0.5">
        {imovel.tipo_imovel ?? "—"}
        {nomesProprietarios && (
          <>
            {" "}
            · {proprietarios.length > 1 ? "Proprietários" : "Proprietário"}: {nomesProprietarios}
          </>
        )}
      </div>
      <div className="text-xs text-gray-400 mb-4">Id imóvel: {imovel.id_legado ?? imovel.id}</div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">Manutenções ({manutencoes.length})</div>
          <Link
            href={`/manutencao/novo?imovel_id=${imovel.id}`}
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold"
          >
            + Nova manutenção
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          {manutencoes.map((m) => (
            <Link
              key={m.id}
              href={`/manutencao/${m.id}`}
              className="border border-gray-100 rounded-lg px-3 py-2 flex items-center justify-between gap-2 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-800 truncate">{m.titulo}</div>
                <div className="text-[11px] text-gray-400 truncate">
                  {labelColuna(m.coluna)}
                  {m.parceiros?.nome ? ` · Prestador: ${m.parceiros.nome}` : ""}
                </div>
              </div>
              <span
                className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border shrink-0 ${
                  (URGENCIA_COR[m.urgencia] ?? URGENCIA_COR.media).bg
                } ${(URGENCIA_COR[m.urgencia] ?? URGENCIA_COR.media).texto} ${
                  (URGENCIA_COR[m.urgencia] ?? URGENCIA_COR.media).borda
                }`}
              >
                {URGENCIA_LABEL[m.urgencia] ?? m.urgencia}
              </span>
            </Link>
          ))}
          {manutencoes.length === 0 && <p className="text-xs text-gray-400">Nenhuma manutenção registrada pra este imóvel.</p>}
        </div>
      </div>

      <ImovelForm
        imovel={imovel}
        clientes={clientes}
        proprietariosIniciais={proprietarios.map((c) => ({
          id: c.id,
          nome: c.nome,
          id_legado: c.id_legado,
          parceiro_id: c.parceiro_id
        }))}
        parceiros={parceiros}
        estados={estados}
        cidades={cidades}
        bairrosCadastrados={bairrosCadastrados}
        action={atualizarImovelAction}
      />
    </div>
  );
}
