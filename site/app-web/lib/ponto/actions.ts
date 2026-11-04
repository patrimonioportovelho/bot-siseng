"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAlteracao, requireAdm, requireAdminSession } from "@/lib/auth";
import { enviarEmail } from "@/lib/email";
import { escaparHtml } from "@/lib/documentos/disparo-email";
import { fimDaSemana, formatarMin, hhmmParaMin, instanteDoDia, inicioDoDia, pessoaTemPonto } from "@/lib/ponto/regras";

const MINUTOS_PERMITIDOS = [30, 60, 120, 180, 240, 480];

// O funcionário pede liberação (hora extra ou uso fora do expediente). A diretoria é avisada
// por e-mail e pelo sino, e decide em Configurações > Controle de ponto.
export async function solicitarLiberacaoAction(
  motivo: string,
  minutos: number
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const sessao = await requireAdminSession();
  if (!pessoaTemPonto(sessao)) return { ok: false, erro: "Seu acesso não tem controle de ponto." };
  const texto = motivo.trim();
  if (texto.length < 10) return { ok: false, erro: "Explique o motivo do pedido (pelo menos 10 caracteres)." };
  if (texto.length > 500) return { ok: false, erro: "O motivo está grande demais (máximo 500 caracteres)." };
  if (!MINUTOS_PERMITIDOS.includes(minutos)) return { ok: false, erro: "Escolha por quanto tempo você precisa." };

  const pendente = await prisma.ponto_liberacoes.findFirst({ where: { parceiro_id: sessao.parceiroId, status: "pendente" }, select: { id: true } });
  if (pendente) return { ok: false, erro: "Você já tem um pedido aguardando a diretoria." };

  const pedido = await prisma.ponto_liberacoes.create({
    data: { parceiro_id: sessao.parceiroId, motivo: texto, minutos_solicitados: minutos },
    select: { id: true }
  });
  await logAlteracao({
    entidadeTipo: "ponto_liberacoes",
    entidadeId: pedido.id,
    acao: "solicitar_liberacao_ponto",
    dadosDepois: { motivo: texto, minutos }
  }).catch(() => undefined);

  // avisa a diretoria por e-mail, depois de responder ao funcionário
  after(async () => {
    const diretores = await prisma.parceiros.findMany({
      where: { status_funcao: "Ativo", email: { contains: "@" }, OR: [{ acesso_completo: true }, { acessos: { has: "diretor" } }] },
      select: { email: true }
    });
    const para = [...new Set(diretores.map((d) => d.email as string))];
    if (para.length === 0) return;
    await enviarEmail({
      to: para,
      subject: `Pedido de liberação de horas — ${sessao.nome}`,
      html: `<div style="font-family:sans-serif;font-size:14px;color:#1f2937;">
        <p><strong>${escaparHtml(sessao.nome)}</strong> pediu liberação para usar o sistema fora do limite de horas ou do expediente.</p>
        <p><strong>Tempo pedido:</strong> ${formatarMin(minutos)}<br/><strong>Motivo:</strong> ${escaparHtml(texto)}</p>
        <p>Para aprovar ou negar, abra <strong>Configurações &gt; Controle de ponto</strong> no sistema.</p></div>`
    }).catch(() => undefined);
  });

  return { ok: true };
}

// Diretoria aprova (com quantidade de horas e validade) ou nega.
export async function decidirLiberacaoAction(formData: FormData) {
  const admin = await requireAdm();
  const id = String(formData.get("id") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  const pedido = await prisma.ponto_liberacoes.findUnique({ where: { id } });
  if (!pedido || pedido.status !== "pendente") redirect("/configuracoes?erro=" + encodeURIComponent("Esse pedido já foi decidido ou não existe."));

  const agora = new Date();
  if (decisao === "aprovar") {
    const minutos = Math.floor(Number(formData.get("minutos")));
    if (!Number.isFinite(minutos) || minutos < 15 || minutos > 12 * 60) {
      redirect("/configuracoes?erro=" + encodeURIComponent("Informe quantos minutos de liberação (entre 15 min e 12 h)."));
    }
    const validade = String(formData.get("validade") ?? "dia");
    const validaAte = validade === "semana" ? fimDaSemana(agora) : new Date(inicioDoDia(agora).getTime() + 86400000);
    await prisma.ponto_liberacoes.update({
      where: { id },
      data: { status: "aprovada", minutos_aprovados: minutos, valida_ate: validaAte, decidido_por: admin.parceiroId, decidido_em: agora, observacao_decisao: observacao }
    });
  } else {
    await prisma.ponto_liberacoes.update({
      where: { id },
      data: { status: "negada", decidido_por: admin.parceiroId, decidido_em: agora, observacao_decisao: observacao }
    });
  }
  await logAlteracao({
    entidadeTipo: "ponto_liberacoes",
    entidadeId: id,
    acao: decisao === "aprovar" ? "aprovar_liberacao_ponto" : "negar_liberacao_ponto",
    dadosDepois: { parceiro_id: pedido.parceiro_id, minutos: formData.get("minutos"), validade: formData.get("validade"), observacao }
  }).catch(() => undefined);

  revalidatePath("/configuracoes");
  redirect("/configuracoes?salvo_ponto=1");
}

function voltarParaEspelho(parceiroId: string, de: string, ate: string, extra = ""): never {
  redirect(`/configuracoes/ponto/${parceiroId}?de=${de}&ate=${ate}${extra}`);
}

// Esqueceu de sair / ficou sem energia: a diretoria lança o período que faltou. Fica marcado
// como "ajuste manual", com a justificativa e quem lançou.
export async function adicionarPeriodoPontoAction(formData: FormData) {
  const admin = await requireAdm();
  const parceiroId = String(formData.get("parceiroId") ?? "");
  const de = String(formData.get("de") ?? "");
  const ate = String(formData.get("ate") ?? "");
  const dia = String(formData.get("dia") ?? "");
  const ini = String(formData.get("inicio") ?? "");
  const fim = String(formData.get("fim") ?? "");
  const justificativa = String(formData.get("justificativa") ?? "").trim();

  const mData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!parceiroId || !mData || !/^\d{2}:\d{2}$/.test(ini) || !/^\d{2}:\d{2}$/.test(fim)) {
    voltarParaEspelho(parceiroId, de, ate, "&erro=" + encodeURIComponent("Informe o dia e os horários de entrada e saída."));
  }
  if (hhmmParaMin(fim) <= hhmmParaMin(ini)) voltarParaEspelho(parceiroId, de, ate, "&erro=" + encodeURIComponent("A saída precisa ser depois da entrada."));
  if (justificativa.length < 10) voltarParaEspelho(parceiroId, de, ate, "&erro=" + encodeURIComponent("Escreva a justificativa do ajuste (pelo menos 10 caracteres)."));

  const base = instanteDoDia(Number(mData![1]), Number(mData![2]), Number(mData![3])).getTime();
  const sessao = await prisma.ponto_sessoes.create({
    data: {
      parceiro_id: parceiroId,
      inicio: new Date(base + hhmmParaMin(ini) * 60000),
      ultimo_sinal: new Date(base + hhmmParaMin(fim) * 60000),
      fim: new Date(base + hhmmParaMin(fim) * 60000),
      motivo_fim: "ajuste",
      origem: "ajuste_manual",
      justificativa,
      ajustado_por: admin.parceiroId
    },
    select: { id: true }
  });
  await logAlteracao({ entidadeTipo: "ponto_sessoes", entidadeId: sessao.id, acao: "ajuste_manual_ponto", dadosDepois: { parceiroId, dia, ini, fim, justificativa } }).catch(() => undefined);
  revalidatePath(`/configuracoes/ponto/${parceiroId}`);
  voltarParaEspelho(parceiroId, de, ate, "&ok=1");
}

// Período registrado errado: não se apaga, só se anula (com justificativa) e deixa de contar.
export async function anularPeriodoPontoAction(formData: FormData) {
  const admin = await requireAdm();
  const id = String(formData.get("id") ?? "");
  const parceiroId = String(formData.get("parceiroId") ?? "");
  const de = String(formData.get("de") ?? "");
  const ate = String(formData.get("ate") ?? "");
  const justificativa = String(formData.get("justificativa") ?? "").trim();
  if (justificativa.length < 10) voltarParaEspelho(parceiroId, de, ate, "&erro=" + encodeURIComponent("Escreva a justificativa para anular (pelo menos 10 caracteres)."));

  const antes = await prisma.ponto_sessoes.findUnique({ where: { id } });
  if (!antes) voltarParaEspelho(parceiroId, de, ate, "&erro=" + encodeURIComponent("Período não encontrado."));
  await prisma.ponto_sessoes.update({ where: { id }, data: { anulada: true, justificativa, ajustado_por: admin.parceiroId } });
  await logAlteracao({ entidadeTipo: "ponto_sessoes", entidadeId: id, acao: "anular_periodo_ponto", dadosAntes: { inicio: antes!.inicio, fim: antes!.fim ?? antes!.ultimo_sinal }, dadosDepois: { justificativa } }).catch(() => undefined);
  revalidatePath(`/configuracoes/ponto/${parceiroId}`);
  voltarParaEspelho(parceiroId, de, ate, "&ok=1");
}
