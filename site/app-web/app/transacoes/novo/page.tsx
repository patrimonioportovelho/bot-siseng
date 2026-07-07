import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { TransacaoForm } from "@/components/transacao-form";
import { criarTransacaoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaTransacaoPage({
  searchParams
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const tipoInicial = tipo === "Compra e Venda" ? "Compra e Venda" : "Locação";
  const voltarHref = tipoInicial === "Locação" ? "/transacoes/locacao" : "/transacoes/venda";

  const [lojas, clientes, imoveis, parceiros, admImoveisAtivos] = await Promise.all([
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.clientes.findMany({
      where: { status_cadastro: { not: "Arquivado" } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, id_legado: true, parceiro_id: true }
    }),
    prisma.imoveis.findMany({
      where: { excluido: false },
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
    // Só administrações com status Ativo podem virar uma locação em
    // "Elaboração de Contrato de Locação" — imóvel e proprietário vêm dela.
    prisma.adm_imoveis.findMany({
      where: { status: "Ativo", excluido: false },
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

  const administracoes = admImoveisAtivos.map((a) => ({
    id: a.id,
    id_legado: a.id_legado,
    parceiroId: a.parceiro_id,
    imovelId: a.imovel_id,
    imovelEndereco: a.imoveis.endereco,
    imovelInscricao: a.imoveis.inscricao,
    clienteNome: a.clientes.nome
  }));

  const imoveisComAdmAtivaIds = administracoes.map((a) => a.imovelId);

  return (
    <div>
      <Topbar />

      <Link href={voltarHref} className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para {tipoInicial}
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-4">Nova transação — {tipoInicial}</div>

      <TransacaoForm
        transacao={null}
        lojas={lojas}
        clientes={clientesComParceiro}
        imoveis={imoveisComProprietarios}
        parceiros={parceiros}
        administracoes={administracoes}
        imoveisComAdmAtivaIds={imoveisComAdmAtivaIds}
        interessadosIniciais={[]}
        condicoesIniciais={[]}
        tipoInicial={tipoInicial}
        action={criarTransacaoAction}
      />
    </div>
  );
}
