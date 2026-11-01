import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { ManutencaoCalendario } from "@/components/manutencao-calendario";
import { AtividadesTabs } from "@/components/atividades-tabs";
import { hojePortoVelho } from "@/lib/format";
import { TIPO_ATIVIDADE_LABEL as TIPO_ATIVIDADE_LABEL_MANUTENCAO } from "@/lib/manutencao/opcoes";
import { TIPO_ATIVIDADE_LABEL as TIPO_ATIVIDADE_LABEL_GESTAO } from "@/lib/gestoes/opcoes";
import { TIPO_ATIVIDADE_LABEL as TIPO_ATIVIDADE_LABEL_MARKETING } from "@/lib/marketing/opcoes";
import { lojasSelecionadas } from "@/lib/lojas/filtro";
import { ocorrenciasNoIntervalo } from "@/lib/eventos/ocorrencias";
import { aniversariantesClientes, aniversariantesParceiros, coberturaDatasNascimento, tituloAniversario } from "@/lib/aniversarios";

export const dynamic = "force-dynamic";

// Formato do parâmetro "mes" na URL: YYYY-MM (ex.: 2026-07).
function parseMes(mes: string | undefined): { ano: number; mesIndice: number } {
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [ano, m] = mes.split("-").map(Number);
    return { ano, mesIndice: m - 1 };
  }
  const hoje = hojePortoVelho();
  return { ano: hoje.getFullYear(), mesIndice: hoje.getMonth() };
}

// Calendário compartilhado entre Manutenção e Gestões — os dois módulos têm
// quadro (Kanban) separado, mas aqui as atividades agendadas de ambos
// aparecem juntas no mesmo mês, cada uma linkando pra sua ficha de origem.
export default async function ManutencaoCalendarioPage({
  searchParams
}: {
  searchParams: Promise<{ mes?: string; aniv?: string }>;
}) {
  const { mes, aniv } = await searchParams;
  // ?aniv=0 esconde os aniversários (por padrão aparecem)
  const mostrarAniversarios = aniv !== "0";
  const { ano, mesIndice } = parseMes(mes);

  const inicioMes = new Date(ano, mesIndice, 1);
  const fimMes = new Date(ano, mesIndice + 1, 1);
  // Filtro de Loja (seletor no Topbar) — via imóvel vinculado (mesmo padrão
  // de app/manutencao/painel/page.tsx).
  const lojasFiltro = await lojasSelecionadas();
  const filtroLojaImovel = { OR: [{ loja_id: { in: lojasFiltro } }, { loja_id: null }] };

  const [atividadesManutencao, atividadesGestao, atividadesMarketing, eventos, clientesAniv, parceirosAniv, cobertura] = await Promise.all([
    prisma.manutencao_atividades.findMany({
      where: {
        data: { gte: inicioMes, lt: fimMes },
        manutencoes: { excluido: false, imoveis: filtroLojaImovel }
      },
      orderBy: { data: "asc" },
      include: {
        manutencoes: {
          select: { id: true, titulo: true, imoveis: { select: { endereco: true, id_legado: true } } }
        }
      }
    }),
    prisma.gestao_atividades.findMany({
      where: {
        data: { gte: inicioMes, lt: fimMes },
        gestoes: { excluido: false, imoveis: filtroLojaImovel }
      },
      orderBy: { data: "asc" },
      include: {
        gestoes: {
          select: { id: true, imoveis: { select: { endereco: true, id_legado: true } } }
        }
      }
    }),
    // Marketing não tem loja própria (não é vinculado a um imóvel por FK) —
    // aparece pra todo mundo, sem o filtro de loja dos outros dois módulos.
    prisma.marketing_atividades.findMany({
      where: {
        data: { gte: inicioMes, lt: fimMes },
        marketing_ordens: { excluido: false }
      },
      orderBy: { data: "asc" },
      include: {
        marketing_ordens: { select: { id: true, titulo: true } }
      }
    }),
    // Eventos (Fase 2 — calendário compartilhado). Sem loja própria, igual
    // Marketing: aparece pra todo mundo. Traz também os recorrentes que já
    // começaram antes deste mês mas ainda não terminaram (recorrencia_ate),
    // pra ocorrenciasNoIntervalo() calcular quais datas caem dentro do mês.
    prisma.eventos.findMany({
      where: {
        excluido: false,
        ativo: true,
        OR: [
          { recorrencia: "Nenhuma", data_inicio: { gte: inicioMes, lt: fimMes } },
          { recorrencia: { not: "Nenhuma" }, data_inicio: { lt: fimMes }, recorrencia_ate: { gte: inicioMes } }
        ]
      }
    }),
    // Aniversários: todos os Clientes e Parceiros ativos com data de nascimento
    // cadastrada (únicas fontes no sistema), respeitando o filtro de Loja.
    mostrarAniversarios ? aniversariantesClientes({ ano, mesIndice, lojas: lojasFiltro }) : Promise.resolve([]),
    mostrarAniversarios ? aniversariantesParceiros({ ano, mesIndice, lojas: lojasFiltro }) : Promise.resolve([]),
    coberturaDatasNascimento({ incluirParceiros: true })
  ]);

  const agora = hojePortoVelho();

  const itensAniversarios = [...clientesAniv, ...parceirosAniv].map((a) => ({
    id: `aniversario-${a.tipo}-${a.id}`,
    tipoLabel: a.tipo === "cliente" ? "Aniversário · Cliente" : "Aniversário · Parceiro",
    titulo: tituloAniversario(a, ano),
    data: new Date(ano, mesIndice, a.dia),
    feito: false,
    href: a.tipo === "cliente" ? `/clientes/${a.id}` : `/parceiros/${a.id}`,
    contexto: a.tipo === "cliente" ? "Cliente" : "Parceiro",
    aniversario: true
  }));

  // Cada evento vira uma "atividade" por ocorrência dentro do mês — únicos
  // dão 1 item, recorrentes podem dar vários (uma por dia/semana/mês em que
  // caem). "feito" aqui não é uma tarefa marcada como concluída (eventos não
  // têm isso): é só usado pra pintar em verde uma ocorrência que já passou,
  // em vez de vermelho "atrasada" (que soaria como algo pendente que falhou).
  const itensEventos = eventos.flatMap((ev) =>
    ocorrenciasNoIntervalo(ev.data_inicio, ev.recorrencia, ev.recorrencia_ate, inicioMes, fimMes).map((data) => ({
      id: `evento-${ev.id}-${data.getTime()}`,
      tipoLabel: ev.tipo ?? "Evento",
      titulo: ev.nome,
      data,
      feito: data < agora,
      href: `/eventos/${ev.id}`,
      contexto: ev.local ?? "Evento"
    }))
  );

  const atividades = [
    ...itensEventos,
    ...itensAniversarios,
    ...atividadesManutencao.map((a) => ({
      id: `manutencao-${a.id}`,
      tipoLabel: TIPO_ATIVIDADE_LABEL_MANUTENCAO[a.tipo] ?? a.tipo,
      titulo: a.titulo,
      data: a.data,
      feito: a.feito,
      href: `/manutencao/${a.manutencoes.id}`,
      contexto: a.manutencoes.titulo
    })),
    ...atividadesGestao.map((a) => ({
      id: `gestao-${a.id}`,
      tipoLabel: TIPO_ATIVIDADE_LABEL_GESTAO[a.tipo] ?? a.tipo,
      titulo: a.titulo,
      data: a.data,
      feito: a.feito,
      href: `/gestoes/${a.gestoes.id}`,
      contexto: a.gestoes.imoveis.endereco ?? a.gestoes.imoveis.id_legado ?? "Gestão"
    })),
    ...atividadesMarketing.map((a) => ({
      id: `marketing-${a.id}`,
      tipoLabel: TIPO_ATIVIDADE_LABEL_MARKETING[a.tipo] ?? a.tipo,
      titulo: a.titulo,
      data: a.data,
      hora: a.hora,
      feito: a.feito,
      href: `/marketing/${a.marketing_ordens.id}`,
      contexto: a.marketing_ordens.titulo,
      cancelado: a.cancelado,
      canceladoMotivo: a.cancelado_motivo
    }))
  ].sort((a, b) => a.data.getTime() - b.data.getTime());

  const mesAnterior = new Date(ano, mesIndice - 1, 1);
  const mesSeguinte = new Date(ano, mesIndice + 1, 1);
  const mesAnteriorTexto = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, "0")}`;
  const mesSeguinteTexto = `${mesSeguinte.getFullYear()}-${String(mesSeguinte.getMonth() + 1).padStart(2, "0")}`;
  const hoje = hojePortoVelho();
  const mesHojeTexto = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Atividades · Manutenção, Gestões, Marketing, Eventos &amp; Aniversários</div>
        <AtividadesTabs ativo="/manutencao/calendario" />
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-2">
          <Link href={`/manutencao/calendario?mes=${mesAnteriorTexto}${mostrarAniversarios ? "" : "&aniv=0"}`} className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5">
            ← Anterior
          </Link>
          <Link href={`/manutencao/calendario?mes=${mesHojeTexto}${mostrarAniversarios ? "" : "&aniv=0"}`} className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5">
            Hoje
          </Link>
          <Link href={`/manutencao/calendario?mes=${mesSeguinteTexto}${mostrarAniversarios ? "" : "&aniv=0"}`} className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5">
            Próximo →
          </Link>
        </div>
        <div className="text-sm font-bold text-gray-800 capitalize">
          {inicioMes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap mb-3 text-[11px] text-gray-500">
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-pink-100 border border-pink-200 align-middle mr-1" />
          🎂 Aniversários de clientes e parceiros ({clientesAniv.length + parceirosAniv.length} neste mês)
        </span>
        <Link
          href={`/manutencao/calendario?mes=${ano}-${String(mesIndice + 1).padStart(2, "0")}${mostrarAniversarios ? "&aniv=0" : ""}`}
          className="underline text-gray-400 hover:text-gray-700"
        >
          {mostrarAniversarios ? "ocultar aniversários" : "mostrar aniversários"}
        </Link>
      </div>

      <ManutencaoCalendario ano={ano} mesIndice={mesIndice} atividades={atividades} />

      <p className="text-[11px] text-gray-400 mt-3">
        Só aparece quem tem data de nascimento no cadastro: {cobertura.clientes.com} de {cobertura.clientes.total} clientes e{" "}
        {cobertura.parceiros?.com ?? 0} de {cobertura.parceiros?.total ?? 0} parceiros ativos. Para incluir alguém, preencha a data de
        nascimento na ficha.
      </p>
    </div>
  );
}
