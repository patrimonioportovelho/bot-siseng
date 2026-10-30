import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ManutencaoKanban, type TicketKanban } from "@/components/manutencao-kanban";
import { AtividadesTabs } from "@/components/atividades-tabs";
import { moverColunaAction } from "./actions";
import { lojasSelecionadas } from "@/lib/lojas/filtro";

export const dynamic = "force-dynamic";

// Encerrados (Pago/Encerrado) há mais tempo que isso saem do quadro — a coluna
// só cresce e deixava tudo mais pesado. "ver todos" traz de volta.
const DIAS_ENCERRADOS_NO_QUADRO = 45;

export default async function ManutencaoPage({
  searchParams
}: {
  searchParams: Promise<{ todos?: string }>;
}) {
  const { todos } = await searchParams;
  const mostrarTodos = todos === "1";
  const lojasFiltro = await lojasSelecionadas();
  const agoraMs = Date.now();
  const corte = new Date(agoraMs - DIAS_ENCERRADOS_NO_QUADRO * 86400000);

  // Filtro de Loja (seletor no Topbar) — manutenções não têm loja própria, só
  // através do imóvel vinculado (sempre existe um). Imóvel sem loja definida
  // (cadastro legado) continua aparecendo em qualquer filtro.
  const filtroLoja = { OR: [{ imoveis: { loja_id: { in: lojasFiltro } } }, { imoveis: { loja_id: null } }] };
  const base = { excluido: false, AND: [filtroLoja] };
  const antigoEncerrado = { coluna: "pago", coluna_atualizada_em: { lt: corte } };

  const [tickets, ocultosAntigos] = await Promise.all([
    prisma.manutencoes.findMany({
      where: mostrarTodos ? base : { ...base, NOT: antigoEncerrado },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        titulo: true,
        tipo_servico: true,
        urgencia: true,
        coluna: true,
        coluna_atualizada_em: true,
        updated_at: true,
        chave_posse: true,
        prestador_id: true,
        imoveis: { select: { id: true, id_legado: true, endereco: true } },
        clientes: { select: { nome: true } },
        parceiros: { select: { nome: true } }
      }
    }),
    mostrarTodos ? Promise.resolve(0) : prisma.manutencoes.count({ where: { ...base, ...antigoEncerrado } })
  ]);

  // Só dados simples vão para o quadro (client component).
  const cards: TicketKanban[] = tickets.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    tipo_servico: t.tipo_servico,
    urgencia: t.urgencia,
    coluna: t.coluna,
    desde: (t.coluna_atualizada_em ?? t.updated_at).toISOString(),
    chave_posse: t.chave_posse,
    imovelId: t.imoveis.id,
    imovelIdLegado: t.imoveis.id_legado,
    endereco: t.imoveis.endereco,
    proprietario: t.clientes?.nome ?? null,
    prestadorId: t.prestador_id,
    prestador: t.parceiros?.nome ?? null
  }));

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Manutenção · Administração</div>
        <AtividadesTabs ativo="/manutencao" />
      </div>

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Arraste os cards entre as colunas. Clique em um card para abrir a etiqueta (mensagens de WhatsApp, notas e a ficha completa).
        </p>
        <Link
          href="/manutencao/novo"
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
        >
          + Nova manutenção
        </Link>
      </div>

      <ManutencaoKanban tickets={cards} moverColuna={moverColunaAction} agoraMs={agoraMs} ocultosAntigos={ocultosAntigos} />
    </div>
  );
}
