"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAlteracao, requireEdicao } from "@/lib/auth";
import { simular, type EntradaSimulacao, type ResultadoSimulacao } from "@/lib/financiamento/simulacao";
import { carregarParametrosSimulacao } from "@/lib/financiamento/simulacao-servidor";
import { validarValorParametro } from "@/lib/financiamento/simulacao-parametros";

// Simulação habitacional de imóveis usados (Caixa), na etiqueta do Financiamento. Nunca lança erro com mensagem
// técnica: devolve { ok: false, erro } (em produção a mensagem de um erro lançado não chega à tela).

export type RespostaGerarSimulacao =
  | { ok: true; id: string | null; criadoEm: string; entrada: EntradaSimulacao; resultado: ResultadoSimulacao }
  | { ok: false; erro: string };

const numero = (v: unknown): number => (typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")));
const numeroOuNulo = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : numero(v));
const sim = (v: unknown) => v === true || v === "true";

// O que vem do navegador é conferido de novo aqui: tipos, e só os campos que o cálculo usa.
function limparEntrada(bruto: Record<string, unknown>): EntradaSimulacao {
  return {
    valor_compra: numero(bruto.valor_compra),
    valor_avaliacao: numeroOuNulo(bruto.valor_avaliacao),
    municipio: String(bruto.municipio ?? "").trim().slice(0, 80),
    uf: String(bruto.uf ?? "").trim().slice(0, 2).toUpperCase(),
    renda_bruta_familiar: numero(bruto.renda_bruta_familiar),
    data_nascimento_mais_velho: String(bruto.data_nascimento_mais_velho ?? ""),
    sistema_amortizacao: bruto.sistema_amortizacao === "PRICE" ? "PRICE" : "SAC",
    prazo_desejado_meses: numeroOuNulo(bruto.prazo_desejado_meses),
    fgts_3_anos: sim(bruto.fgts_3_anos),
    saldo_fgts: numeroOuNulo(bruto.saldo_fgts),
    possui_imovel_residencial_municipio: sim(bruto.possui_imovel_residencial_municipio),
    possui_financiamento_sfh_ativo: sim(bruto.possui_financiamento_sfh_ativo),
    ja_usou_fgts_em_financiamento: sim(bruto.ja_usou_fgts_em_financiamento),
    cotista_fgts: sim(bruto.cotista_fgts),
    relacionamento_caixa: sim(bruto.relacionamento_caixa)
  };
}

export async function gerarSimulacaoAction(avaliacaoId: string, bruto: Record<string, unknown>): Promise<RespostaGerarSimulacao> {
  try {
    const sessao = await requireEdicao("financiamento");
    const avaliacao = await prisma.avaliacoes.findUnique({ where: { id: avaliacaoId }, select: { id: true, excluido: true } });
    if (!avaliacao || avaliacao.excluido) return { ok: false, erro: "Avaliação não encontrada." };

    const entrada = limparEntrada(bruto);
    const parametros = await carregarParametrosSimulacao();
    const resultado = simular(entrada, parametros);

    // Só vira histórico a simulação que de fato calculou algo; as recusadas (faltou dado, parâmetro ausente...) só avisam na tela.
    if (resultado.status !== "ok") return { ok: true, id: null, criadoEm: new Date().toISOString(), entrada, resultado };

    const criada = await prisma.simulacoes_habitacionais.create({
      data: {
        avaliacao_id: avaliacaoId,
        entrada: entrada as object,
        resultado: resultado as object,
        status: resultado.status,
        criado_por: sessao.parceiroId ?? null
      },
      select: { id: true, created_at: true }
    });
    await logAlteracao({
      entidadeTipo: "avaliacoes",
      entidadeId: avaliacaoId,
      acao: "gerar_simulacao_habitacional",
      dadosDepois: { modalidade: resultado.modalidade, valor_financiado: resultado.valor_financiado, prazo: resultado.prazo_meses }
    }).catch(() => undefined);
    revalidatePath(`/financiamento/${avaliacaoId}/etiqueta`);
    return { ok: true, id: criada.id, criadoEm: criada.created_at.toISOString(), entrada, resultado };
  } catch (erro) {
    // redirect() do requireEdicao precisa subir (acesso negado)
    if (erro && typeof erro === "object" && "digest" in erro && String((erro as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw erro;
    return { ok: false, erro: "Não foi possível gerar a simulação agora. Tente de novo." };
  }
}

export async function salvarParametroSimulacaoAction(chave: string, valor: unknown): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const sessao = await requireEdicao("financiamento");
    const v = validarValorParametro(chave, valor);
    if (!v.ok) return v;
    const existe = await prisma.simulacao_parametros.findUnique({ where: { chave }, select: { chave: true } });
    if (!existe) return { ok: false, erro: "Parâmetro desconhecido." };
    await prisma.simulacao_parametros.update({
      where: { chave },
      data: { valor: v.valor === null ? undefined : (v.valor as object), updated_at: new Date(), updated_by: sessao.parceiroId ?? null, fonte: "Editado no sistema" }
    });
    // Json nulo precisa de tratamento próprio no Prisma (undefined acima manteria o valor antigo)
    if (v.valor === null) await prisma.$executeRaw`update simulacao_parametros set valor = null where chave = ${chave}`;
    await logAlteracao({ entidadeTipo: "simulacao_parametros", entidadeId: null, acao: "editar_parametro_simulacao", dadosDepois: { chave } }).catch(() => undefined);
    revalidatePath("/financiamento/parametros-simulacao");
    return { ok: true };
  } catch (erro) {
    if (erro && typeof erro === "object" && "digest" in erro && String((erro as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw erro;
    return { ok: false, erro: "Não foi possível salvar o parâmetro agora." };
  }
}
