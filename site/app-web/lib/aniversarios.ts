import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Aniversários para os calendários: Clientes (clientes.data_nascimento) e
// Parceiros (parceiros.data_nascimento) são as únicas fontes de data de
// nascimento do sistema. O calendário do administrativo mostra os dois; o do
// portal mostra só os clientes do próprio corretor.
export type Aniversariante = {
  id: string;
  tipo: "cliente" | "parceiro";
  nome: string;
  /** dia do mês em que cai no mês pedido (29/02 vira 28/02 em ano não bissexto) */
  dia: number;
  /** ano de nascimento, para calcular a idade */
  anoNascimento: number;
};

function nomeCurto(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : p.join(" ");
}

function bissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

type Linha = { id: string; nome: string; nascimento: Date };

function montar(linhas: Linha[], tipo: Aniversariante["tipo"], ano: number, mesIndice: number): Aniversariante[] {
  return linhas.map((l) => {
    const dia = l.nascimento.getUTCDate();
    // 29/02 em ano não bissexto comemora em 28/02
    const diaAjustado = mesIndice === 1 && dia === 29 && !bissexto(ano) ? 28 : dia;
    return { id: l.id, tipo, nome: nomeCurto(l.nome), dia: diaAjustado, anoNascimento: l.nascimento.getUTCFullYear() };
  });
}

// Clientes que fazem aniversário no mês. `parceiroId` limita aos clientes de um
// corretor (portal); `lojas` aplica o filtro de loja do administrativo.
export async function aniversariantesClientes(params: {
  ano: number;
  mesIndice: number;
  parceiroId?: string;
  lojas?: string[];
}): Promise<Aniversariante[]> {
  const mes = params.mesIndice + 1;
  const condicoes: Prisma.Sql[] = [
    Prisma.sql`data_nascimento IS NOT NULL`,
    Prisma.sql`EXTRACT(MONTH FROM data_nascimento) = ${mes}`,
    Prisma.sql`status_cadastro IS DISTINCT FROM 'Arquivado'`
  ];
  if (params.parceiroId) condicoes.push(Prisma.sql`parceiro_id = ${params.parceiroId}::uuid`);
  if (params.lojas) condicoes.push(Prisma.sql`(loja_id IS NULL OR loja_id = ANY(${params.lojas}::uuid[]))`);
  const linhas = await prisma.$queryRaw<Linha[]>(
    Prisma.sql`SELECT id::text AS id, nome, data_nascimento AS nascimento FROM clientes WHERE ${Prisma.join(condicoes, " AND ")} ORDER BY nome`
  );
  return montar(linhas, "cliente", params.ano, params.mesIndice);
}

// Parceiros ativos que fazem aniversário no mês.
export async function aniversariantesParceiros(params: { ano: number; mesIndice: number; lojas?: string[] }): Promise<Aniversariante[]> {
  const mes = params.mesIndice + 1;
  const condicoes: Prisma.Sql[] = [
    Prisma.sql`data_nascimento IS NOT NULL`,
    Prisma.sql`EXTRACT(MONTH FROM data_nascimento) = ${mes}`,
    Prisma.sql`status_funcao = 'Ativo'`
  ];
  if (params.lojas) condicoes.push(Prisma.sql`(loja_id IS NULL OR loja_id = ANY(${params.lojas}::uuid[]))`);
  const linhas = await prisma.$queryRaw<Linha[]>(
    Prisma.sql`SELECT id::text AS id, nome, data_nascimento AS nascimento FROM parceiros WHERE ${Prisma.join(condicoes, " AND ")} ORDER BY nome`
  );
  return montar(linhas, "parceiro", params.ano, params.mesIndice);
}

// "🎂 Maria Souza (35)" — idade que a pessoa completa no ano do calendário.
export function tituloAniversario(a: Aniversariante, ano: number): string {
  const idade = ano - a.anoNascimento;
  return `🎂 ${a.nome}${idade > 0 && idade < 120 ? ` (${idade})` : ""}`;
}

// Quantos cadastros já têm data de nascimento (para avisar o que falta preencher).
export async function coberturaDatasNascimento(params: { parceiroId?: string; incluirParceiros?: boolean }) {
  const [c] = await prisma.$queryRaw<{ total: number; com: number }[]>(
    Prisma.sql`SELECT count(*)::int AS total, count(data_nascimento)::int AS com FROM clientes
      WHERE status_cadastro IS DISTINCT FROM 'Arquivado' ${params.parceiroId ? Prisma.sql`AND parceiro_id = ${params.parceiroId}::uuid` : Prisma.empty}`
  );
  let parceiros: { total: number; com: number } | null = null;
  if (params.incluirParceiros) {
    const [p] = await prisma.$queryRaw<{ total: number; com: number }[]>(
      Prisma.sql`SELECT count(*)::int AS total, count(data_nascimento)::int AS com FROM parceiros WHERE status_funcao = 'Ativo'`
    );
    parceiros = p;
  }
  return { clientes: c, parceiros };
}
