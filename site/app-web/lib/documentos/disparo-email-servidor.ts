import { prisma } from "@/lib/prisma";
import { TODAS_FUNCOES } from "@/lib/parceiros/opcoes";

// Lado do servidor do disparo de e-mail em massa: quem recebe e os números da tela.

// "Desligado" fica de fora: ex-parceiros não devem receber novidades.
export const FUNCOES_DISPARO = TODAS_FUNCOES.filter((f) => f !== "Desligado");

export type OrdemClientes = "recentes" | "antigos" | "aleatorio";
export const ORDENS_CLIENTES: OrdemClientes[] = ["recentes", "antigos", "aleatorio"];

export type FiltroDisparo = {
  funcoes: string[];
  clientes: { quantidade: number; ordem: OrdemClientes } | null;
};

export type Destinatario = { tipo: "parceiro" | "cliente"; nome: string | null; email: string };

// Trava de segurança: um disparo grande demais quase sempre é engano.
export const MAXIMO_DESTINATARIOS = 3000;

const REGEX_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function emailValido(email: string | null | undefined): email is string {
  return !!email && REGEX_EMAIL.test(email.trim());
}

// Resolve os destinatários no servidor (a tela só manda as escolhas): parceiros
// ativos das funções marcadas e a quantidade pedida de clientes, sem repetir
// endereço e sem e-mail inválido.
export async function resolverDestinatarios(filtro: FiltroDisparo): Promise<Destinatario[]> {
  const funcoes = filtro.funcoes.filter((f) => FUNCOES_DISPARO.includes(f));
  const vistos = new Set<string>();
  const lista: Destinatario[] = [];
  const adicionar = (tipo: Destinatario["tipo"], nome: string | null, email: string | null) => {
    if (!emailValido(email)) return;
    const chave = email.trim().toLowerCase();
    if (vistos.has(chave)) return;
    vistos.add(chave);
    lista.push({ tipo, nome: nome?.trim() || null, email: chave });
  };

  if (funcoes.length > 0) {
    const parceiros = await prisma.parceiros.findMany({
      where: { funcao: { in: funcoes }, status_funcao: "Ativo", email: { contains: "@" } },
      orderBy: { nome: "asc" },
      select: { nome: true, email: true }
    });
    for (const p of parceiros) adicionar("parceiro", p.nome, p.email);
  }

  const qtd = filtro.clientes ? Math.max(0, Math.floor(filtro.clientes.quantidade)) : 0;
  if (filtro.clientes && qtd > 0) {
    // busca com folga: endereço repetido ou inválido é descartado depois
    const folga = Math.min(qtd * 2 + 20, MAXIMO_DESTINATARIOS * 2);
    let clientes: { nome: string; email: string | null }[];
    if (filtro.clientes.ordem === "aleatorio") {
      clientes = await prisma.$queryRaw<{ nome: string; email: string | null }[]>`
        SELECT nome, email FROM clientes WHERE email LIKE '%@%' ORDER BY random() LIMIT ${folga}`;
    } else {
      clientes = await prisma.clientes.findMany({
        where: { email: { contains: "@" } },
        orderBy: { created_at: filtro.clientes.ordem === "antigos" ? "asc" : "desc" },
        take: folga,
        select: { nome: true, email: true }
      });
    }
    let adicionados = 0;
    for (const c of clientes) {
      if (adicionados >= qtd) break;
      const antes = lista.length;
      adicionar("cliente", c.nome, c.email);
      if (lista.length > antes) adicionados += 1;
    }
  }
  return lista;
}

export async function carregarDadosDisparo(parceiroId: string) {
  const [porFuncao, clientesDisponiveis, eu, historico] = await Promise.all([
    prisma.parceiros.groupBy({
      by: ["funcao"],
      where: { status_funcao: "Ativo", email: { contains: "@" }, funcao: { in: FUNCOES_DISPARO } },
      _count: { _all: true }
    }),
    prisma.clientes.count({ where: { email: { contains: "@" } } }),
    prisma.parceiros.findUnique({ where: { id: parceiroId }, select: { email: true } }),
    prisma.disparos_email.findMany({
      orderBy: { created_at: "desc" },
      take: 8,
      select: { id: true, assunto: true, total: true, enviados: true, falhas: true, status: true, motivo_pausa: true, created_at: true }
    })
  ]);
  const contagem = new Map(porFuncao.map((g) => [g.funcao, g._count._all]));
  return {
    funcoes: FUNCOES_DISPARO.map((funcao) => ({ funcao, total: contagem.get(funcao) ?? 0 })),
    clientesDisponiveis,
    emailAdmin: eu?.email ?? null,
    historico: historico.map((h) => ({ ...h, created_at: h.created_at.toISOString() }))
  };
}

export type DadosDisparo = Awaited<ReturnType<typeof carregarDadosDisparo>>;
