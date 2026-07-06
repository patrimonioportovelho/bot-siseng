import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { TransacaoForm } from "@/components/transacao-form";
import { formatData, formatMoeda } from "@/lib/format";
import { atualizarTransacaoAction } from "../actions";

export const dynamic = "force-dynamic";

function dataInput(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export default async function TransacaoDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;

  const [transacao, lojas, clientes, imoveis, parceiros, admImoveisAtivos] = await Promise.all([
    prisma.transacoes.findUnique({
      where: { id },
      include: {
        imoveis: { include: { imoveis_proprietarios: { include: { clientes: true }, orderBy: { ordem: "asc" } } } },
        transacoes_contrapartes: { include: { clientes: true }, orderBy: { ordem: "asc" } },
        condicoes_pagamento: { orderBy: { created_at: "asc" } },
        adm_imoveis: { select: { id: true, id_legado: true, parceiro_id: true, imovel_id: true, status: true, clientes: { select: { nome: true } } } }
      }
    }),
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.clientes.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, id_legado: true, parceiro_id: true }
    }),
    prisma.imoveis.findMany({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        id_legado: true,
        endereco: true,
        inscricao: true,
        parceiro_id: true,
        imoveis_proprietarios: {
          orderBy: { ordem: "asc" },
          select: { clientes: { select: { id: true, nome: true, parceiro_id: true } } }
        }
      }
    }),
    prisma.parceiros.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, funcao: true }
    }),
    prisma.adm_imoveis.findMany({
      where: { status: "Ativo" },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        id_legado: true,
        parceiro_id: true,
        imovel_id: true,
        imoveis: { select: { endereco: true, inscricao: true } },
        clientes: { select: { nome: true } }
      }
    })
  ]);

  if (!transacao) notFound();

  const clientesComParceiro = clientes.map((c) => ({
    id: c.id,
    nome: c.nome,
    id_legado: c.id_legado,
    parceiroId: c.parceiro_id
  }));

  const imoveisComProprietarios = imoveis.map((i) => ({
    id: i.id,
    id_legado: i.id_legado,
    endereco: i.endereco,
    inscricao: i.inscricao,
    parceiroId: i.parceiro_id,
    proprietarios: i.imoveis_proprietarios.map((v) => ({
      id: v.clientes.id,
      nome: v.clientes.nome,
      parceiroId: v.clientes.parceiro_id
    }))
  }));

  let administracoes = admImoveisAtivos.map((a) => ({
    id: a.id,
    id_legado: a.id_legado,
    parceiroId: a.parceiro_id,
    imovelId: a.imovel_id,
    imovelEndereco: a.imoveis.endereco,
    imovelInscricao: a.imoveis.inscricao,
    clienteNome: a.clientes.nome
  }));

  // Se a transação já está presa a uma administração que não está mais
  // "Ativo" (ex.: virou "Locado" depois que essa locação foi criada), mantém
  // ela na lista pra não sumir do formulário ao editar.
  if (transacao.adm_imoveis && !administracoes.some((a) => a.id === transacao.adm_imoveis!.id)) {
    administracoes = [
      {
        id: transacao.adm_imoveis.id,
        id_legado: transacao.adm_imoveis.id_legado,
        parceiroId: transacao.adm_imoveis.parceiro_id,
        imovelId: transacao.adm_imoveis.imovel_id,
        imovelEndereco: transacao.imoveis?.endereco ?? null,
        imovelInscricao: transacao.imoveis?.inscricao ?? null,
        clienteNome: transacao.adm_imoveis.clientes.nome
      },
      ...administracoes
    ];
  }

  const imoveisComAdmAtivaIds = admImoveisAtivos.map((a) => a.imovel_id);

  const proprietarios = transacao.imoveis?.imoveis_proprietarios.map((v) => v.clientes) ?? [];
  const nomesProprietarios = proprietarios.map((c) => c.nome).join(", ");
  const interessados = transacao.transacoes_contrapartes.map((v) => v.clientes);
  const nomesInteressados = interessados.map((c) => c.nome).join(", ");

  const interessadosComParceiro = interessados.map((c) => ({
    id: c.id,
    nome: c.nome,
    id_legado: c.id_legado,
    parceiroId: c.parceiro_id
  }));

  const condicoesIniciais = transacao.condicoes_pagamento.map((c) => ({
    tipo: c.tipo ?? "",
    valor: c.valor != null ? String(c.valor) : "",
    forma_pagamento: c.forma_pagamento ?? "",
    parcelas: c.parcelas != null ? String(c.parcelas) : "",
    momento: c.momento ?? "",
    data_pagamento: dataInput(c.data_pagamento),
    descricao: c.descricao ?? ""
  }));

  const voltarHref = transacao.tipo === "Locação" ? "/transacoes/locacao" : "/transacoes/venda";

  return (
    <div>
      <Topbar />

      <Link href={voltarHref} className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para {transacao.tipo === "Locação" ? "Locação" : "Compra e Venda"}
      </Link>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Transação salva com sucesso.
        </div>
      )}

      <div className="flex items-center gap-2 mb-1">
        <div className="text-sm font-bold text-gray-800">{transacao.imoveis?.endereco ?? "Imóvel sem endereço"}</div>
        <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
          Id: {transacao.id_legado ?? transacao.id}
        </span>
      </div>
      <div className="text-xs text-gray-500 mb-0.5">
        {transacao.tipo}
        {nomesProprietarios && <> · Proprietário{proprietarios.length > 1 ? "s" : ""}: {nomesProprietarios}</>}
        {nomesInteressados && <> · Interessado{interessados.length > 1 ? "s" : ""}: {nomesInteressados}</>}
      </div>
      <div className="text-xs text-gray-400 mb-4">
        Assinatura: {formatData(transacao.data_assinatura)}
        {" · "}Valor: {formatMoeda(transacao.valor_transacao)}
      </div>

      <TransacaoForm
        transacao={transacao}
        lojas={lojas}
        clientes={clientesComParceiro}
        imoveis={imoveisComProprietarios}
        parceiros={parceiros}
        administracoes={administracoes}
        imoveisComAdmAtivaIds={imoveisComAdmAtivaIds}
        interessadosIniciais={interessadosComParceiro}
        condicoesIniciais={condicoesIniciais}
        action={atualizarTransacaoAction}
      />
    </div>
  );
}
