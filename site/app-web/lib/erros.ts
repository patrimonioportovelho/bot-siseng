import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

// Traduz erros comuns de banco (constraint de check, unique, foreign key) para
// uma mensagem que faz sentido pra quem está preenchendo o formulário, e
// grava cada ocorrência em logs_erro — antes disso, um erro de salvamento só
// aparecia na tela na hora (via app/error.tsx) e sumia; agora dá pra consultar
// depois em Configurações > Erros de cadastro.
//
// Uso: dentro de um try/catch de Server Action,
//   catch (erro) { await registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar", erro }); }
export async function registrarEJogarErro(params: {
  entidadeTipo: string;
  entidadeId?: string | null;
  acao: string;
  erro: unknown;
}): Promise<never> {
  const { mensagem, tecnica } = traduzirErro(params.erro);

  try {
    const session = await getAdminSession();
    await prisma.logs_erro.create({
      data: {
        parceiro_id: session?.parceiroId ?? null,
        entidade_tipo: params.entidadeTipo,
        entidade_id: params.entidadeId ?? null,
        acao: params.acao,
        mensagem,
        mensagem_tecnica: tecnica
      }
    });
  } catch {
    // Se até o registro do erro falhar, não deixa isso mascarar o erro original.
  }

  throw new Error(mensagem);
}

function traduzirErro(erro: unknown): { mensagem: string; tecnica: string } {
  const tecnica = erro instanceof Error ? erro.message : String(erro);

  if (erro && typeof erro === "object" && "code" in erro) {
    const code = (erro as { code?: string }).code;
    const meta = (erro as { meta?: { target?: string[] | string; column?: string } }).meta;

    // P2002 — unique constraint (ex.: id_legado duplicado).
    if (code === "P2002") {
      const campo = Array.isArray(meta?.target) ? meta?.target.join(", ") : meta?.target;
      return {
        mensagem: campo
          ? `Já existe um cadastro com esse valor em "${campo}".`
          : "Já existe um cadastro com esse valor.",
        tecnica
      };
    }

    // P2003 — foreign key constraint (ex.: parceiro/loja/banco selecionado não existe mais).
    if (code === "P2003") {
      return {
        mensagem:
          "Um dos itens selecionados (ex.: parceiro, loja ou banco) não foi encontrado. Atualize a página e tente de novo.",
        tecnica
      };
    }

    // P2004 — constraint genérica do banco (é o que aparece pra um CHECK
    // constraint rejeitando um valor fora da lista permitida).
    if (code === "P2004") {
      return {
        mensagem:
          "Um dos campos preenchidos tem um valor que o sistema não aceita. Confira os campos com lista de opções (ex.: sexo, estado civil, categoria de profissão) e tente de novo.",
        tecnica
      };
    }
  }

  return {
    mensagem: "Não foi possível salvar. Tente novamente ou avise o suporte se o erro continuar.",
    tecnica
  };
}
