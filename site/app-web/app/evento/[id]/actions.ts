"use server";

import { prisma } from "@/lib/prisma";
import { convidadoPaga, valorDevidoConvidado } from "@/lib/eventos/opcoes";

const FUNCOES_EQUIPE_ELEGIVEIS = ["Administrativo", "Corretor", "Corretor Estagiário"];

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// Mesma condição de alcançabilidade usada em app/evento/[id]/page.tsx e
// app/login/page.tsx — repetida aqui (não importada de lá, que é Server
// Component) porque toda Server Action pública precisa revalidar do zero,
// nunca confiar no que a página já filtrou (ver comentário abaixo).
async function buscarEventoInscricaoAberta(eventoId: string) {
  return prisma.eventos.findFirst({
    where: {
      id: eventoId,
      excluido: false,
      ativo: true,
      publicado_em: { lte: new Date() },
      OR: [{ visibilidade: "Publico" }, { formulario_inscricao: { not: null } }]
    }
  });
}

export type InscricaoResultado = { ok: true } | { ok: false; erro: string };

// Inscrição pública de convidado externo (Formulário Básico/Completo, Fase 3
// do módulo Eventos — pedido do usuário 10/08/2026). Rota pública (ver
// app/evento/[id]/page.tsx), sem sessão nenhuma — por isso revalida tudo de
// novo aqui em vez de confiar no que a página já filtrou (alguém pode montar
// o POST à mão).
export async function inscreverEventoAction(formData: FormData): Promise<InscricaoResultado> {
  const eventoId = texto(formData, "eventoId");
  if (!eventoId) return { ok: false, erro: "Evento inválido." };

  const evento = await buscarEventoInscricaoAberta(eventoId);
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

  // Idade (Fase 6, 12/08/2026) — só obrigatória quando o evento cobra por
  // convidado (decide quem paga x quem é criança grátis, ver
  // lib/eventos/opcoes.ts#convidadoPaga). Revalida aqui de novo mesmo com o
  // <input required> no form, porque é rota pública sem sessão — alguém
  // pode montar o POST à mão sem o campo.
  let idade: number | null = null;
  if (evento.cobra_convidado) {
    const idadeTexto = texto(formData, "idade");
    const idadeNumero = idadeTexto ? Number(idadeTexto) : NaN;
    if (!Number.isInteger(idadeNumero) || idadeNumero < 0 || idadeNumero > 120) {
      return { ok: false, erro: "Informe sua idade (é como decidimos se você paga ou não)." };
    }
    idade = idadeNumero;
  }

  // Confere que o "quem convidou" escolhido é mesmo um parceiro ativo e
  // elegível — evita gravar um id forjado no POST direto.
  if (convidadoPorId) {
    const parceiro = await prisma.parceiros.findFirst({
      where: { id: convidadoPorId, status_funcao: "Ativo", funcao: { in: FUNCOES_EQUIPE_ELEGIVEIS } },
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
      convidado_por_id: convidadoPorId,
      idade
    }
  });

  return { ok: true };
}

type ConvidadoResumo = { id: string; nome: string; idade: number | null; paga: boolean; pago: boolean; devido: number };

export type VerificacaoConvidado =
  | { tipo: "equipe"; parceiroId: string; nome: string; convidados: ConvidadoResumo[] }
  | { tipo: "externo_existente"; inscricao: ConvidadoResumo }
  | { tipo: "externo_novo" }
  | { tipo: "erro"; erro: string };

// "Passo 1" do formulário público (Fase 6, 12/08/2026 — pedido do usuário
// depois de reportar que tava "muito superficial"): antes de mostrar
// qualquer campo, pede só o e-mail e decide o que mostrar:
//
// 1) E-mail bate com parceiro ATIVO da equipe (Administrativo/Corretor/
//    Corretor Estagiário) → devolve a lista de convidados que essa pessoa
//    já cadastrou nesse evento (ver eventos_inscricoes.convidado_por_id) +
//    sinal pro formulário virar "adicionar mais um", sem precisar escolher
//    "quem te convidou" (já se sabe quem é) nem repetir nome/e-mail/
//    telefone dela mesma a cada convidado novo. Reaberto quantas vezes
//    quiser, sempre com a lista atualizada — não é login de verdade (sem
//    senha), mas o e-mail é a mesma info que já era exposta sem nenhuma
//    verificação no dropdown "quem te convidou" do formulário de convidado
//    externo, então não é uma exposição nova.
// 2) E-mail não bate com a equipe, mas já existe uma inscrição de convidado
//    externo com esse e-mail nesse evento → devolve o status dela (grátis/
//    paga/pago) em vez de deixar a pessoa se cadastrar de novo duplicado.
// 3) E-mail novo → segue pro formulário normal de convidado externo
//    (inscreverEventoAction).
export async function verificarConvidadoEmailAction(formData: FormData): Promise<VerificacaoConvidado> {
  const eventoId = texto(formData, "eventoId");
  const email = texto(formData, "email");
  if (!eventoId || !email) return { tipo: "erro", erro: "Informe seu e-mail." };

  const evento = await buscarEventoInscricaoAberta(eventoId);
  if (!evento || !evento.formulario_inscricao) {
    return { tipo: "erro", erro: "Este evento não está com inscrições abertas." };
  }

  const valorConvidadoNumero = evento.valor_convidado ? Number(evento.valor_convidado) : null;
  const resumo = (c: { id: string; nome: string; idade: number | null; pago: boolean }): ConvidadoResumo => ({
    id: c.id,
    nome: c.nome,
    idade: c.idade,
    paga: convidadoPaga(c.idade, evento.convidado_idade_gratis_ate),
    pago: c.pago,
    devido: valorDevidoConvidado(c.idade, evento.convidado_idade_gratis_ate, valorConvidadoNumero)
  });

  const parceiro = await prisma.parceiros.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, status_funcao: "Ativo", funcao: { in: FUNCOES_EQUIPE_ELEGIVEIS } },
    select: { id: true, nome: true }
  });
  if (parceiro) {
    const convidados = await prisma.eventos_inscricoes.findMany({
      where: { evento_id: eventoId, convidado_por_id: parceiro.id },
      orderBy: { created_at: "desc" }
    });
    return { tipo: "equipe", parceiroId: parceiro.id, nome: parceiro.nome, convidados: convidados.map(resumo) };
  }

  const existente = await prisma.eventos_inscricoes.findFirst({
    where: { evento_id: eventoId, email: { equals: email, mode: "insensitive" } },
    orderBy: { created_at: "desc" }
  });
  if (existente) {
    return { tipo: "externo_existente", inscricao: resumo(existente) };
  }

  return { tipo: "externo_novo" };
}

// Adiciona um convidado direto pra quem já foi reconhecido como equipe no
// passo 1 (verificarConvidadoEmailAction) — sem precisar dos campos de
// contato (o convidado pode ser alguém sem e-mail/telefone próprio, tipo
// filho pequeno) nem do dropdown "quem convidou" (já se sabe quem é).
export async function adicionarConvidadoEquipeAction(formData: FormData): Promise<InscricaoResultado> {
  const eventoId = texto(formData, "eventoId");
  const parceiroId = texto(formData, "parceiroId");
  const email = texto(formData, "email");
  const nome = texto(formData, "nome");
  if (!eventoId || !parceiroId || !email) return { ok: false, erro: "Sessão inválida — recarregue a página." };
  if (!nome) return { ok: false, erro: "Informe o nome do convidado." };

  const evento = await buscarEventoInscricaoAberta(eventoId);
  if (!evento || !evento.formulario_inscricao) {
    return { ok: false, erro: "Este evento não está com inscrições abertas." };
  }

  // Revalida de novo que quem tá adicionando é mesmo essa pessoa da equipe
  // — é POST público sem sessão, então confia só no que reconfere aqui
  // (parceiroId sozinho seria fácil de forjar; com o e-mail junto, dá pra
  // confirmar que os dois batem com um parceiro ativo de verdade).
  const parceiro = await prisma.parceiros.findFirst({
    where: { id: parceiroId, email: { equals: email, mode: "insensitive" }, status_funcao: "Ativo", funcao: { in: FUNCOES_EQUIPE_ELEGIVEIS } }
  });
  if (!parceiro) return { ok: false, erro: "Não foi possível confirmar seu e-mail. Recarregue a página e tente de novo." };

  let idade: number | null = null;
  if (evento.cobra_convidado) {
    const idadeTexto = texto(formData, "idade");
    const idadeNumero = idadeTexto ? Number(idadeTexto) : NaN;
    if (!Number.isInteger(idadeNumero) || idadeNumero < 0 || idadeNumero > 120) {
      return { ok: false, erro: "Informe a idade do convidado (é como decidimos se paga ou não)." };
    }
    idade = idadeNumero;
  }

  await prisma.eventos_inscricoes.create({
    data: {
      evento_id: eventoId,
      tipo_formulario: evento.formulario_inscricao,
      nome,
      convidado_por_id: parceiro.id,
      idade
    }
  });

  return { ok: true };
}

// Remove um convidado da própria lista de quem já foi reconhecido como
// equipe (Fase 6b, 12/08/2026: "cadastrei os convidados porém não tem como
// apagar, o qr code deles já estão gerados"). Só apaga convidado — nunca a
// resposta de presença de Administrativo/Corretor/Corretor Estagiário
// (eventos_confirmacoes é outra tabela, só "confirmado"/"recusado", sem
// delete nenhum, ver app/portal/eventos/actions.ts).
export async function removerConvidadoEquipeAction(formData: FormData): Promise<InscricaoResultado> {
  const eventoId = texto(formData, "eventoId");
  const parceiroId = texto(formData, "parceiroId");
  const email = texto(formData, "email");
  const inscricaoId = texto(formData, "inscricaoId");
  if (!eventoId || !parceiroId || !email || !inscricaoId) {
    return { ok: false, erro: "Sessão inválida — recarregue a página." };
  }

  // Revalida de novo quem tá removendo é mesmo essa pessoa da equipe, igual
  // adicionarConvidadoEquipeAction.
  const parceiro = await prisma.parceiros.findFirst({
    where: { id: parceiroId, email: { equals: email, mode: "insensitive" }, status_funcao: "Ativo", funcao: { in: FUNCOES_EQUIPE_ELEGIVEIS } }
  });
  if (!parceiro) return { ok: false, erro: "Não foi possível confirmar seu e-mail. Recarregue a página e tente de novo." };

  // Só apaga se o convidado for mesmo dessa pessoa nesse evento — impede
  // apagar convidado de outro parceiro só sabendo o id da inscrição.
  const resultado = await prisma.eventos_inscricoes.deleteMany({
    where: { id: inscricaoId, evento_id: eventoId, convidado_por_id: parceiro.id }
  });
  if (resultado.count === 0) return { ok: false, erro: "Convidado não encontrado." };

  return { ok: true };
}

// Convidado externo cancelando a própria inscrição (mesmo pedido do
// usuário acima) — reconhecido pelo e-mail (mesmo passo 1), sem parceiro
// envolvido.
export async function removerInscricaoExternaAction(formData: FormData): Promise<InscricaoResultado> {
  const eventoId = texto(formData, "eventoId");
  const email = texto(formData, "email");
  const inscricaoId = texto(formData, "inscricaoId");
  if (!eventoId || !email || !inscricaoId) return { ok: false, erro: "Sessão inválida — recarregue a página." };

  const resultado = await prisma.eventos_inscricoes.deleteMany({
    where: { id: inscricaoId, evento_id: eventoId, email: { equals: email, mode: "insensitive" } }
  });
  if (resultado.count === 0) return { ok: false, erro: "Inscrição não encontrada." };

  return { ok: true };
}
