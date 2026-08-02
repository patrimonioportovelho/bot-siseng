import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

// Filtro de Loja (Porto Velho/Jaru, e futuras lojas) — pedido do usuário em
// 01/08/2026: um seletor único no Topbar (ver components/loja-filtro-botao.tsx)
// que vale pra TODAS as páginas do admin, sem precisar escolher de novo em
// cada tela. Guardado num cookie simples (preferência do navegador, não por
// usuário/sessão) porque hoje não existe nenhum conceito de "loja do admin"
// — todo admin vê tudo, então o filtro é só uma preferência de visualização.
export const COOKIE_LOJA_FILTRO = "sis_loja_filtro";

export type Loja = { id: string; nome: string; cidade: string | null };

export async function listarLojas(): Promise<Loja[]> {
  return prisma.lojas.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, cidade: true }
  });
}

// Lê o cookie e devolve os ids de loja selecionados. Sem cookie (primeira
// visita) ou cookie com todas as lojas marcadas = "sem filtro" de verdade
// (mesmo efeito, mas simplifica: sempre devolvemos a lista completa como
// padrão, e quem usa isso já sabe que "todas selecionadas" equivale a não
// filtrar).
export async function lojasSelecionadas(): Promise<string[]> {
  const todas = await listarLojas();
  const cookieStore = await cookies();
  const bruto = cookieStore.get(COOKIE_LOJA_FILTRO)?.value;
  if (!bruto) return todas.map((l) => l.id);

  const idsValidos = new Set(todas.map((l) => l.id));
  const selecionados = bruto
    .split(",")
    .map((s) => s.trim())
    .filter((id) => idsValidos.has(id));

  // Cookie corrompido/vazio (ex.: todas as lojas foram removidas do cookie,
  // ou os ids não existem mais) — volta pro padrão de mostrar tudo, em vez
  // de esconder tudo silenciosamente.
  return selecionados.length > 0 ? selecionados : todas.map((l) => l.id);
}

// Fragmento de `where` do Prisma pra aplicar o filtro de loja num model que
// tenha uma coluna `loja_id` própria. Cadastros sem loja definida (legado)
// sempre aparecem, em qualquer filtro, até alguém editar e escolher a loja
// — combinado com "OR loja_id null" de propósito.
export function whereLojaFiltro(selecionadas: string[], campo: string = "loja_id") {
  return {
    OR: [{ [campo]: { in: selecionadas } }, { [campo]: null }]
  };
}

// Mesma ideia, mas pra models onde `loja_id` é OBRIGATÓRIO no banco
// (transacoes e adm_imoveis — todo registro já tem uma loja desde sempre,
// nunca fica NULL). Bug encontrado em 02/08/2026: usar whereLojaFiltro (que
// inclui "OR loja_id null") nesses dois models quebrava o Dashboard e as
// listagens de Transações/Administrações em produção — o Prisma rejeita
// `null` como valor de filtro pra uma coluna String obrigatória
// (PrismaClientValidationError: "Argument `loja_id` is missing"), porque o
// tipo gerado pra ela é StringFilter, não StringNullableFilter. Sem o "OR
// null" aqui não tem problema nenhum: não existe (e não pode existir)
// transacao/adm_imovel sem loja pra "vazar" do filtro.
export function whereLojaFiltroObrigatorio(selecionadas: string[], campo: string = "loja_id") {
  return { [campo]: { in: selecionadas } };
}

// Mesma ideia, mas pra `movimentacoes` (usado em várias contas do
// Dashboard/Financeiro) — esse model não tem loja_id próprio, só chega na
// loja através da transação vinculada (transacao_id/transacoes, ambos
// opcionais: despesa/receita geral da imobiliária não tem transação nenhuma
// atrás). Movimentação sem transação vinculada sempre aparece, em qualquer
// filtro — não tem como saber a loja dela mesmo, então não faz sentido
// escondê-la. Só usar quando o `where` da consulta ainda não tiver um `OR`
// próprio (senão essa chave sobrescreve o outro) — nesse caso, envolva os
// dois num `AND`.
export function whereLojaFiltroMovimentacao(selecionadas: string[]) {
  return {
    OR: [{ transacao_id: null }, { transacoes: { loja_id: { in: selecionadas } } }]
  };
}

// Pra models que não têm loja nem transação vinculada, só um parceiro (ex.:
// avaliacoes, solicitacoes_acesso) — usa a loja do PRÓPRIO parceiro
// (parceiros.loja_id) como aproximação. Pedido do usuário em 01/08/2026,
// depois de confirmar que "geralmente o corretor atua numa loja só" — antes
// disso essas telas tinham ficado de fora do filtro por falta de um vínculo
// confiável. Avaliação/solicitação sem parceiro vinculado, ou cujo parceiro
// não tem loja definida, sempre aparece em qualquer filtro.
export function whereLojaFiltroParceiro(selecionadas: string[], campoParceiroId: string = "parceiro_id") {
  return {
    OR: [
      { [campoParceiroId]: null },
      { parceiros: { loja_id: { in: selecionadas } } },
      { parceiros: { loja_id: null } }
    ]
  };
}
