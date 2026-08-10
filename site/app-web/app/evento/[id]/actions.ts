"use server";

import { prisma } from "@/lib/prisma";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export type InscricaoResultado = { ok: true } | { ok: false; erro: string };

// Inscrição pública de convidado externo (Formulário Básico/Completo, Fase 3
// do módulo Eventos — pedido do usuário 10/08/2026). Rota pública (ver
// app/evento/[id]/page.tsx — só existe pra evento visibilidade "Publico"),
// sem sessão nenhuma — por isso revalida tudo de novo aqui em vez de confiar
// no que a página já filtrou (alguém pode montar o POST à mão).
export async function inscreverEventoAction(formData: FormData): Promise<InscricaoResultado> {
  const eventoId = texto(formData, "eventoId");
  if (!eventoId) return { ok: false, erro: "Evento inválido." };

  const evento = await prisma.eventos.findFirst({
    where: {
      id: eventoId,
      excluido: false,
      ativo: true,
      visibilidade: "Publico",
      publicado_em: { lte: new Date() }
    }
  });
  if (!evento || !evento.formulario_inscricao) {
    return { ok: false, erro: "Este evento não está com inscrições abertas." };
  }

  const nome = texto(formData, "nome");
  const email = texto(formData, "email");
  const telefone = texto(formData, "telefone");
  if (!nome) return { ok: false, erro: "Informe seu nome." };
  if (!email) return { ok: false, erro: "Informe seu e-mail." };
  if (!telefone) return { ok: false, erro: "Informe seu telefone." };

  const completo = evento.formulario_inscricao === "Completo";
  const endereco = completo ? texto(formData, "endereco") : null;
  const profissao = completo ? texto(formData, "profissao") : null;
  const especialidade = completo ? texto(formData, "especialidade") : null;
  const convidadoPorId = texto(formData, "convidado_por_id");

  // Confere que o "quem convidou" escolhido é mesmo um parceiro ativo e
  // elegível — evita gravar um id forjado no POST direto.
  if (convidadoPorId) {
    const parceiro = await prisma.parceiros.findFirst({
      where: {
        id: convidadoPorId,
        status_funcao: "Ativo",
        funcao: { in: ["Administrativo", "Corretor", "Corretor Estagiário"] }
      },
      select: { id: true }
    });
    if (!parceiro) return { ok: false, erro: "Selecione quem te convidou numa lista válida." };
  }

  await prisma.eventos_inscricoes.create({
    data: {
      evento_id: eventoId,
      tipo_formulario: evento.formulario_inscricao,
      nome,
      email,
      telefone,
      endereco,
      profissao,
      especialidade,
      convidado_por_id: convidadoPorId
    }
  });

  return { ok: true };
}
