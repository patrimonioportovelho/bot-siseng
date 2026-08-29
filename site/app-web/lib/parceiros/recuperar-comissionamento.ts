import { prisma } from "@/lib/prisma";

// Recuperação de % Proprietário/% Interessado a partir do log de auditoria
// (logs_alteracao) — pedido do usuário (29/08/2026) depois de reportar que
// vários Corretor/Corretor Estagiário estão sem os dois percentuais desde o
// `prisma db push` que apagou os valores antigos (ver comentário completo em
// app/parceiros/actions.ts#salvarComissionamentoLoteAction). Não há backup
// no plano Free do Supabase, mas toda edição de parceiro passa por
// logAlteracao (lib/auth.ts) gravando o registro ANTES e DEPOIS da edição —
// se algum admin mexeu no cadastro desse corretor antes do apagão (mesmo por
// outro motivo), o valor antigo pode estar preservado ali dentro do JSON.
//
// Só busca sugestão pra quem está com o campo vazio HOJE — quem já tem valor
// preenchido nunca é tocado por isso (nem consultado). A sugestão só
// PRÉ-PREENCHE o campo na tela de revisão em lote; nada é salvo sem o
// administrativo clicar em "Salvar tudo".
export type SugestaoComissionamento = {
  proprietario: number | null;
  interessado: number | null;
  fonteProprietario: string | null; // data (dd/mm/aaaa) do log de onde veio
  fonteInteressado: string | null;
};

// Nomes de campo aceitos dentro do JSON do log — porc_compr/porc_vend são os
// nomes ANTIGOS (antes do rename de 16/08/2026), mantidos aqui porque logs
// de auditoria de antes do rename ainda guardam esses nomes.
const CHAVES_PROPRIETARIO = ["porc_proprietario", "porc_compr"];
const CHAVES_INTERESSADO = ["porc_interessado", "porc_vend"];

function numeroValido(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extrairCampo(registro: unknown, chaves: string[]): number | null {
  if (!registro || typeof registro !== "object") return null;
  for (const chave of chaves) {
    const valor = numeroValido((registro as Record<string, unknown>)[chave]);
    if (valor != null) return valor;
  }
  return null;
}

// Busca, pra cada parceiroId com algum campo faltando, o valor mais recente
// encontrado no histórico (dados_depois tem prioridade sobre dados_antes
// dentro do mesmo log, por ser o estado gravado NAQUELE momento; os logs já
// vêm ordenados do mais novo pro mais antigo, então o primeiro achado já é o
// mais recente).
export async function buscarSugestoesComissionamento(
  parceiroIds: string[]
): Promise<Map<string, SugestaoComissionamento>> {
  const resultado = new Map<string, SugestaoComissionamento>();
  if (parceiroIds.length === 0) return resultado;

  const logs = await prisma.logs_alteracao.findMany({
    where: { entidade_tipo: "parceiros", entidade_id: { in: parceiroIds } },
    orderBy: { criado_em: "desc" },
    select: { entidade_id: true, dados_antes: true, dados_depois: true, criado_em: true }
  });

  for (const log of logs) {
    const id = log.entidade_id;
    if (!id) continue;

    const atual = resultado.get(id) ?? {
      proprietario: null,
      interessado: null,
      fonteProprietario: null,
      fonteInteressado: null
    };

    if (atual.proprietario == null) {
      const valor = extrairCampo(log.dados_depois, CHAVES_PROPRIETARIO) ?? extrairCampo(log.dados_antes, CHAVES_PROPRIETARIO);
      if (valor != null) {
        atual.proprietario = valor;
        atual.fonteProprietario = log.criado_em.toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho" });
      }
    }
    if (atual.interessado == null) {
      const valor = extrairCampo(log.dados_depois, CHAVES_INTERESSADO) ?? extrairCampo(log.dados_antes, CHAVES_INTERESSADO);
      if (valor != null) {
        atual.interessado = valor;
        atual.fonteInteressado = log.criado_em.toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho" });
      }
    }

    resultado.set(id, atual);
  }

  return resultado;
}
