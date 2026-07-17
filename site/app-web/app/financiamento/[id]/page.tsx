import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { AvaliacaoForm } from "@/components/avaliacao-form";
import { AndamentoForm } from "@/components/andamento-form";
import { LancamentosLista } from "@/components/lancamentos-lista";
import { formatDataCalendario } from "@/lib/format";
import {
  atualizarAvaliacaoAction,
  criarAndamentoAction,
  atualizarAndamentoAction,
  sincronizarLancamentosAction,
  apagarAvaliacaoAction,
  apagarAndamentoAction
} from "../actions";

export const dynamic = "force-dynamic";

export default async function AvaliacaoDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;
  const session = await getAdminSession();

  const avaliacao = await prisma.avaliacoes.findUnique({
    where: { id },
    include: { clientes: true, bancos: true, parceiros: true }
  });

  if (!avaliacao || avaliacao.excluido) notFound();

  const [clientes, bancos, parceiros, imoveis, andamentos] = await Promise.all([
    prisma.clientes.findMany({
      where: { OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, cpf: true, telefone: true, parceiro_id: true }
    }),
    prisma.bancos.findMany({ orderBy: { nome: "asc" } }),
    prisma.parceiros.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.imoveis.findMany({
      where: { excluido: false },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        endereco: true,
        inscricao: true,
        imoveis_proprietarios: {
          orderBy: { ordem: "asc" },
          select: { clientes: { select: { id: true, nome: true } } }
        }
      }
    }),
    prisma.andamentos.findMany({
      where: { avaliacao_id: id, excluido: false },
      orderBy: { created_at: "desc" },
      include: { lancamentos_financiamento: { orderBy: { created_at: "asc" } } }
    })
  ]);

  // Cliente vendedor e Imóvel andam juntos no Andamento (mesmo padrão do
  // cadastro de Administração) — aqui já resolve os proprietários de cada
  // imóvel pra alimentar a busca em cascata dentro do AndamentoForm.
  const imoveisComProprietarios = imoveis.map((i) => ({
    id: i.id,
    endereco: i.endereco,
    inscricao: i.inscricao,
    proprietarios: i.imoveis_proprietarios.map((v) => v.clientes)
  }));

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3">
        <Link href="/financiamento" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Financiamento
        </Link>
        {session?.isAdm && !avaliacao.excluido && (
          <form action={apagarAvaliacaoAction}>
            <input type="hidden" name="avaliacaoId" value={avaliacao.id} />
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
          Salvo com sucesso.
        </div>
      )}

      <div className="flex items-center gap-2 mb-1">
        <div className="text-sm font-bold text-gray-800">{avaliacao.clientes?.nome ?? "Cliente sem cadastro"}</div>
        <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
          Id: {avaliacao.id_legado ?? avaliacao.id}
        </span>
      </div>
      <div className="text-xs text-gray-500 mb-0.5">
        {avaliacao.tipo_avaliacao ?? "Avaliação"} · {avaliacao.status}
        {avaliacao.bancos?.nome && <> · {avaliacao.bancos.nome}</>}
      </div>
      <div className="text-xs text-gray-400 mb-4">
        Avaliada em {formatDataCalendario(avaliacao.data_avaliacao)}
        {avaliacao.parceiros?.nome && <> · Parceiro: {avaliacao.parceiros.nome}</>}
      </div>

      <AvaliacaoForm avaliacao={avaliacao} clientes={clientes} bancos={bancos} parceiros={parceiros} action={atualizarAvaliacaoAction} />

      {/* Andamento só faz sentido depois que o crédito foi Aprovado — é
          quando a avaliação vira negócio de verdade. Se já existe algum
          Andamento cadastrado, continua aparecendo pra edição mesmo que o
          status tenha mudado depois (ex.: Concluído, pelo sincronismo
          automático em sincronizarStatusAvaliacao). */}
      {avaliacao.status !== "Aprovado" && andamentos.length === 0 ? (
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500">
          Andamento só é iniciado quando a Avaliação estiver com status <strong>Aprovado</strong> — é quando o
          crédito vira negócio de fato e entra o processo do imóvel.
        </div>
      ) : (
        <>
          <div className="mt-6 mb-2">
            <div className="text-sm font-bold text-gray-800">
              Andamento{andamentos.length !== 1 ? "s" : ""}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              É o processo de fato, depois que a avaliação vira negócio — quando o Andamento chega em
              &quot;Concluído&quot;, esta avaliação acompanha e também fecha como Concluída.
            </p>
          </div>

          {andamentos.length === 0 ? (
            <AndamentoForm
              andamento={null}
              avaliacaoId={avaliacao.id}
              clientes={clientes}
              imoveis={imoveisComProprietarios}
              valorAprovadoCliente={avaliacao.valor_aprovado}
              actionCriar={criarAndamentoAction}
              actionAtualizar={atualizarAndamentoAction}
              actionApagar={apagarAndamentoAction}
              podeApagar={!!session?.isAdm}
            />
          ) : (
            <div className="flex flex-col gap-6">
              {andamentos.map((and) => (
                <div key={and.id} className="flex flex-col gap-4">
                  <AndamentoForm
                    andamento={and}
                    avaliacaoId={avaliacao.id}
                    clientes={clientes}
                    imoveis={imoveisComProprietarios}
                    valorAprovadoCliente={avaliacao.valor_aprovado}
                    actionCriar={criarAndamentoAction}
                    actionAtualizar={atualizarAndamentoAction}
                    actionApagar={apagarAndamentoAction}
                    podeApagar={!!session?.isAdm}
                  />
                  <LancamentosLista
                    andamentoId={and.id}
                    lancamentosIniciais={and.lancamentos_financiamento}
                    action={sincronizarLancamentosAction}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
