"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { registrarEJogarErro } from "@/lib/erros";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

// Cadastro de Empreendimento (Fase 5a, 09/08/2026) — Notion "Empreendimentos".
// Cadastro à parte, opcional: uma Ordem de Marketing pode continuar usando
// só o campo de texto livre (marketing_ordens.empreendimento) quando não
// houver um cadastro — ver app/marketing/actions.ts.
export async function criarEmpreendimentoAction(formData: FormData) {
  await requireAdminSession();

  const nome = texto(formData, "nome");
  if (!nome) throw new Error("Nome do empreendimento é obrigatório.");

  const criado = await prisma.marketing_empreendimentos
    .create({
      data: {
        nome,
        construtora: texto(formData, "construtora"),
        categoria: texto(formData, "categoria"),
        diferenciais: texto(formData, "diferenciais"),
        publico_alvo: texto(formData, "publico_alvo"),
        faixa_preco: texto(formData, "faixa_preco"),
        localizacao: texto(formData, "localizacao"),
        data_lancamento: data(formData, "data_lancamento"),
        cta_principal: texto(formData, "cta_principal"),
        objecoes_principais: texto(formData, "objecoes_principais"),
        promessa_central: texto(formData, "promessa_central"),
        link_materiais: texto(formData, "link_materiais"),
        responsavel_parceiro_id: texto(formData, "responsavel_parceiro_id"),
        status: texto(formData, "status") ?? "Ativo"
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_empreendimentos", acao: "criar", erro }));

  await logAlteracao({ entidadeTipo: "marketing_empreendimentos", entidadeId: criado.id, acao: "criar", dadosDepois: criado });

  revalidatePath("/marketing/empreendimentos");
  redirect(`/marketing/empreendimentos/${criado.id}?salvo=1`);
}

export async function atualizarEmpreendimentoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "empreendimentoId");
  if (!id) throw new Error("Empreendimento inválido.");

  const nome = texto(formData, "nome");
  if (!nome) throw new Error("Nome do empreendimento é obrigatório.");

  const antes = await prisma.marketing_empreendimentos.findUnique({ where: { id } });
  if (!antes) throw new Error("Empreendimento não encontrado.");

  const depois = await prisma.marketing_empreendimentos
    .update({
      where: { id },
      data: {
        nome,
        construtora: texto(formData, "construtora"),
        categoria: texto(formData, "categoria"),
        diferenciais: texto(formData, "diferenciais"),
        publico_alvo: texto(formData, "publico_alvo"),
        faixa_preco: texto(formData, "faixa_preco"),
        localizacao: texto(formData, "localizacao"),
        data_lancamento: data(formData, "data_lancamento"),
        cta_principal: texto(formData, "cta_principal"),
        objecoes_principais: texto(formData, "objecoes_principais"),
        promessa_central: texto(formData, "promessa_central"),
        link_materiais: texto(formData, "link_materiais"),
        responsavel_parceiro_id: texto(formData, "responsavel_parceiro_id"),
        status: texto(formData, "status") ?? "Ativo",
        updated_at: new Date()
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_empreendimentos", entidadeId: id, acao: "editar", erro }));

  await logAlteracao({ entidadeTipo: "marketing_empreendimentos", entidadeId: id, acao: "editar", dadosAntes: antes, dadosDepois: depois });

  revalidatePath(`/marketing/empreendimentos/${id}`);
  revalidatePath("/marketing/empreendimentos");
  redirect(`/marketing/empreendimentos/${id}?salvo=1`);
}

// Soft-delete — mesmo padrão do resto do sistema. Ordens que já apontam
// empreendimento_id pra este cadastro continuam com o vínculo (não some o
// histórico), só deixa de aparecer como opção pra novas Ordens.
export async function apagarEmpreendimentoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "empreendimentoId");
  if (!id) throw new Error("Empreendimento inválido.");

  await prisma.marketing_empreendimentos
    .update({ where: { id }, data: { excluido: true, updated_at: new Date() } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "marketing_empreendimentos", entidadeId: id, acao: "apagar", erro }));

  await logAlteracao({ entidadeTipo: "marketing_empreendimentos", entidadeId: id, acao: "apagar" });

  revalidatePath("/marketing/empreendimentos");
  redirect("/marketing/empreendimentos");
}
