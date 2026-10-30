import { after } from "next/server";
import { prisma } from "@/lib/prisma";

// Log de auditoria de um movimento de card nos quadros (Manutenção, Gestões,
// Marketing). Roda DEPOIS da resposta (after) para a tela não esperar o
// insert — por isso recebe o id de quem moveu já lido da sessão (cookies não
// estão disponíveis dentro do after).
export function logMovimentoQuadro(params: {
  parceiroId: string | null;
  entidadeTipo: string;
  entidadeId: string;
  antes: unknown;
  depois: unknown;
}) {
  after(async () => {
    await prisma.logs_alteracao
      .create({
        data: {
          parceiro_id: params.parceiroId,
          entidade_tipo: params.entidadeTipo,
          entidade_id: params.entidadeId,
          acao: "editar",
          dados_antes: params.antes as object,
          dados_depois: params.depois as object
        }
      })
      .catch(() => {});
  });
}
