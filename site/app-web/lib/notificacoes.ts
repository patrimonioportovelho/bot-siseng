import { prisma } from "@/lib/prisma";
import { situacaoVencimento } from "@/lib/format";
import { STATUS_AVALIACAO_ATIVOS } from "@/lib/financiamento/opcoes";

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
};

export async function obterNotificacoes(isAdm: boolean): Promise<Notificacao[]> {
  const desde = new Date(Date.now() - DIAS_PARA_NOTIFICAR_CADASTRO * 24 * 60 * 60 * 1000);
  const whereAvaliacoesAtivas = {
    excluido: false,
    status: { in: STATUS_AVALIACAO_ATIVOS },
    data_validade: { not: null }
  };

  const [sac, acessos, avaliacoes, transacoes, administracoes] = await Promise.all([
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
    })
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
      urgente: sit === "vencido"
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

  // Urgente primeiro (precisa de ação), depois mais recente — mesma régua
  // de prioridade usada no card "Aprovados vencendo em 30d" do Financiamento.
  itens.sort((x, y) => {
    if (x.urgente !== y.urgente) return x.urgente ? -1 : 1;
    return y.data.getTime() - x.data.getTime();
  });

  return itens;
}
