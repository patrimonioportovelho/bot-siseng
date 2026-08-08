import { prisma } from "@/lib/prisma";
import { apagarImagemPublicacao } from "@/lib/supabase-admin";

// Notícias com mais de 30 dias somem sozinhas toda vez que a tela de
// Configurações é aberta — mesmo padrão do limparErrosAntigos() (ver
// lib/erros.ts). Edital e Checklist NUNCA são apagados automaticamente:
// ficam publicados até alguém desativar ou excluir manualmente (pedido
// explícito do usuário — são conteúdo permanente, diferente de notícia).
export async function limparNoticiasAntigas() {
  const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const antigas = await prisma.publicacoes_site.findMany({
    where: { tipo: "Noticia", publicado_em: { lt: limite } },
    select: { id: true, imagem_url: true }
  });
  if (antigas.length === 0) return;

  // Apaga a imagem do Storage de cada uma antes de excluir o registro, pra
  // não deixar arquivo órfão ocupando espaço (mesmo cuidado de
  // excluirPublicacaoAction em app/configuracoes/actions.ts).
  for (const p of antigas) {
    await apagarImagemPublicacao(p.imagem_url);
  }

  await prisma.publicacoes_site.deleteMany({
    where: { id: { in: antigas.map((p) => p.id) } }
  });
}
