import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { notificarModulo, type ModuloPush } from "@/lib/push";

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

// Aviso na tela (Web Push) de uma movimentação. `montar` roda DEPOIS da resposta
// (after): pode consultar o banco para o título e devolve null para não avisar.
export function avisarMovimento(
  modulo: ModuloPush,
  atorParceiroId: string | null,
  montar: () => Promise<{ titulo: string; corpo: string; url: string; tag?: string } | null>
) {
  after(async () => {
    try {
      const m = await montar();
      if (m) await notificarModulo({ modulo, atorParceiroId, titulo: m.titulo, corpo: m.corpo, url: m.url, tag: m.tag });
    } catch {
      // aviso nunca derruba a ação
    }
  });
}
