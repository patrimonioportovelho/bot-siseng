import { prisma } from "@/lib/prisma";

// Adiciona proprietário(s) extra a um imóvel a partir de um <form> de
// Transação/Administração/Gestão — pedido do usuário: "às vezes o corretor
// deixa alguém para trás, aí o adm precisa adicionar" um co-titular
// (cônjuge, herdeiro etc.) sem precisar sair da tela e ir em Imóveis.
//
// De propósito só ADICIONA (nunca remove nem substitui a lista inteira):
// diferente do editor de components/imovel-form.tsx (que é o dono canônico
// da lista completa), este widget é secundário/embutido em outra tela, e um
// "esqueci de marcar alguém que já estava na lista" aqui apagaria
// silenciosamente um proprietário de verdade. Quem precisar remover um
// proprietário continua indo direto em Imóveis.
export async function sincronizarProprietariosExtra(
  imovelId: string,
  formData: FormData,
  campo = "proprietario_extra_id"
): Promise<void> {
  const ids = formData
    .getAll(campo)
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);
  if (ids.length === 0) return;

  const maiorOrdem = await prisma.imoveis_proprietarios.aggregate({
    where: { imovel_id: imovelId },
    _max: { ordem: true }
  });
  let proximaOrdem = (maiorOrdem._max.ordem ?? -1) + 1;

  await prisma.imoveis_proprietarios.createMany({
    data: ids.map((clienteId) => ({ imovel_id: imovelId, cliente_id: clienteId, ordem: proximaOrdem++ })),
    skipDuplicates: true
  });
}

// Grava o vínculo de cônjuge declarado ao adicionar um proprietário/co-
// titular esquecido (ver components/adicionar-proprietario-imovel.tsx) — o
// widget manda um ou mais pares "clienteNovoId:clienteJaNaListaId" no campo
// `${campo}_conjuge`, um por cliente novo que o admin marcou como cônjuge de
// alguém que já estava na lista. Grava dos dois lados (conjuge_id aponta um
// pro outro) pra qualificacaoConjuntaTexto (lib/documentos/gerar.ts) achar o
// par não importa qual dos dois vier primeiro na lista de partes.
export async function sincronizarVinculosConjuge(formData: FormData, campo = "proprietario_extra_id"): Promise<void> {
  const pares = formData
    .getAll(`${campo}_conjuge`)
    .map((v) => String(v).trim())
    .filter((v) => v.includes(":"))
    .map((v) => {
      const [clienteId, conjugeId] = v.split(":");
      return { clienteId: clienteId?.trim(), conjugeId: conjugeId?.trim() };
    })
    .filter((p): p is { clienteId: string; conjugeId: string } => Boolean(p.clienteId && p.conjugeId));

  if (pares.length === 0) return;

  await prisma.$transaction(
    pares.flatMap((p) => [
      prisma.clientes.update({ where: { id: p.clienteId }, data: { conjuge_id: p.conjugeId } }),
      prisma.clientes.update({ where: { id: p.conjugeId }, data: { conjuge_id: p.clienteId } })
    ])
  );
}
