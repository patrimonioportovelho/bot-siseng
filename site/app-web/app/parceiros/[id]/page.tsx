import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { ParceiroForm } from "@/components/parceiro-form";
import { formatMoeda, formatData } from "@/lib/format";
import { atualizarParceiroAction, apagarParceiroAction } from "../actions";

export const dynamic = "force-dynamic";

const FUNCOES_COM_COMISSIONAMENTO = ["Corretor", "Corretor Estagiário"];

function Cartao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <div className="text-sm font-bold text-gray-800 mb-3">{titulo}</div>
      {children}
    </div>
  );
}

export default async function ParceiroDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;
  const session = await getAdminSession();

  const [parceiro, lojas, bancos] = await Promise.all([
    prisma.parceiros.findUnique({ where: { id } }),
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.bancos.findMany({ orderBy: { nome: "asc" } })
  ]);

  if (!parceiro) notFound();

  const [imoveis, clientes, avaliacoes, pagamentos, contrato, documentos, primeiraTransacao] = await Promise.all([
    prisma.imoveis.findMany({
      where: { parceiro_id: id },
      orderBy: { created_at: "desc" }
    }),
    prisma.clientes.findMany({
      where: { parceiro_id: id },
      orderBy: { created_at: "desc" }
    }),
    prisma.avaliacoes.findMany({
      where: { parceiro_id: id },
      orderBy: { created_at: "desc" },
      include: { clientes: true, bancos: true }
    }),
    prisma.pagamentos.findMany({
      where: { parceiro_id: id },
      orderBy: { created_at: "desc" }
    }),
    prisma.contratos_corretor.findFirst({
      where: { parceiro_id: id },
      orderBy: { created_at: "desc" }
    }),
    prisma.documentos_gerados.findMany({
      where: { entidade_tipo: "parceiro", entidade_id: id },
      orderBy: { gerado_em: "desc" },
      take: 10
    }),
    prisma.transacoes.findFirst({
      where: { OR: [{ corretor_proprietario_id: id }, { corretor_contraparte_id: id }] },
      orderBy: { data_assinatura: "asc" },
      select: { tipo: true, data_assinatura: true, created_at: true }
    })
  ]);

  const totalHonorarios = pagamentos.reduce((soma, p) => soma + Number(p.valor_parceiro ?? 0), 0);
  const mostrarComissionamento = FUNCOES_COM_COMISSIONAMENTO.includes(parceiro.funcao);

  const desde = primeiraTransacao?.data_assinatura ?? primeiraTransacao?.created_at ?? parceiro.data_entrada ?? null;

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3">
        <Link href="/parceiros" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Parceiros
        </Link>
        {session?.isAdm && parceiro.status_funcao !== "Excluído" && (
          <form action={apagarParceiroAction}>
            <input type="hidden" name="parceiroId" value={parceiro.id} />
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
          Parceiro salvo com sucesso.
        </div>
      )}

      <div className="text-sm font-bold text-gray-800 mb-1">{parceiro.nome}</div>
      <div className="text-xs text-gray-500 mb-0.5">
        {parceiro.funcao} · {parceiro.status_funcao}
      </div>
      <div className="text-xs text-gray-400 mb-4">
        id - {parceiro.id}
        {desde && (
          <>
            {" "}
            · desde {formatData(desde)}
            {primeiraTransacao?.tipo ? ` (${primeiraTransacao.tipo})` : ""}
          </>
        )}
      </div>

      <ParceiroForm parceiro={parceiro} lojas={lojas} bancos={bancos} action={atualizarParceiroAction} />

      <div className="grid lg:grid-cols-2 gap-4 mt-6 mb-4">
        <Cartao titulo={`Imóveis vinculados (${imoveis.length})`}>
          {imoveis.length === 0 && <p className="text-xs text-gray-400">Nenhum imóvel vinculado.</p>}
          <div className="flex flex-col gap-1.5 max-h-72 overflow-auto">
            {imoveis.map((im) => (
              <div key={im.id} className="text-xs text-gray-600 border-b border-gray-50 pb-1.5">
                <span className="font-medium text-gray-800">{im.endereco ?? "—"}</span>{" "}
                <span className="text-gray-400">
                  · {im.status_imovel ?? "—"} · {formatMoeda(im.valor_venda)}
                </span>
              </div>
            ))}
          </div>
        </Cartao>

        <Cartao titulo={`Clientes cadastrados (${clientes.length})`}>
          {clientes.length === 0 && <p className="text-xs text-gray-400">Nenhum cliente cadastrado.</p>}
          <div className="flex flex-col gap-1.5 max-h-72 overflow-auto">
            {clientes.map((c) => (
              <div key={c.id} className="text-xs text-gray-600 border-b border-gray-50 pb-1.5">
                <span className="font-medium text-gray-800">{c.nome}</span>{" "}
                <span className="text-gray-400">
                  · {c.tipo_cliente} · {c.telefone ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </Cartao>

        <Cartao titulo={`Aprovações de financiamento (${avaliacoes.length})`}>
          {avaliacoes.length === 0 && <p className="text-xs text-gray-400">Nenhuma avaliação registrada.</p>}
          <div className="flex flex-col gap-1.5 max-h-72 overflow-auto">
            {avaliacoes.map((a) => (
              <div key={a.id} className="text-xs text-gray-600 border-b border-gray-50 pb-1.5">
                <span className="font-medium text-gray-800">{a.clientes?.nome ?? "—"}</span>{" "}
                <span className="text-gray-400">
                  · {a.bancos?.nome ?? "—"} · {a.status} · {formatMoeda(a.valor_aprovado)}
                </span>
              </div>
            ))}
          </div>
        </Cartao>

        <Cartao titulo={`Honorários recebidos (${formatMoeda(totalHonorarios)})`}>
          {pagamentos.length === 0 && <p className="text-xs text-gray-400">Nenhum pagamento registrado.</p>}
          <div className="flex flex-col gap-1.5 max-h-72 overflow-auto">
            {pagamentos.map((p) => (
              <div key={p.id} className="text-xs text-gray-600 border-b border-gray-50 pb-1.5">
                <span className="font-medium text-gray-800">{formatMoeda(p.valor_parceiro)}</span>{" "}
                <span className="text-gray-400">
                  · {p.status} · {formatData(p.data_recebimento)}
                </span>
              </div>
            ))}
          </div>
        </Cartao>
      </div>

      {((mostrarComissionamento && contrato) || documentos.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          {mostrarComissionamento && contrato && (
            <Cartao titulo="Contrato de associação">
              <div className="text-xs text-gray-600">
                <span className="font-medium text-gray-800">{contrato.status}</span> · fee{" "}
                {formatMoeda(contrato.fee)} · compra {contrato.porc_compr ? `${Number(contrato.porc_compr) * 100}%` : "—"} ·
                venda {contrato.porc_vend ? `${Number(contrato.porc_vend) * 100}%` : "—"}
              </div>
            </Cartao>
          )}
          {documentos.length > 0 && (
            <Cartao titulo="Documentos gerados">
              <div className="flex flex-col gap-1.5">
                {documentos.map((d) => (
                  <div key={d.id} className="text-xs text-gray-600 border-b border-gray-50 pb-1.5">
                    <span className="font-medium text-gray-800">{d.tipo_documento}</span>{" "}
                    <span className="text-gray-400">
                      · {d.status} · {formatData(d.gerado_em)}
                    </span>
                    {d.arquivo_url && (
                      <a href={d.arquivo_url} target="_blank" rel="noopener noreferrer" className="text-primary ml-2">
                        abrir
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Cartao>
          )}
        </div>
      )}
    </div>
  );
}
