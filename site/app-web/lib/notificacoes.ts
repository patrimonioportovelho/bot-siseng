import { prisma } from "@/lib/prisma";
import { situacaoVencimento, hojePortoVelho } from "@/lib/format";
import { STATUS_AVALIACAO_ATIVOS } from "@/lib/financiamento/opcoes";
import { slaDaOrdem, labelColuna as labelColunaMarketing } from "@/lib/marketing/opcoes";
import { proximaOcorrencia } from "@/lib/eventos/ocorrencias";
import { podeVerEvento } from "@/lib/eventos/opcoes";

// Sino de notificações do administrativo (Topbar) — pedido do usuário em
// 08/08/2026. Junta tudo que precisa de atenção em um lugar só, sem
// precisar abrir cada tela pra descobrir se tem algo novo. Só no
// administrativo por enquanto (Topbar não é usado no portal do corretor).
//
// Não guarda nada em banco (sem tabela de "notificações" nem "lido/não
// lido"): cada item é calculado na hora a partir do dado que já existe —
// mesma filosofia do selo "Novo" (lib/novo.ts) e do limparErrosAntigos
// (lib/erros.ts). Assim que a mensagem SAC é resolvida, a solicitação é
// decidida, a avaliação é renovada/encerrada ou os 3 dias de "novo"
// passam, o item some sozinho — não precisa marcar como lido em lugar
// nenhum.
const DIAS_ALERTA_VALIDADE_AVALIACAO = 30;
// Mesma janela de 3 dias usada pelo selo "Novo" nas listagens (ver
// lib/novo.ts) — mantém os dois avisos ("Novo" na linha e notificação no
// sino) consistentes entre si.
const DIAS_PARA_NOTIFICAR_CADASTRO = 3;
const LIMITE_POR_GRUPO = 30;

export type Notificacao = {
  id: string;
  titulo: string;
  detalhe: string;
  href: string;
  data: Date;
  // "urgente" pinta o item de vermelho no sino — reservado pro que precisa
  // de ação (mensagem SAC nova, acesso pendente, avaliação já vencida).
  // Avaliação vencendo e cadastro novo são só aviso (âmbar/neutro).
  urgente: boolean;
  // true quando `data` vem de uma coluna @db.Date (data_inicio de evento,
  // data_validade de avaliação) — data pura, meia-noite UTC, sem horário de
  // verdade. Achado da auditoria de 30/08/2026: o rodapé do sino formatava
  // essas datas com timeZone "America/Porto_Velho", jogando meia-noite UTC
  // pro dia anterior às 20h (off-by-one) — as outras categorias (criado_em/
  // created_at, @db.Timestamptz de verdade) continuam formatadas com
  // horário local normalmente. Ver formatDataHora em notificacoes-sino.tsx.
  apenasData?: boolean;
};

type EventoParaLembrete = {
  id: string;
  nome: string;
  local: string | null;
  horario_inicio: string | null;
  data_inicio: Date;
  recorrencia: string;
  recorrencia_ate: Date | null;
  lembretes_dias_antes: number[];
};

// Lembrete de evento no sino (Fase 4, pedido do usuário 10/08/2026: "quero
// criar notificações pra lembrar eles, por exemplo 5 dias antes ou 2 dias
// antes, quantas vezes eu quiser"). Continua aparecendo em qualquer dia
// dentro da janela (do maior "dias antes" configurado até o dia do evento)
// em vez de só no dia exato — ninguém perde o aviso por não abrir o sistema
// naquele dia específico. Fica vermelho (urgente) a partir do MENOR "dias
// antes" configurado (ex.: [5, 2] — aviso normal a partir de 5 dias, vira
// urgente a partir de 2). Evento recorrente usa a PRÓXIMA ocorrência
// (proximaOcorrencia), não a data_inicio original.
function lembreteDeEvento(ev: EventoParaLembrete, hoje: Date, href: string): Notificacao | null {
  if (ev.lembretes_dias_antes.length === 0) return null;
  const proxima = proximaOcorrencia(ev.data_inicio, ev.recorrencia, ev.recorrencia_ate, hoje);
  if (!proxima) return null;

  const diasParaEvento = Math.round((proxima.getTime() - hoje.getTime()) / 86400000);
  const maiorLimite = Math.max(...ev.lembretes_dias_antes);
  if (diasParaEvento < 0 || diasParaEvento > maiorLimite) return null;

  const menorLimite = Math.min(...ev.lembretes_dias_antes);
  const dataTexto = proxima.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });

  return {
    id: `evento-${ev.id}-${proxima.toISOString().slice(0, 10)}`,
    titulo:
      diasParaEvento === 0
        ? `Evento hoje — ${ev.nome}`
        : `Evento em ${diasParaEvento} dia${diasParaEvento > 1 ? "s" : ""} — ${ev.nome}`,
    detalhe: [dataTexto, ev.horario_inicio, ev.local].filter(Boolean).join(" · "),
    href,
    data: proxima,
    urgente: diasParaEvento <= menorLimite,
    apenasData: true
  };
}

// Dispensar notificação — a Server Action em si mora em
// lib/notificacoes-actions.ts (arquivo próprio com "use server" no topo).
// Movida daqui em 30/08/2026: "use server" inline dentro de uma função neste
// módulo quebrava o build no Vercel, porque este arquivo é importado por um
// Client Component (components/notificacoes-sino.tsx) e o Next.js não
// permite essa combinação.
async function buscarIdsDispensados(parceiroId: string | null): Promise<Set<string>> {
  if (!parceiroId) return new Set();
  const linhas = await prisma.notificacoes_dispensadas.findMany({
    where: { parceiro_id: parceiroId },
    select: { notificacao_id: true }
  });
  return new Set(linhas.map((l) => l.notificacao_id));
}

export async function obterNotificacoes(isAdm: boolean, parceiroId: string | null = null): Promise<Notificacao[]> {
  const desde = new Date(Date.now() - DIAS_PARA_NOTIFICAR_CADASTRO * 24 * 60 * 60 * 1000);
  const whereAvaliacoesAtivas = {
    excluido: false,
    status: { in: STATUS_AVALIACAO_ATIVOS },
    data_validade: { not: null }
  };

  const [sac, acessos, avaliacoes, transacoes, administracoes, ordensMarketing, eventosComLembrete] = await Promise.all([
    // Mensagens do SAC e solicitações de acesso só entram pra quem também
    // vê essas seções em Configurações (isAdm) — senão o sino levaria pra
    // um link que a pessoa não consegue ver.
    isAdm
      ? prisma.mensagens_sac.findMany({
          where: { status: "Novo" },
          orderBy: { criado_em: "desc" },
          take: LIMITE_POR_GRUPO
        })
      : Promise.resolve([]),
    isAdm
      ? prisma.solicitacoes_acesso.findMany({
          where: { status: "pendente" },
          orderBy: { criado_em: "asc" },
          take: LIMITE_POR_GRUPO,
          include: { parceiros_solicitacoes_acesso_parceiro_idToparceiros: { select: { nome: true } } }
        })
      : Promise.resolve([]),
    prisma.avaliacoes.findMany({
      // "where" precisa ficar numa variável separada (não literal direto na
      // chamada) — mesmo contorno já usado em app/financiamento/page.tsx: o
      // cliente Prisma gerado neste sandbox está desatualizado em relação ao
      // schema.prisma (falta rede pra "prisma generate" aqui), então
      // "excluido" não aparece no tipo avaliacoesWhereInput e o TypeScript
      // rejeitaria um literal com essa propriedade — passando por variável,
      // a checagem de propriedade excedente não se aplica.
      where: whereAvaliacoesAtivas,
      orderBy: { data_validade: "asc" },
      take: 200,
      include: { clientes: { select: { nome: true } } }
    }),
    prisma.transacoes.findMany({
      where: { excluido: false, created_at: { gte: desde } },
      orderBy: { created_at: "desc" },
      take: LIMITE_POR_GRUPO,
      include: { imoveis: { select: { endereco: true } } }
    }),
    prisma.adm_imoveis.findMany({
      where: { excluido: false, created_at: { gte: desde } },
      orderBy: { created_at: "desc" },
      take: LIMITE_POR_GRUPO,
      include: { imoveis: { select: { endereco: true } } }
    }),
    // Marketing atrasado (Fase 4, 09/08/2026) — mesma regra do SAC/acessos
    // (só entra pra quem vê o módulo). Traz todas as Ordens ainda em
    // produção (fora publicado/resultados, que não têm SLA); o filtro por
    // atraso de verdade (slaDaOrdem) é feito depois em JS, porque depende do
    // tipo de material + coluna_atualizada_em juntos, não dá pra expressar
    // num único where do Prisma.
    isAdm
      ? prisma.marketing_ordens.findMany({
          where: { excluido: false, coluna: { notIn: ["publicado", "resultados"] } },
          select: { id: true, id_legado: true, titulo: true, coluna: true, tipo: true, coluna_atualizada_em: true }
        })
      : Promise.resolve([]),
    // Lembrete de evento (Fase 4, 10/08/2026) — admin vê de TODOS os eventos
    // ativos com lembrete configurado, não só os abertos ao Portal (o admin
    // administra o evento inteiro, independente de quem mais o vê). O filtro
    // por "tem lembrete configurado" é feito em JS (lembreteDeEvento), não
    // dá pra expressar "array não vazio" de forma portátil no where.
    isAdm
      ? prisma.eventos.findMany({
          where: { excluido: false, ativo: true },
          select: {
            id: true,
            nome: true,
            local: true,
            horario_inicio: true,
            data_inicio: true,
            recorrencia: true,
            recorrencia_ate: true,
            lembretes_dias_antes: true
          },
          take: LIMITE_POR_GRUPO
        })
      : Promise.resolve([])
  ]);

  const itens: Notificacao[] = [];

  for (const m of sac) {
    itens.push({
      id: `sac-${m.id}`,
      titulo: `Nova mensagem do SAC — ${m.nome}`,
      detalhe: m.assunto || m.mensagem.slice(0, 80),
      href: "/configuracoes",
      data: m.criado_em,
      urgente: true
    });
  }

  for (const s of acessos) {
    itens.push({
      id: `acesso-${s.id}`,
      titulo: `Solicitação de acesso — ${s.parceiros_solicitacoes_acesso_parceiro_idToparceiros.nome}`,
      detalhe: s.email_informado ?? "sem e-mail informado",
      href: "/configuracoes",
      data: s.criado_em,
      urgente: true
    });
  }

  for (const a of avaliacoes) {
    const sit = situacaoVencimento(a.data_validade, false, DIAS_ALERTA_VALIDADE_AVALIACAO);
    if (sit !== "alerta" && sit !== "vencido") continue;
    itens.push({
      id: `avaliacao-${a.id}`,
      titulo: `Avaliação ${sit === "vencido" ? "vencida" : "vencendo"} — ${a.clientes?.nome ?? "sem cliente"}`,
      detalhe: a.id_legado ?? "",
      href: `/financiamento/${a.id}`,
      data: a.data_validade!,
      urgente: sit === "vencido",
      apenasData: true
    });
  }

  for (const t of transacoes) {
    itens.push({
      id: `transacao-${t.id}`,
      titulo: `Novo cadastro de ${t.tipo} — ${t.imoveis?.endereco ?? "sem endereço"}`,
      detalhe: t.id_legado ?? "",
      href: `/transacoes/${t.id}`,
      data: t.created_at,
      urgente: false
    });
  }

  for (const ad of administracoes) {
    itens.push({
      id: `administracao-${ad.id}`,
      titulo: `Nova administração — ${ad.imoveis?.endereco ?? "sem endereço"}`,
      detalhe: ad.id_legado ?? "",
      href: `/administracoes/${ad.id}`,
      data: ad.created_at,
      urgente: false
    });
  }

  // Marketing atrasado — 5ª categoria (Fase 4, 09/08/2026). Só entra pra
  // quem também vê o módulo (isAdm), mesma regra do SAC/acessos.
  if (isAdm) {
    for (const o of ordensMarketing) {
      const sla = slaDaOrdem(o.coluna, o.tipo, o.coluna_atualizada_em);
      if (!sla?.atrasado || !o.coluna_atualizada_em) continue;
      itens.push({
        id: `marketing-${o.id}`,
        titulo: `Marketing atrasado — ${o.titulo}`,
        detalhe: `${labelColunaMarketing(o.coluna)} · ${o.id_legado ?? ""}`,
        href: `/marketing/${o.id}`,
        data: o.coluna_atualizada_em,
        urgente: true
      });
    }
  }

  // Lembrete de evento — 6ª categoria (Fase 4, 10/08/2026). Só entra pra
  // quem também administra eventos (isAdm), mesma regra das demais
  // categorias exclusivas do admin.
  if (isAdm) {
    const hoje = hojePortoVelho();
    for (const ev of eventosComLembrete) {
      const item = lembreteDeEvento(ev, hoje, `/eventos/${ev.id}`);
      if (item) itens.push(item);
    }
  }

  // Notificações dispensadas (pedido do usuário 30/08/2026) — some da lista
  // antes de ordenar, igual a qualquer outro item que deixou de existir.
  const dispensados = await buscarIdsDispensados(parceiroId);
  const itensVisiveis = dispensados.size > 0 ? itens.filter((i) => !dispensados.has(i.id)) : itens;

  // Urgente primeiro (precisa de ação), depois mais recente — mesma régua
  // de prioridade usada no card "Aprovados vencendo em 30d" do Financiamento.
  itensVisiveis.sort((x, y) => {
    if (x.urgente !== y.urgente) return x.urgente ? -1 : 1;
    return y.data.getTime() - x.data.getTime();
  });

  return itensVisiveis;
}

// Mesmo cálculo de lembrete de evento (ver lembreteDeEvento acima), mas pro
// Portal do Corretor — pedido do usuário 10/08/2026: "que ative o sino no
// sistema do corretor". Só considera evento aberto ao Portal
// (portal_corretor) e que esse corretor específico pode ver (mesma regra de
// elegibilidade de app/portal/eventos/page.tsx — podeVerEvento).
export async function obterNotificacoesPortal(funcaoDoParceiro: string | null, parceiroId: string): Promise<Notificacao[]> {
  const eventos = await prisma.eventos.findMany({
    where: { excluido: false, ativo: true, portal_corretor: true },
    select: {
      id: true,
      nome: true,
      local: true,
      horario_inicio: true,
      data_inicio: true,
      recorrencia: true,
      recorrencia_ate: true,
      lembretes_dias_antes: true,
      visibilidade: true
    },
    // Teto de segurança pra não estourar sem limite — 500 é bem mais folgado
    // que qualquer volume real de eventos ativos hoje (achado "menor" da
    // auditoria de 30/08/2026: estava em 100).
    take: 500
  });

  const hoje = hojePortoVelho();
  const itens: Notificacao[] = [];
  for (const ev of eventos) {
    if (!podeVerEvento(ev.visibilidade, funcaoDoParceiro)) continue;
    const item = lembreteDeEvento(ev, hoje, "/portal/eventos");
    if (item) itens.push(item);
  }

  const dispensados = await buscarIdsDispensados(parceiroId);
  const itensVisiveis = dispensados.size > 0 ? itens.filter((i) => !dispensados.has(i.id)) : itens;

  itensVisiveis.sort((x, y) => {
    if (x.urgente !== y.urgente) return x.urgente ? -1 : 1;
    return y.data.getTime() - x.data.getTime();
  });

  return itensVisiveis;
}
