"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireAdm, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { gerarProximoIdEvento } from "@/lib/eventos/id-legado";
import { RECORRENCIA_OPCOES } from "@/lib/eventos/opcoes";
import {
  criarUploadAssinadoImagemEvento,
  publicUrlImagemEvento,
  apagarImagemEvento
} from "@/lib/supabase-admin";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function decimal(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return valorEditavelParaDecimal(t);
}

function booleano(formData: FormData, campo: string): boolean {
  return formData.get(campo) === "on" || formData.get(campo) === "true";
}

// Monta os campos editáveis a partir do formulário — usado tanto na criação
// quanto na edição. Só lê e converte; validação de negócio fica em
// validarCampos(), separada, porque criar e editar redirecionam pra URLs
// diferentes em caso de erro (mesmo espírito de dadosBasePublicacao() em
// app/configuracoes/actions.ts).
function camposFormulario(formData: FormData) {
  const recorrencia = texto(formData, "recorrencia") ?? "Nenhuma";
  const pago = booleano(formData, "pago");
  const temDesconto = booleano(formData, "tem_desconto");
  return {
    nome: texto(formData, "nome"),
    tipo: texto(formData, "tipo"),
    descricao: texto(formData, "descricao"),
    local: texto(formData, "local"),
    data_inicio: data(formData, "data_inicio"),
    recorrencia,
    recorrencia_ate: data(formData, "recorrencia_ate"),
    horario_inicio: texto(formData, "horario_inicio"),
    horario_fim: texto(formData, "horario_fim"),
    visibilidade: texto(formData, "visibilidade") ?? "Publico",
    portal_corretor: booleano(formData, "portal_corretor"),
    ativo: booleano(formData, "ativo"),
    pago,
    valor: decimal(formData, "valor"),
    tem_desconto: temDesconto,
    valor_desconto: decimal(formData, "valor_desconto"),
    desconto_prazo: data(formData, "desconto_prazo"),
    organizador_parceiro_id: texto(formData, "organizador_parceiro_id")
  };
}

function validarCampos(c: ReturnType<typeof camposFormulario>): string | null {
  if (!c.nome) return "Informe o nome do evento.";
  if (!c.data_inicio) return "Informe a data de realização.";
  if (!RECORRENCIA_OPCOES.includes(c.recorrencia as (typeof RECORRENCIA_OPCOES)[number])) {
    return "Recorrência inválida.";
  }
  if (c.recorrencia !== "Nenhuma" && !c.recorrencia_ate) return "Informe até quando o evento se repete.";
  if (c.pago && (c.valor === null || c.valor <= 0)) {
    return 'Informe o valor do evento (ou desmarque "Tem pagamento").';
  }
  if (c.tem_desconto && (c.valor_desconto === null || c.valor_desconto <= 0)) {
    return 'Informe o valor do desconto (ou desmarque "Tem desconto").';
  }
  return null;
}

// Monta o objeto pronto pra ir no prisma.eventos.create/update — zera os
// campos condicionais (recorrencia_ate sem recorrência, valor sem pagamento,
// desconto sem "tem_desconto") pra não deixar lixo salvo se a pessoa marcar
// e desmarcar um checkbox antes de enviar.
function dadosParaSalvar(c: ReturnType<typeof camposFormulario>) {
  return {
    nome: c.nome as string,
    tipo: c.tipo,
    descricao: c.descricao,
    local: c.local,
    data_inicio: c.data_inicio as Date,
    recorrencia: c.recorrencia,
    recorrencia_ate: c.recorrencia !== "Nenhuma" ? c.recorrencia_ate : null,
    horario_inicio: c.horario_inicio,
    horario_fim: c.horario_fim,
    visibilidade: c.visibilidade,
    portal_corretor: c.portal_corretor,
    ativo: c.ativo,
    pago: c.pago,
    valor: c.pago ? c.valor : null,
    tem_desconto: c.tem_desconto,
    valor_desconto: c.tem_desconto ? c.valor_desconto : null,
    desconto_prazo: c.tem_desconto ? c.desconto_prazo : null,
    organizador_parceiro_id: c.organizador_parceiro_id,
    updated_at: new Date()
  };
}

// Mesmo esquema de upload direto pro Storage via URL assinada usado nas
// publicações (Notícias/Editais) — a Vercel tem limite fixo de 4,5MB por
// requisição de Server Action, e a capa do evento estoura isso fácil. O
// navegador sobe a imagem direto pro Storage (ver components/evento-form.tsx)
// e manda só o caminho já salvo pra cá.
export async function prepararUploadImagemEventoAction(
  nomeArquivo: string
): Promise<{ ok: true; caminho: string; token: string } | { ok: false; erro: string }> {
  await requireAdminSession();
  try {
    const { caminho, token } = await criarUploadAssinadoImagemEvento(nomeArquivo);
    return { ok: true, caminho, token };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Falha ao preparar o upload da imagem." };
  }
}

export async function criarEventoAction(formData: FormData) {
  const admin = await requireAdminSession();

  const campos = camposFormulario(formData);
  const erroValidacao = validarCampos(campos);
  if (erroValidacao) redirect(`/eventos/novo?erro=${encodeURIComponent(erroValidacao)}`);

  const imagemCaminho = texto(formData, "imagem_caminho");
  const imagem_url = imagemCaminho ? publicUrlImagemEvento(imagemCaminho) : null;
  const dados = dadosParaSalvar(campos);

  const novo = await prisma.eventos
    .create({
      data: { ...dados, imagem_url, id_legado: await gerarProximoIdEvento() }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "eventos", acao: "criar", erro }));

  await logAlteracao({
    entidadeTipo: "eventos",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { nome: novo.nome, visibilidade: novo.visibilidade, data_inicio: novo.data_inicio, criado_por: admin.nome }
  });

  revalidatePath("/eventos");
  redirect(`/eventos/${novo.id}?salvo=1`);
}

export async function atualizarEventoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "eventoId");
  if (!id) redirect(`/eventos?erro=${encodeURIComponent("Evento inválido.")}`);

  const antes = await prisma.eventos.findUnique({ where: { id } });
  if (!antes) redirect(`/eventos?erro=${encodeURIComponent("Evento não encontrado.")}`);

  const campos = camposFormulario(formData);
  const erroValidacao = validarCampos(campos);
  if (erroValidacao) redirect(`/eventos/${id}?erro=${encodeURIComponent(erroValidacao)}`);

  // Três cenários pra imagem, mesmo padrão de app/configuracoes/actions.ts
  // (Publicações): (1) subiu um arquivo novo — troca e apaga a antiga; (2)
  // marcou "remover imagem" sem escolher outra — só apaga; (3) não mexeu —
  // mantém a que já estava.
  const imagemCaminho = texto(formData, "imagem_caminho");
  const removerImagem = booleano(formData, "remover_imagem");
  let imagem_url = antes!.imagem_url;

  if (imagemCaminho) {
    imagem_url = publicUrlImagemEvento(imagemCaminho);
    await apagarImagemEvento(antes!.imagem_url);
  } else if (removerImagem) {
    await apagarImagemEvento(antes!.imagem_url);
    imagem_url = null;
  }

  const dados = dadosParaSalvar(campos);

  await prisma.eventos
    .update({ where: { id }, data: { ...dados, imagem_url } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "eventos", entidadeId: id, acao: "editar", erro }));

  await logAlteracao({
    entidadeTipo: "eventos",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: { ...dados, imagem_url }
  });

  revalidatePath(`/eventos/${id}`);
  revalidatePath("/eventos");
  redirect(`/eventos/${id}?salvo=1`);
}

// Liga/desliga a publicação sem abrir o formulário inteiro — mesmo padrão
// de alternarAtivoPublicacaoAction em app/configuracoes/actions.ts.
export async function alternarAtivoEventoAction(formData: FormData) {
  await requireAdminSession();
  const id = texto(formData, "eventoId");
  if (!id) return;

  const atual = await prisma.eventos.findUnique({ where: { id } });
  if (!atual) return;

  await prisma.eventos
    .update({ where: { id }, data: { ativo: !atual.ativo, updated_at: new Date() } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "eventos", entidadeId: id, acao: "alternar_ativo", erro }));

  await logAlteracao({
    entidadeTipo: "eventos",
    entidadeId: id,
    acao: atual.ativo ? "despublicar" : "publicar",
    dadosAntes: { ativo: atual.ativo },
    dadosDepois: { ativo: !atual.ativo }
  });

  revalidatePath("/eventos");
  revalidatePath(`/eventos/${id}`);
}

// Soft-delete (excluido = true) — evento pode ter confirmações de presença
// vinculadas (eventos_confirmacoes) e, mais pra frente, histórico de quem
// participou; apagar de verdade perderia esse rastro à toa. Só ADM.
export async function apagarEventoAction(formData: FormData) {
  const admin = await requireAdm();

  const id = texto(formData, "eventoId");
  if (!id) throw new Error("Evento inválido.");

  const antes = await prisma.eventos.findUnique({ where: { id } });
  if (!antes) throw new Error("Evento não encontrado.");

  await prisma.eventos.update({ where: { id }, data: { excluido: true, ativo: false, updated_at: new Date() } });

  await logAlteracao({
    entidadeTipo: "eventos",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { nome: antes.nome },
    dadosDepois: { excluido_por: admin.nome }
  });

  revalidatePath("/eventos");
  redirect("/eventos?excluido=1");
}
