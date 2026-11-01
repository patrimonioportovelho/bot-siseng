import { prisma } from "@/lib/prisma";
import { hojePortoVelho } from "@/lib/format";
import { TIPO_ATIVIDADE_LABEL as TIPO_ATIVIDADE_LABEL_MANUTENCAO } from "@/lib/manutencao/opcoes";
import { TIPO_ATIVIDADE_LABEL as TIPO_ATIVIDADE_LABEL_GESTAO } from "@/lib/gestoes/opcoes";
import { TIPO_ATIVIDADE_LABEL as TIPO_ATIVIDADE_LABEL_MARKETING } from "@/lib/marketing/opcoes";
import { ocorrenciasNoIntervalo } from "@/lib/eventos/ocorrencias";
import { aniversariantesClientes, aniversariantesParceiros, tituloAniversario } from "@/lib/aniversarios";

// Item do calendário compartilhado (Manutenção, Gestões, Marketing, Eventos e
// Aniversários) já pronto para ir ao navegador: datas como "yyyy-mm-dd" (dia de
// calendário, sem fuso), para a tela montar a data local sem trocar de dia.
export type ItemCalendario = {
  id: string;
  tipoLabel: string;
  titulo: string;
  data: string;
  hora?: string | null;
  feito: boolean;
  href: string;
  contexto: string;
  cancelado?: boolean;
  canceladoMotivo?: string | null;
  aniversario?: boolean;
};

const ymdDb = (d: Date) => d.toISOString().slice(0, 10); // colunas @db.Date (meia-noite UTC)
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Tudo que cai no mês pedido. Sempre inclui os aniversários (a tela liga/desliga
// sem nova consulta); respeita o filtro de Loja.
export async function itensDoMes(params: { ano: number; mesIndice: number; lojas: string[] }): Promise<ItemCalendario[]> {
  const { ano, mesIndice, lojas } = params;
  const inicioMes = new Date(ano, mesIndice, 1);
  const fimMes = new Date(ano, mesIndice + 1, 1);
  // Filtro de Loja — via imóvel vinculado (mesmo padrão de app/manutencao/painel/page.tsx).
  const filtroLojaImovel = { OR: [{ loja_id: { in: lojas } }, { loja_id: null }] };

  const [atividadesManutencao, atividadesGestao, atividadesMarketing, eventos, clientesAniv, parceirosAniv] = await Promise.all([
    prisma.manutencao_atividades.findMany({
      where: { data: { gte: inicioMes, lt: fimMes }, manutencoes: { excluido: false, imoveis: filtroLojaImovel } },
      orderBy: { data: "asc" },
      include: { manutencoes: { select: { id: true, titulo: true } } }
    }),
    prisma.gestao_atividades.findMany({
      where: { data: { gte: inicioMes, lt: fimMes }, gestoes: { excluido: false, imoveis: filtroLojaImovel } },
      orderBy: { data: "asc" },
      include: { gestoes: { select: { id: true, imoveis: { select: { endereco: true, id_legado: true } } } } }
    }),
    // Marketing não tem loja própria — aparece para todo mundo.
    prisma.marketing_atividades.findMany({
      where: { data: { gte: inicioMes, lt: fimMes }, marketing_ordens: { excluido: false } },
      orderBy: { data: "asc" },
      include: { marketing_ordens: { select: { id: true, titulo: true } } }
    }),
    // Eventos, inclusive os recorrentes que começaram antes do mês e ainda não terminaram.
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
    aniversariantesClientes({ ano, mesIndice, lojas }),
    aniversariantesParceiros({ ano, mesIndice, lojas })
  ]);

  const agora = hojePortoVelho();

  // Cada evento vira um item por ocorrência dentro do mês; "feito" só pinta de
  // verde o que já passou (evento não tem "concluir").
  const itensEventos: ItemCalendario[] = eventos.flatMap((ev) =>
    ocorrenciasNoIntervalo(ev.data_inicio, ev.recorrencia, ev.recorrencia_ate, inicioMes, fimMes).map((data) => ({
      id: `evento-${ev.id}-${data.getTime()}`,
      tipoLabel: ev.tipo ?? "Evento",
      titulo: ev.nome,
      data: ymdLocal(data),
      feito: data < agora,
      href: `/eventos/${ev.id}`,
      contexto: ev.local ?? "Evento"
    }))
  );

  const itensAniversarios: ItemCalendario[] = [...clientesAniv, ...parceirosAniv].map((a) => ({
    id: `aniversario-${a.tipo}-${a.id}`,
    tipoLabel: a.tipo === "cliente" ? "Aniversário · Cliente" : "Aniversário · Parceiro",
    titulo: tituloAniversario(a, ano),
    data: `${ano}-${String(mesIndice + 1).padStart(2, "0")}-${String(a.dia).padStart(2, "0")}`,
    feito: false,
    href: a.tipo === "cliente" ? `/clientes/${a.id}` : `/parceiros/${a.id}`,
    contexto: a.tipo === "cliente" ? "Cliente" : "Parceiro",
    aniversario: true
  }));

  return [
    ...itensEventos,
    ...itensAniversarios,
    ...atividadesManutencao.map((a) => ({
      id: `manutencao-${a.id}`,
      tipoLabel: TIPO_ATIVIDADE_LABEL_MANUTENCAO[a.tipo] ?? a.tipo,
      titulo: a.titulo,
      data: ymdDb(a.data),
      feito: a.feito,
      href: `/manutencao/${a.manutencoes.id}/etiqueta`,
      contexto: a.manutencoes.titulo
    })),
    ...atividadesGestao.map((a) => ({
      id: `gestao-${a.id}`,
      tipoLabel: TIPO_ATIVIDADE_LABEL_GESTAO[a.tipo] ?? a.tipo,
      titulo: a.titulo,
      data: ymdDb(a.data),
      feito: a.feito,
      href: `/gestoes/${a.gestoes.id}`,
      contexto: a.gestoes.imoveis.endereco ?? a.gestoes.imoveis.id_legado ?? "Gestão"
    })),
    ...atividadesMarketing.map((a) => ({
      id: `marketing-${a.id}`,
      tipoLabel: TIPO_ATIVIDADE_LABEL_MARKETING[a.tipo] ?? a.tipo,
      titulo: a.titulo,
      data: ymdDb(a.data),
      hora: a.hora,
      feito: a.feito,
      href: `/marketing/${a.marketing_ordens.id}`,
      contexto: a.marketing_ordens.titulo,
      cancelado: a.cancelado,
      canceladoMotivo: a.cancelado_motivo
    }))
  ].sort((a, b) => a.data.localeCompare(b.data));
}
