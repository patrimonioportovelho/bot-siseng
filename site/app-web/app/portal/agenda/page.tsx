import Link from "next/link";
import { PortalHeader } from "@/components/portal-header";
import { PortalAgendaCalendario } from "@/components/portal-agenda-calendario";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { formatDataHora, hojeInputDate, hojePortoVelho } from "@/lib/format";
import { TIPO_ATIVIDADE_LABEL as TIPO_ATIVIDADE_LABEL_MANUTENCAO } from "@/lib/manutencao/opcoes";
import { TIPO_ATIVIDADE_LABEL as TIPO_ATIVIDADE_LABEL_GESTAO } from "@/lib/gestoes/opcoes";
import { TIPO_ATIVIDADE_LABEL as TIPO_ATIVIDADE_LABEL_MARKETING, TIPOS_MATERIAL } from "@/lib/marketing/opcoes";
import { BotaoSubmit } from "@/components/botao-submit";
import { ocorrenciasNoIntervalo } from "@/lib/eventos/ocorrencias";
import { podeVerEvento } from "@/lib/eventos/opcoes";
import { criarSolicitacaoAgendaAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Aguardando resposta",
  confirmada: "Confirmada",
  recusada: "Recusada"
};

const STATUS_COR: Record<string, string> = {
  pendente: "bg-[#A9822E]/10 text-[#A9822E] border-[#A9822E]/30",
  confirmada: "bg-green-50 text-green-700 border-green-200",
  recusada: "bg-red-50 text-red-600 border-red-200"
};

function parseMes(mes: string | undefined): { ano: number; mesIndice: number } {
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [ano, m] = mes.split("-").map(Number);
    return { ano, mesIndice: m - 1 };
  }
  const hoje = hojePortoVelho();
  return { ano: hoje.getFullYear(), mesIndice: hoje.getMonth() };
}

// Agenda do corretor — calendário só leitura (editorial do Marketing já
// confirmado + as próprias atividades de Gestões/Manutenções dele) e o
// formulário de "Solicitar atividade", que não agenda nada sozinho: só
// registra o pedido pro setor responder (ver app/marketing/agenda/page.tsx,
// do lado do admin). Pedido do usuário em 09/08/2026.
export default async function PortalAgendaPage({
  searchParams
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const session = await requirePortalSession();
  const { mes } = await searchParams;
  const { ano, mesIndice } = parseMes(mes);

  const inicioMes = new Date(ano, mesIndice, 1);
  const fimMes = new Date(ano, mesIndice + 1, 1);

  const [atividadesMarketing, atividadesGestao, atividadesManutencao, solicitacoes, meusImoveis, parceiro, eventos] = await Promise.all([
    // Editorial do Marketing — qualquer marketing_atividades já É um
    // compromisso com data real (é uma atividade explicitamente agendada,
    // não um prazo solto). Antes isso excluía coluna "recebido"/"aguardando
    // briefing" achando que essas etapas nunca tinham atividade de verdade
    // — só que confirmarSolicitacaoAgendaAction (pedido do corretor pela
    // Agenda) cria a Ordem direto em "recebido" JÁ com uma atividade de
    // captação agendada, e esse filtro escondia exatamente esse caso
    // (bug relatado pelo usuário em 09/08/2026 — "calendário não atualiza").
    prisma.marketing_atividades.findMany({
      where: {
        data: { gte: inicioMes, lt: fimMes },
        marketing_ordens: { excluido: false }
      },
      include: { marketing_ordens: { select: { titulo: true } } }
    }),
    prisma.gestao_atividades.findMany({
      where: { data: { gte: inicioMes, lt: fimMes }, gestoes: { excluido: false, parceiro_id: session.parceiroId } },
      include: { gestoes: { select: { imoveis: { select: { endereco: true, id_legado: true } } } } }
    }),
    prisma.manutencao_atividades.findMany({
      where: {
        data: { gte: inicioMes, lt: fimMes },
        manutencoes: { excluido: false, imoveis: { parceiro_id: session.parceiroId } }
      },
      include: { manutencoes: { select: { titulo: true } } }
    }),
    prisma.solicitacoes_agenda.findMany({
      where: { parceiro_id: session.parceiroId, excluido: false },
      orderBy: { created_at: "desc" },
      take: 20
    }),
    // Imóveis já cadastrados em nome do corretor (contrato de gestão ou de
    // administração) — "cadastro inteligente" da OM, 09/08/2026: ele escolhe
    // um em vez de digitar endereço/valor de novo no pedido.
    prisma.imoveis.findMany({
      where: { parceiro_id: session.parceiroId, excluido: false },
      orderBy: { endereco: "asc" },
      select: { id: true, endereco: true, id_legado: true }
    }),
    prisma.parceiros.findUnique({ where: { id: session.parceiroId }, select: { funcao: true } }),
    // Eventos marcados pra aparecer no portal (portal_corretor) — a
    // visibilidade (quem, pela função, pode ver) é filtrada depois, em JS,
    // porque depende do resultado da consulta do parceiro acima (rodando em
    // paralelo aqui).
    prisma.eventos.findMany({
      where: {
        excluido: false,
        ativo: true,
        portal_corretor: true,
        OR: [
          { recorrencia: "Nenhuma", data_inicio: { gte: inicioMes, lt: fimMes } },
          { recorrencia: { not: "Nenhuma" }, data_inicio: { lt: fimMes }, recorrencia_ate: { gte: inicioMes } }
        ]
      }
    })
  ]);

  const eventosVisiveis = eventos.filter((ev) => podeVerEvento(ev.visibilidade, parceiro?.funcao ?? null));
  const itensEventos = eventosVisiveis.flatMap((ev) =>
    ocorrenciasNoIntervalo(ev.data_inicio, ev.recorrencia, ev.recorrencia_ate, inicioMes, fimMes).map((data) => ({
      id: `evt-${ev.id}-${data.getTime()}`,
      tipoLabel: ev.tipo ?? "Evento",
      titulo: ev.nome,
      data,
      contexto: ev.local ?? "Evento",
      cor: "amarelo" as const
    }))
  );

  const itens = [
    ...itensEventos,
    ...atividadesMarketing.map((a) => ({
      id: `mkt-${a.id}`,
      tipoLabel: TIPO_ATIVIDADE_LABEL_MARKETING[a.tipo] ?? a.tipo,
      titulo: a.titulo,
      data: a.data,
      contexto: a.marketing_ordens.titulo,
      cor: "roxo" as const
    })),
    ...atividadesGestao.map((a) => ({
      id: `gst-${a.id}`,
      tipoLabel: TIPO_ATIVIDADE_LABEL_GESTAO[a.tipo] ?? a.tipo,
      titulo: a.titulo,
      data: a.data,
      contexto: a.gestoes.imoveis.endereco ?? a.gestoes.imoveis.id_legado ?? "Gestão",
      cor: "azul" as const
    })),
    ...atividadesManutencao.map((a) => ({
      id: `man-${a.id}`,
      tipoLabel: TIPO_ATIVIDADE_LABEL_MANUTENCAO[a.tipo] ?? a.tipo,
      titulo: a.titulo,
      data: a.data,
      contexto: a.manutencoes.titulo,
      cor: "verde" as const
    }))
  ];

  // Abrir a Agenda já marca como vista qualquer resposta que ainda não
  // tinha sido aberta — some o destaque/notificação (ver banner em
  // app/portal/page.tsx).
  await prisma.solicitacoes_agenda.updateMany({
    where: { parceiro_id: session.parceiroId, status: { not: "pendente" }, visto_pelo_corretor: false },
    data: { visto_pelo_corretor: true }
  });

  const mesAnterior = new Date(ano, mesIndice - 1, 1);
  const mesSeguinte = new Date(ano, mesIndice + 1, 1);
  const mesAnteriorTexto = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, "0")}`;
  const mesSeguinteTexto = `${mesSeguinte.getFullYear()}-${String(mesSeguinte.getMonth() + 1).padStart(2, "0")}`;
  const hoje = hojePortoVelho();
  const mesHojeTexto = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="text-lg font-bold text-gray-900 mb-1">Agenda</div>
        <p className="text-xs text-gray-500 mb-6">
          Acompanhe as atividades já confirmadas do escritório (Marketing, suas Gestões, Manutenções dos seus
          imóveis e os Eventos abertos pra você). Pra marcar algo novo, use "Solicitar atividade" abaixo — o setor
          responde e confirma o horário.
        </p>

        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex gap-2">
            <Link href={`/portal/agenda?mes=${mesAnteriorTexto}`} className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5">
              ← Anterior
            </Link>
            <Link href={`/portal/agenda?mes=${mesHojeTexto}`} className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5">
              Hoje
            </Link>
            <Link href={`/portal/agenda?mes=${mesSeguinteTexto}`} className="text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5">
              Próximo →
            </Link>
          </div>
          <div className="text-sm font-bold text-gray-800 capitalize">
            {inicioMes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </div>
        </div>

        <PortalAgendaCalendario ano={ano} mesIndice={mesIndice} itens={itens} />

        <div className="grid md:grid-cols-2 gap-4 mt-5">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800 mb-3">Solicitar atividade</div>
            <form action={criarSolicitacaoAgendaAction} className="flex flex-col gap-2">
              <div>
                <label className="text-xs text-gray-600 block mb-1">Setor</label>
                <input
                  disabled
                  value="Marketing"
                  className="text-xs border border-gray-200 bg-gray-50 text-gray-500 rounded-lg px-3 py-1.5 w-full"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Tipo</label>
                <select
                  name="tipo"
                  className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white"
                  defaultValue=""
                >
                  <option value="">—</option>
                  {TIPOS_MATERIAL.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Imóvel (se já tiver cadastro)</label>
                <select
                  name="imovel_id"
                  className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white"
                  defaultValue=""
                >
                  <option value="">— nenhum / imóvel ainda não cadastrado —</option>
                  {meusImoveis.map((im) => (
                    <option key={im.id} value={im.id}>
                      {im.endereco ?? im.id_legado ?? "Imóvel sem endereço"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Título</label>
                <input
                  name="titulo"
                  placeholder="Ex.: Vídeo de captação — Rua das Flores, 123"
                  className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Descrição (opcional)</label>
                <textarea
                  name="descricao"
                  rows={2}
                  className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Data sugerida</label>
                  <input
                    type="date"
                    name="data_sugerida"
                    defaultValue={hojeInputDate()}
                    className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Horário sugerido</label>
                  <input
                    type="time"
                    name="horario_sugerido"
                    defaultValue="09:00"
                    className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary"
                  />
                </div>
              </div>
              <BotaoSubmit className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold mt-1" carregandoTexto="Enviando...">
                Enviar pedido
              </BotaoSubmit>
            </form>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800 mb-3">Meus pedidos</div>
            <div className="flex flex-col gap-2">
              {solicitacoes.map((s) => (
                <div key={s.id} className="border border-gray-100 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-800 truncate">{s.titulo}</span>
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border shrink-0 ${STATUS_COR[s.status] ?? STATUS_COR.pendente}`}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Sugerido: {formatDataHora(s.data_hora_sugerida)}</div>
                  {s.data_hora_confirmada && (
                    <div className="text-[11px] text-green-700 mt-0.5">Confirmado: {formatDataHora(s.data_hora_confirmada)}</div>
                  )}
                  {s.resposta_texto && <div className="text-[11px] text-gray-500 mt-0.5">"{s.resposta_texto}"</div>}
                </div>
              ))}
              {solicitacoes.length === 0 && <p className="text-xs text-gray-400">Nenhum pedido feito ainda.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
