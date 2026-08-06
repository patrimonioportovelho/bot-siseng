"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireAdm, logAlteracao } from "@/lib/auth";
import { registrarEJogarErro } from "@/lib/erros";
import { enviarEmail } from "@/lib/email";
import { gerarProximoIdCliente } from "@/lib/clientes/id-legado";
import { gerarProximoIdAvaliacao } from "@/lib/avaliacoes/id-legado";
import {
  criarUploadAssinadoImagemConsulta,
  criarLinkImagemConsultaParaEmail,
  baixarImagemConsulta,
  apagarImagemConsulta
} from "@/lib/supabase-admin";

// Mesmo endereço fixo usado em app/portal/avaliacao-cpf/actions.ts pro email
// de "nova avaliação cadastrada" — usado aqui como Reply-To do email pro
// corretor, pra quem responder cair no mesmo lugar que recebeu o pedido
// original (mesmo sem a variável de ambiente configurada).
const EMAIL_DESTINO_PADRAO = "engimob@remax.com.br";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// Telefone e CPF são digitados com máscara mas gravados só com dígitos,
// mesmo padrão usado no resto da base (ver app/parceiros/actions.ts).
function somenteDigitos(formData: FormData, campo: string): string | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = t.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

// Número de Processo tem formato fixo x.xxxx.xxxxxxx-x (13 dígitos) — só
// reduz a só-dígitos quando o valor digitado já fecha nesse tanto, senão
// mantém como texto livre (mesmo critério de inscricaoValor em
// app/imoveis/actions.ts).
function processoValor(formData: FormData, campo: string): string | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = t.replace(/\D/g, "");
  return d.length === 13 ? d : t;
}

function decimal(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function booleano(formData: FormData, campo: string): boolean {
  return formData.get(campo) === "on" || formData.get(campo) === "true";
}

// ==================== Avaliação ====================

// Consulta de CPF é só pra ver se o nome tá limpo — pra isso precisa do nome
// completo e do CPF (regra do usuário). Se o admin digitou um nome que ainda
// não existe no banco (não escolheu ninguém da busca), esse nome + CPF já
// bastam pra criar o cliente na hora, ligado ao parceiro escolhido na mesma
// tela — evita ter que ir cadastrar em outro lugar antes de rodar a consulta.
async function resolverClienteId(
  formData: FormData,
  dados: { parceiroId: string | null; telefone: string | null; cpf: string | null }
): Promise<string | null> {
  const clienteId = texto(formData, "cliente_id");
  if (clienteId) return clienteId;

  const nomeNovo = texto(formData, "cliente_nome_busca");
  if (!nomeNovo) return null;

  const criado = await prisma.clientes.create({
    data: {
      tipo_cliente: "Pessoa Física",
      nome: nomeNovo,
      id_legado: await gerarProximoIdCliente(),
      cpf: dados.cpf,
      telefone: dados.telefone,
      parceiro_id: dados.parceiroId,
      status_cadastro: dados.cpf ? "Completo" : "Rascunho"
    }
  });
  return criado.id;
}

function camposAvaliacao(formData: FormData, clienteId: string | null) {
  return {
    tipo_avaliacao: texto(formData, "tipo_avaliacao"),
    banco_id: texto(formData, "banco_id"),
    status: texto(formData, "status") ?? undefined,
    data_avaliacao: data(formData, "data_avaliacao"),
    cliente_id: clienteId,
    telefone: somenteDigitos(formData, "telefone"),
    cpf: somenteDigitos(formData, "cpf"),
    parceiro_id: texto(formData, "parceiro_id"),
    data_validade: data(formData, "data_validade"),
    tipo_imovel: texto(formData, "tipo_imovel"),
    produto: texto(formData, "produto"),
    tabela: texto(formData, "tabela"),
    indexador: texto(formData, "indexador"),
    valor_aprovado: decimal(formData, "valor_aprovado"),
    valor_financiamento: decimal(formData, "valor_financiamento"),
    prestacao: decimal(formData, "prestacao"),
    usa_fgts: booleano(formData, "usa_fgts"),
    valor_fgts: decimal(formData, "valor_fgts"),
    usa_subsidio: booleano(formData, "usa_subsidio"),
    valor_subsidio: decimal(formData, "valor_subsidio"),
    // Upload de verdade (bucket privado avaliacoes-imagens) — o
    // AvaliacaoForm sempre manda o caminho atual (o que já existia, ou o
    // recém-enviado) nesse campo oculto a cada salvamento, então isso nunca
    // apaga a imagem sem querer. imagem_consulta_url (link colado à mão,
    // formato antigo) não é mais editável por aqui.
    imagem_consulta_caminho: texto(formData, "imagem_consulta_caminho"),
    observacao: texto(formData, "observacao"),
    updated_at: new Date()
  };
}

// Pedido pelo navegador antes do upload de verdade (ver criarUploadAssinadoImagemConsulta) —
// mesmo esquema de URL assinada de upload já usado pra imagem de capa das
// publicações, pra não passar o arquivo pelo corpo da Server Action.
export async function prepararUploadImagemConsultaAction(
  nomeArquivo: string
): Promise<{ ok: true; caminho: string; token: string } | { ok: false; erro: string }> {
  await requireAdminSession();
  try {
    const { caminho, token } = await criarUploadAssinadoImagemConsulta(nomeArquivo);
    return { ok: true, caminho, token };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Falha ao preparar o upload da imagem." };
  }
}

export async function criarAvaliacaoAction(formData: FormData) {
  await requireAdminSession();

  const parceiroId = texto(formData, "parceiro_id");
  const telefone = somenteDigitos(formData, "telefone");
  const cpf = somenteDigitos(formData, "cpf");
  const status = texto(formData, "status");

  const semNome = !texto(formData, "cliente_id") && !texto(formData, "cliente_nome_busca");
  if (status === "Consulta de CPF" && (semNome || !cpf)) {
    throw new Error("Consulta de CPF precisa do nome completo e do CPF preenchidos.");
  }

  const clienteId = await resolverClienteId(formData, { parceiroId, telefone, cpf });
  const campos = camposAvaliacao(formData, clienteId);
  if (!campos.cliente_id && !campos.cpf) {
    throw new Error("Selecione o cliente ou informe ao menos o CPF pra identificar a avaliação.");
  }

  const idLegado = await gerarProximoIdAvaliacao();

  const novo = await prisma.avaliacoes
    .create({ data: { ...campos, id_legado: idLegado, status: campos.status ?? "Montagem de processo" } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "avaliacoes", acao: "criar", erro }));

  await sincronizarCoTitulares(novo.id, formData);

  await logAlteracao({
    entidadeTipo: "avaliacoes",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { cliente_id: novo.cliente_id, status: novo.status }
  });

  revalidatePath("/financiamento");
  redirect(`/financiamento/${novo.id}?salvo=1`);
}

export async function atualizarAvaliacaoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "avaliacaoId");
  if (!id) throw new Error("Avaliação inválida.");

  const antes = await prisma.avaliacoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Avaliação não encontrada.");

  const parceiroId = texto(formData, "parceiro_id");
  const telefone = somenteDigitos(formData, "telefone");
  const cpf = somenteDigitos(formData, "cpf");
  const status = texto(formData, "status");

  const semNome = !texto(formData, "cliente_id") && !texto(formData, "cliente_nome_busca");
  if (status === "Consulta de CPF" && (semNome || !cpf)) {
    throw new Error("Consulta de CPF precisa do nome completo e do CPF preenchidos.");
  }

  const clienteId = await resolverClienteId(formData, { parceiroId, telefone, cpf });
  const campos = camposAvaliacao(formData, clienteId);

  const depois = await prisma.avaliacoes
    .update({ where: { id }, data: campos })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "avaliacoes", entidadeId: id, acao: "editar", erro }));

  // Imagem trocada por uma nova — apaga a antiga do Storage pra não deixar
  // arquivo órfão (mesmo cuidado de apagarImagemPublicacao em Configurações).
  if (antes.imagem_consulta_caminho && antes.imagem_consulta_caminho !== campos.imagem_consulta_caminho) {
    await apagarImagemConsulta(antes.imagem_consulta_caminho);
  }

  await sincronizarCoTitulares(id, formData);

  await logAlteracao({
    entidadeTipo: "avaliacoes",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/financiamento/${id}`);
  revalidatePath("/financiamento");
  redirect(`/financiamento/${id}?salvo=1`);
}

// "Apagar" aqui é sempre soft-delete (excluido=true) — mesmo padrão de
// app/imoveis/actions.ts#apagarImovelAction: a avaliação pode ter Andamentos
// e lançamentos vinculados, um DELETE de verdade quebraria essas
// referências (ou exigiria apagar tudo em cascata, perdendo histórico à
// toa). Só ADM pode apagar.
export async function apagarAvaliacaoAction(formData: FormData) {
  const admin = await requireAdm();

  const id = texto(formData, "avaliacaoId");
  if (!id) throw new Error("Avaliação inválida.");

  const antes = await prisma.avaliacoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Avaliação não encontrada.");

  await prisma.avaliacoes.update({ where: { id }, data: { excluido: true, updated_at: new Date() } });

  await logAlteracao({
    entidadeTipo: "avaliacoes",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { status: antes.status },
    dadosDepois: { excluido: true, excluido_por: admin.nome }
  });

  revalidatePath("/financiamento");
  redirect("/financiamento?excluido=1");
}

// Manda a imagem da consulta de CPF pro corretor (parceiro) que pediu a
// avaliação, como se fosse uma resposta ao pedido — pedido do usuário em
// 02/08/2026. Botão manual (não automático): o admin decide quando mandar,
// depois de conferir que a imagem certa foi enviada.
export async function enviarImagemConsultaCorretorAction(formData: FormData) {
  await requireAdminSession();

  const avaliacaoId = texto(formData, "avaliacaoId");
  if (!avaliacaoId) throw new Error("Avaliação inválida.");

  const avaliacao = await prisma.avaliacoes.findUnique({
    where: { id: avaliacaoId },
    include: { parceiros: true, clientes: true }
  });
  if (!avaliacao) throw new Error("Avaliação não encontrada.");
  if (!avaliacao.imagem_consulta_caminho) {
    throw new Error("Envie a imagem da consulta antes de mandar pro corretor.");
  }
  if (!avaliacao.parceiros) {
    throw new Error("Essa avaliação não tem um parceiro responsável vinculado — não dá pra saber pra quem mandar.");
  }
  if (!avaliacao.parceiros.email) {
    throw new Error(
      `${avaliacao.parceiros.nome} não tem email cadastrado. Atualize o cadastro do parceiro em Parceiros antes de enviar.`
    );
  }

  const [conteudo, linkReforco] = await Promise.all([
    baixarImagemConsulta(avaliacao.imagem_consulta_caminho),
    criarLinkImagemConsultaParaEmail(avaliacao.imagem_consulta_caminho)
  ]);

  // Bug encontrado em 04/08/2026: quando o download do Storage falhava por
  // qualquer motivo, o código seguia e mandava o email mesmo assim, só sem
  // o anexo (e ainda marcava como "enviado") — o admin achava que tinha
  // dado certo, mas o corretor recebia um email sem o arquivo de verdade
  // (só o link de reforço, quando esse também não falhava). Agora um
  // download que falha é um erro de verdade, igual qualquer outra falha de
  // envio: aparece em Configurações > Erros de cadastro e NÃO marca como
  // enviado, pra dar pra tentar de novo.
  if (!conteudo) {
    await registrarEJogarErro({
      entidadeTipo: "avaliacoes",
      entidadeId: avaliacaoId,
      acao: "enviar_imagem_consulta_corretor",
      erro: new Error(
        `Não consegui baixar o arquivo da imagem da consulta no Storage (caminho: ${avaliacao.imagem_consulta_caminho}). Tente enviar de novo — se persistir, refaça o upload da imagem.`
      )
    });
  }

  const clienteNome = avaliacao.clientes?.nome ?? "o cliente";
  const extensao = avaliacao.imagem_consulta_caminho.split(".").pop() || "jpg";

  const html = `
    <div style="font-family: sans-serif; font-size: 14px; color: #1f2937;">
      <p>Olá, ${avaliacao.parceiros.nome}!</p>
      <p>Segue o resultado da <strong>Consulta de CPF</strong> que você pediu, referente a <strong>${clienteNome}</strong>.</p>
      ${linkReforco ? `<p><a href="${linkReforco}" target="_blank" rel="noopener noreferrer">Abrir a imagem</a> (link válido por 7 dias)</p>` : ""}
      <p style="color:#6b7280; font-size:12px;">Qualquer dúvida, é só responder este email.</p>
    </div>
  `;

  const resultado = await enviarEmail({
    to: avaliacao.parceiros.email,
    subject: `Consulta de CPF — ${clienteNome}`,
    html,
    attachments: conteudo ? [{ filename: `consulta-cpf.${extensao}`, content: conteudo }] : undefined,
    replyTo: process.env.EMAIL_ADM_FINANCIAMENTO || EMAIL_DESTINO_PADRAO
  });

  if (!resultado.ok) {
    await registrarEJogarErro({
      entidadeTipo: "avaliacoes",
      entidadeId: avaliacaoId,
      acao: "enviar_imagem_consulta_corretor",
      erro: new Error(resultado.erro)
    });
  }

  await prisma.avaliacoes.update({ where: { id: avaliacaoId }, data: { imagem_consulta_enviada_em: new Date() } });

  await logAlteracao({
    entidadeTipo: "avaliacoes",
    entidadeId: avaliacaoId,
    acao: "enviar_imagem_consulta_corretor",
    dadosDepois: { enviado_para: avaliacao.parceiros.email }
  });

  revalidatePath(`/financiamento/${avaliacaoId}`);
  redirect(`/financiamento/${avaliacaoId}?salvo=1`);
}

// Análise de crédito muitas vezes é conjunta (cônjuge, por exemplo) — além do
// titular principal (avaliacoes.cliente_id), a avaliação pode ter N
// co-titulares extras. A lista vem do formulário como vários campos
// "cotitular_id" repetidos (mesmo padrão de sincronizarProprietarios em
// app/imoveis/actions.ts) — apaga os vínculos atuais e recria na ordem em
// que foram adicionados no formulário.
async function sincronizarCoTitulares(avaliacaoId: string, formData: FormData) {
  const ids = formData
    .getAll("cotitular_id")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  await prisma.$transaction([
    prisma.avaliacoes_clientes.deleteMany({ where: { avaliacao_id: avaliacaoId } }),
    ...(ids.length > 0
      ? [
          prisma.avaliacoes_clientes.createMany({
            data: ids.map((clienteId, ordem) => ({ avaliacao_id: avaliacaoId, cliente_id: clienteId, ordem }))
          })
        ]
      : [])
  ]);
}

// ==================== Andamento ====================

function camposAndamento(formData: FormData) {
  return {
    data_inicio: data(formData, "data_inicio"),
    cliente_vendedor_id: texto(formData, "cliente_vendedor_id"),
    abrir_conta: booleano(formData, "abrir_conta"),
    imovel_id: texto(formData, "imovel_id"),
    avaliador_id: texto(formData, "avaliador_id"),
    tipo_contrato: texto(formData, "tipo_contrato"),
    status_andamento: texto(formData, "status_andamento") ?? undefined,
    status_andamento_complementar: texto(formData, "status_andamento_complementar"),
    processo: processoValor(formData, "processo"),
    valor_avaliado: decimal(formData, "valor_avaliado"),
    valor_venda: decimal(formData, "valor_venda"),
    tem_entrada: booleano(formData, "tem_entrada"),
    valor_recurso: decimal(formData, "valor_recurso"),
    valor_fgts: decimal(formData, "valor_fgts"),
    subsidio: decimal(formData, "subsidio"),
    valor_financiado: decimal(formData, "valor_financiado"),
    observacao: texto(formData, "observacao"),
    data_conclusao: data(formData, "data_conclusao"),
    updated_at: new Date()
  };
}

// Regra herdada do sistema antigo (Apps Script "andamento.txt"): quando o
// Andamento entra em "Concluído", a Avaliação vinculada acompanha
// automaticamente — é assim que as duas "andam juntas" no fechamento do
// processo, sem precisar editar as duas fichas separadamente. Só mexe nesse
// sentido (Andamento concluído → Avaliação concluída); não desfaz sozinho se
// o Andamento for reaberto depois, pra não reabrir uma avaliação que o
// administrativo já tratou como encerrada por outro motivo.
async function sincronizarStatusAvaliacao(avaliacaoId: string, statusAndamento: string | undefined) {
  if (statusAndamento !== "Concluído") return;
  const avaliacao = await prisma.avaliacoes.findUnique({ where: { id: avaliacaoId }, select: { status: true } });
  if (!avaliacao || avaliacao.status === "Concluído") return;
  await prisma.avaliacoes.update({ where: { id: avaliacaoId }, data: { status: "Concluído", updated_at: new Date() } });
}

export async function criarAndamentoAction(formData: FormData) {
  await requireAdminSession();

  const avaliacaoId = texto(formData, "avaliacaoId");
  if (!avaliacaoId) throw new Error("Avaliação inválida.");

  const campos = camposAndamento(formData);

  const novo = await prisma.andamentos
    .create({ data: { avaliacao_id: avaliacaoId, ...campos, status_andamento: campos.status_andamento ?? "Pendente" } })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "andamentos", acao: "criar", erro }));

  await sincronizarStatusAvaliacao(avaliacaoId, novo.status_andamento);

  await logAlteracao({
    entidadeTipo: "andamentos",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { avaliacao_id: avaliacaoId, status_andamento: novo.status_andamento }
  });

  revalidatePath(`/financiamento/${avaliacaoId}`);
  revalidatePath("/financiamento");
  redirect(`/financiamento/${avaliacaoId}?salvo=1`);
}

export async function atualizarAndamentoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "andamentoId");
  if (!id) throw new Error("Andamento inválido.");

  const antes = await prisma.andamentos.findUnique({ where: { id } });
  if (!antes) throw new Error("Andamento não encontrado.");

  const campos = camposAndamento(formData);

  const depois = await prisma.andamentos
    .update({ where: { id }, data: campos })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "andamentos", entidadeId: id, acao: "editar", erro }));

  await sincronizarStatusAvaliacao(antes.avaliacao_id, depois.status_andamento);

  await logAlteracao({
    entidadeTipo: "andamentos",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/financiamento/${antes.avaliacao_id}`);
  revalidatePath("/financiamento");
  redirect(`/financiamento/${antes.avaliacao_id}?salvo=1`);
}

// Mesmo soft-delete de apagarAvaliacaoAction, só que aqui não some da tela —
// continua em /financiamento/[id], só o Andamento apagado some da lista
// (dá pra criar um novo Andamento na hora, se foi engano).
export async function apagarAndamentoAction(formData: FormData) {
  const admin = await requireAdm();

  const id = texto(formData, "andamentoId");
  if (!id) throw new Error("Andamento inválido.");

  const antes = await prisma.andamentos.findUnique({ where: { id } });
  if (!antes) throw new Error("Andamento não encontrado.");

  await prisma.andamentos.update({ where: { id }, data: { excluido: true, updated_at: new Date() } });

  await logAlteracao({
    entidadeTipo: "andamentos",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { status_andamento: antes.status_andamento },
    dadosDepois: { excluido: true, excluido_por: admin.nome }
  });

  revalidatePath(`/financiamento/${antes.avaliacao_id}`);
  revalidatePath("/financiamento");
  redirect(`/financiamento/${antes.avaliacao_id}?salvo=1`);
}

// ==================== Lançamentos ====================

// Lançamentos (parcelas de remuneração do financiamento) são editados como
// uma lista inteira de uma vez só — mesmo padrão de
// sincronizarCondicoesPagamento (app/portal/compra-venda/actions.ts): quem
// não veio mais no array enviado é apagado, quem veio com id é atualizado,
// quem veio sem id é criado. Evita precisar de uma Server Action separada
// pra cada linha só pra adicionar/remover/editar um lançamento.
export async function sincronizarLancamentosAction(formData: FormData) {
  await requireAdminSession();

  const andamentoId = texto(formData, "andamentoId");
  if (!andamentoId) throw new Error("Andamento inválido.");

  const andamento = await prisma.andamentos.findUnique({ where: { id: andamentoId }, select: { avaliacao_id: true } });
  if (!andamento) throw new Error("Andamento não encontrado.");

  const bruto = texto(formData, "lancamentosJson");
  let lista: Array<Record<string, unknown>> = [];
  if (bruto) {
    try {
      const parsed = JSON.parse(bruto);
      if (Array.isArray(parsed)) lista = parsed;
    } catch {
      lista = [];
    }
  }

  const linhas = lista.map((l) => {
    const valorTxt = String(l.valor_financiado ?? "").trim();
    const remuneracaoTxt = String(l.remuneracao ?? "").trim();
    const dataTxt = String(l.data_pagamento ?? "").trim();
    const dataPagamento = dataTxt ? new Date(dataTxt) : null;
    return {
      id: typeof l.id === "string" && l.id.length > 0 ? l.id : null,
      valor_financiado: valorTxt ? Number(valorTxt.replace(/\./g, "").replace(",", ".")) : null,
      remuneracao: remuneracaoTxt ? Number(remuneracaoTxt.replace(/\./g, "").replace(",", ".")) : null,
      status: String(l.status ?? "Previsão").trim() || "Previsão",
      data_pagamento: dataPagamento && !Number.isNaN(dataPagamento.getTime()) ? dataPagamento : null
    };
  });

  const existentes = await prisma.lancamentos_financiamento.findMany({
    where: { andamento_id: andamentoId },
    select: { id: true }
  });
  const idsEnviados = new Set(linhas.map((l) => l.id).filter((id): id is string => Boolean(id)));
  const idsParaApagar = existentes.filter((e) => !idsEnviados.has(e.id)).map((e) => e.id);

  if (idsParaApagar.length > 0) {
    await prisma.lancamentos_financiamento.deleteMany({ where: { id: { in: idsParaApagar } } });
  }

  for (const l of linhas) {
    if (l.id) {
      await prisma.lancamentos_financiamento
        .update({
          where: { id: l.id },
          data: {
            valor_financiado: l.valor_financiado,
            remuneracao: l.remuneracao,
            status: l.status,
            data_pagamento: l.data_pagamento
          }
        })
        .catch((erro) => registrarEJogarErro({ entidadeTipo: "lancamentos_financiamento", entidadeId: l.id!, acao: "editar", erro }));
    } else {
      await prisma.lancamentos_financiamento
        .create({
          data: {
            andamento_id: andamentoId,
            valor_financiado: l.valor_financiado,
            remuneracao: l.remuneracao,
            status: l.status,
            data_pagamento: l.data_pagamento
          }
        })
        .catch((erro) => registrarEJogarErro({ entidadeTipo: "lancamentos_financiamento", acao: "criar", erro }));
    }
  }

  await logAlteracao({
    entidadeTipo: "lancamentos_financiamento",
    entidadeId: andamentoId,
    acao: "sincronizar",
    dadosDepois: { total: linhas.length }
  });

  revalidatePath(`/financiamento/${andamento.avaliacao_id}`);
  redirect(`/financiamento/${andamento.avaliacao_id}?salvo=1`);
}
