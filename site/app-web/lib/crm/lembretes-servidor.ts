import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hojeInputDate } from "@/lib/format";
import { somarDias } from "@/lib/crm/atividades";
import { STATUS_COMPRA_FINALIZADA, STATUS_LOCACAO_ATIVA, STATUS_LOCACAO_SEM_ADM } from "@/lib/clientes/funil";

// Lembretes de datas do relacionamento, calculados na hora (sem tabela nem rotina agendada):
//   aniversário do cliente, aniversário de casamento, "aniversário da casa" (cada ano da compra ou locação)
//   e ganchos com "lembrar em" que a própria pessoa registrou para um cliente que é de outro responsável.
// Aparecem no dia e continuam por mais 2 dias (para o fim de semana não engolir), até alguém registrar um contato.
// Quem pediu para não receber novidades (opt-out) nunca aparece.
export const DIAS_DE_TOLERANCIA = 2;

export type Lembrete = {
  id: string;
  clienteId: string;
  nome: string;
  tipo: "aniversario" | "casamento" | "casa" | "gancho";
  titulo: string;
  detalhe: string;
  data: string; // yyyy-mm-dd em que cai
  diasAtras: number;
  modelo: string | null; // mensagem sugerida
};

type Dia = { data: string; diasAtras: number };

// Em ano que não é bissexto, 29/02 comemora em 28/02.
function diasDaJanela(hoje: string): Map<string, Dia> {
  const out = new Map<string, Dia>();
  for (let i = 0; i <= DIAS_DE_TOLERANCIA; i++) {
    const data = somarDias(hoje, -i);
    const mmdd = data.slice(5);
    out.set(mmdd, { data, diasAtras: i });
    const ano = Number(data.slice(0, 4));
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
    if (mmdd === "02-28" && !bissexto) out.set("02-29", { data, diasAtras: i });
  }
  return out;
}

const quando = (d: Dia) => (d.diasAtras === 0 ? "Hoje" : d.diasAtras === 1 ? "Ontem" : `Há ${d.diasAtras} dias`);

type Linha = { id: string; nome: string; tipo: Lembrete["tipo"]; origem: string; dia: string; extra: string | null };

// `parceiroId` limita aos clientes do corretor (portal); sem ele = administrativo (todos os clientes).
// `autorId` traz também os ganchos que essa pessoa anotou e cujo lembrete está com outro responsável.
// Tudo numa consulta só, porque o sino roda em todas as páginas.
export async function lembretesDeDatas(opcoes: { parceiroId?: string | null; autorId?: string | null }): Promise<Lembrete[]> {
  const hoje = hojeInputDate();
  const janela = diasDaJanela(hoje);
  const dias = Prisma.join([...janela].map(([mmdd, d]) => Prisma.sql`(${mmdd}::text, ${d.data}::date)`));
  const doCorretor = opcoes.parceiroId ? Prisma.sql`AND c.parceiro_id = ${opcoes.parceiroId}::uuid` : Prisma.empty;
  // contrato em que o cliente é o comprador ou o inquilino atual
  const contratoValido = Prisma.sql`t.excluido = false AND t.data_assinatura IS NOT NULL AND (
    (t.tipo = 'Compra e Venda' AND t.status = ANY(${STATUS_COMPRA_FINALIZADA}::text[]))
    OR (t.tipo = 'Locação' AND t.status = ANY(${STATUS_LOCACAO_ATIVA}::text[]))
    OR (t.tipo = 'Locação' AND t.status = ${STATUS_LOCACAO_SEM_ADM} AND t.data_vencimento >= ${hoje}::date))`;
  const ganchos = opcoes.autorId
    ? Prisma.sql`UNION ALL
      SELECT g.cliente_id, 'gancho', g.lembrar_em, j.dia, g.texto FROM crm_ganchos g
        JOIN janela j ON j.dia = g.lembrar_em
        JOIN clientes_atividades a ON a.id = g.atividade_id AND a.feito = false AND a.responsavel_id IS DISTINCT FROM ${opcoes.autorId}::uuid
        WHERE g.por_parceiro_id = ${opcoes.autorId}::uuid`
    : Prisma.empty;

  const linhas = await prisma.$queryRaw<Linha[]>(Prisma.sql`
    WITH janela(mmdd, dia) AS (VALUES ${dias}),
    contratos AS (
      SELECT DISTINCT ON (cliente_id) cliente_id, data_assinatura, tipo FROM (
        SELECT t.cliente_contraparte_id AS cliente_id, t.data_assinatura, t.tipo FROM transacoes t WHERE ${contratoValido}
        UNION ALL
        SELECT tc.cliente_id, t.data_assinatura, t.tipo FROM transacoes_contrapartes tc JOIN transacoes t ON t.id = tc.transacao_id WHERE ${contratoValido}
      ) x ORDER BY cliente_id, data_assinatura DESC
    ),
    datas(cliente_id, tipo, origem, dia, extra) AS (
      SELECT c.id, 'aniversario', c.data_nascimento, j.dia, NULL::text FROM clientes c JOIN janela j ON to_char(c.data_nascimento, 'MM-DD') = j.mmdd
      UNION ALL
      SELECT f.cliente_id, 'casamento', f.casamento_em, j.dia, NULL FROM crm_fichas f JOIN janela j ON to_char(f.casamento_em, 'MM-DD') = j.mmdd
      UNION ALL
      SELECT k.cliente_id, 'casa', k.data_assinatura, j.dia, lower(CASE WHEN k.tipo = 'Locação' THEN 'locação' ELSE 'compra' END)
        FROM contratos k JOIN janela j ON to_char(k.data_assinatura, 'MM-DD') = j.mmdd
      UNION ALL
      -- sem contrato no sistema, vale a data informada na ficha
      SELECT f.cliente_id, 'casa', f.casa_em, j.dia, 'conquista do imóvel' FROM crm_fichas f JOIN janela j ON to_char(f.casa_em, 'MM-DD') = j.mmdd
        WHERE NOT EXISTS (SELECT 1 FROM contratos k WHERE k.cliente_id = f.cliente_id)
      ${ganchos}
    )
    SELECT c.id::text AS id, c.nome, d.tipo, to_char(d.origem, 'YYYY-MM-DD') AS origem, to_char(d.dia, 'YYYY-MM-DD') AS dia, d.extra
    FROM datas d JOIN clientes c ON c.id = d.cliente_id
    WHERE c.status_cadastro IS DISTINCT FROM 'Arquivado' ${doCorretor}
      AND NOT EXISTS (SELECT 1 FROM crm_clientes m WHERE m.cliente_id = c.id AND m.opt_out)
      -- contato feito desde o dia da data: o lembrete some (anotação interna não conta). Porto Velho é UTC-4.
      AND NOT EXISTS (
        SELECT 1 FROM clientes_contatos k WHERE k.cliente_id = c.id AND k.tipo NOT IN ('Nota', 'Transferência')
          AND k.data >= (d.dia::timestamp + interval '4 hours') AT TIME ZONE 'UTC'
      )
    ORDER BY d.dia DESC, c.nome
    LIMIT 120`);

  const lista: Lembrete[] = [];
  for (const l of linhas) {
    const diasAtras = Math.round((Date.parse(hoje) - Date.parse(l.dia)) / 86400000);
    const d = { data: l.dia, diasAtras };
    const anos = Number(l.dia.slice(0, 4)) - Number(l.origem.slice(0, 4));
    // casamento e casa só contam a partir de 1 ano
    if ((l.tipo === "casamento" || l.tipo === "casa") && anos < 1) continue;
    const comum = { clienteId: l.id, nome: l.nome, tipo: l.tipo, data: l.dia, diasAtras };
    if (l.tipo === "aniversario") lista.push({ ...comum, id: `aniv-${l.id}-${l.dia}`, titulo: `🎂 Aniversário — ${l.nome}`, detalhe: `${quando(d)}: mande os parabéns`, modelo: "roteiro_aniversario" });
    else if (l.tipo === "casamento") lista.push({ ...comum, id: `casamento-${l.id}-${l.dia}`, titulo: `💍 Aniversário de casamento — ${l.nome}`, detalhe: `${quando(d)}: ${anos} ano(s)`, modelo: "roteiro_aniversario_casamento" });
    else if (l.tipo === "casa") lista.push({ ...comum, id: `casa-${l.id}-${l.dia}`, titulo: `🏠 Aniversário da casa — ${l.nome}`, detalhe: `${quando(d)}: ${anos} ano(s) da ${l.extra}`, modelo: "roteiro_aniversario_casa" });
    else lista.push({ ...comum, id: `gancho-${l.id}-${l.dia}-${(l.extra ?? "").slice(0, 40)}`, titulo: `💬 Gancho — ${l.nome}`, detalhe: l.extra ?? "", modelo: null });
  }
  return lista;
}
