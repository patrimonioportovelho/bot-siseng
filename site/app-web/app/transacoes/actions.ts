"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireAdm, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal, percentualParaDecimal } from "@/lib/format";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function inteiro(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function valorMonetario(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return valorEditavelParaDecimal(t);
}

function percentual(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return percentualParaDecimal(t);
}

function booleano(formData: FormData, campo: string): boolean {
  return formData.get(campo) === "on" || formData.get(campo) === "true";
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Id sequencial só para transações novas cadastradas pelo site — os
// registros importados da planilha legada usam um id_legado curto (hash),
// sem esse padrão. Prefixo diferente por tipo (LOC-/CV-) pra dar pra
// reconhecer de cara no rótulo, mesmo padrão do ADM- em administrações.
async function gerarProximoId(tipo: string): Promise<string> {
  const prefixo = tipo === "Locação" ? "LOC-" : "CV-";
  const registros = await prisma.transacoes.findMany({
    where: { id_legado: { startsWith: prefixo } },
    select: { id_legado: true }
  });

  let maior = 0;
  for (const r of registros) {
    const n = Number(r.id_legado?.replace(prefixo, ""));
    if (Number.isFinite(n) && n > maior) maior = n;
  }

  return `${prefixo}${String(maior + 1).padStart(4, "0")}`;
}

// O Cliente Proprietário de uma transação não é escolhido no formulário —
// vem direto do(s) proprietário(s) já cadastrados no Imóvel (o primeiro da
// lista, mesma regra usada nos dados bancários do contrato de
// administração). Se o imóvel não tiver proprietário nenhum, bloqueia:
// não dá pra qualificar a parte vendedora/locadora sem isso.
async function proprietarioDoImovel(imovelId: string): Promise<string> {
  const primeiro = await prisma.imoveis_proprietarios.findFirst({
    where: { imovel_id: imovelId },
    orderBy: { ordem: "asc" },
    select: { cliente_id: true }
  });
  if (!primeiro) {
    throw new Error(
      "O imóvel selecionado não tem nenhum proprietário cadastrado — adicione ao menos um em Imóveis antes de criar a transação."
    );
  }
  return primeiro.cliente_id;
}

function camposEditaveis(formData: FormData) {
  return {
    status: texto(formData, "status"),
    adm_imovel_id: texto(formData, "adm_imovel_id"),
    garantia: texto(formData, "garantia"),
    valor_caucao: valorMonetario(formData, "valor_caucao"),
    pg_caucao: texto(formData, "pg_caucao"),
    data_assinatura: data(formData, "data_assinatura"),
    data_vencimento: data(formData, "data_vencimento"),
    dia_vencimento: inteiro(formData, "dia_vencimento"),
    prazo_contrato_meses: inteiro(formData, "prazo_contrato_meses"),
    tem_parceria: booleano(formData, "tem_parceria"),
    porc_parceria: percentual(formData, "porc_parceria"),
    parceiro_externo_id: texto(formData, "parceiro_externo_id"),
    corretor_proprietario_id: texto(formData, "corretor_proprietario_id"),
    corretor_contraparte_id: texto(formData, "corretor_contraparte_id"),
    status_honorario: texto(formData, "status_honorario") ?? "Pendente",
    valor_transacao: valorMonetario(formData, "valor_transacao") ?? 0,
    porc_honorario: percentual(formData, "porc_honorario") ?? 0,
    porc_corretor_proprietario: percentual(formData, "porc_corretor_proprietario") ?? 0,
    porc_corretor_contraparte: percentual(formData, "porc_corretor_contraparte") ?? 0,
    porc_imobiliaria: percentual(formData, "porc_imobiliaria") ?? 0,
    encargos: formData.getAll("encargos").map((v) => String(v)),
    forma_pagamento: texto(formData, "forma_pagamento"),
    finalidade_locacao: texto(formData, "finalidade_locacao"),
    chave: texto(formData, "chave"),
    tem_vistoria: booleano(formData, "tem_vistoria"),
    arquivo_vistoria_url: texto(formData, "arquivo_vistoria_url"),
    observacao: texto(formData, "observacao"),
    pasta_url: texto(formData, "pasta_url"),
    updated_at: new Date()
  };
}

// O(s) Cliente(s) Interessado(s) (comprador/locatário) pode ser mais de um
// — mesma lógica dos proprietários de Imóvel. cliente_contraparte_id
// continua guardando o primeiro da lista, pra compatibilidade com o resto
// do sistema (relatórios, filtros antigos etc.).
async function sincronizarInteressados(transacaoId: string, formData: FormData) {
  const ids = formData
    .getAll("interessado_id")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  await prisma.$transaction([
    prisma.transacoes_contrapartes.deleteMany({ where: { transacao_id: transacaoId } }),
    ...(ids.length > 0
      ? [
          prisma.transacoes_contrapartes.createMany({
            data: ids.map((clienteId, ordem) => ({ transacao_id: transacaoId, cliente_id: clienteId, ordem }))
          })
        ]
      : [])
  ]);
}

// Condições de pagamento (o "negócio": entrada, saldo financiado, parcelado,
// permuta etc.) — o formulário manda a lista inteira serializada em JSON num
// campo hidden só, aqui apaga tudo e recria (mesmo padrão dos Interessados).
// Linha sem valor numérico válido é descartada (valor é NOT NULL na tabela).
async function sincronizarCondicoesPagamento(transacaoId: string, formData: FormData) {
  const bruto = texto(formData, "condicoes_pagamento_json");
  let lista: Array<Record<string, unknown>> = [];
  if (bruto) {
    try {
      const parsed = JSON.parse(bruto);
      if (Array.isArray(parsed)) lista = parsed;
    } catch {
      lista = [];
    }
  }

  const linhas = lista
    .map((c) => {
      const valor = valorEditavelParaDecimal(String(c.valor ?? "").trim());
      const parcelasTxt = String(c.parcelas ?? "").trim();
      const parcelasNum = parcelasTxt ? Number(parcelasTxt) : NaN;
      const dataTxt = String(c.data_pagamento ?? "").trim();
      const dataPagamento = dataTxt ? new Date(dataTxt) : null;
      return {
        tipo: String(c.tipo ?? "").trim() || null,
        valor,
        forma_pagamento: String(c.forma_pagamento ?? "").trim() || null,
        parcelas: Number.isFinite(parcelasNum) ? Math.trunc(parcelasNum) : null,
        momento: String(c.momento ?? "").trim() || null,
        data_pagamento: dataPagamento && !Number.isNaN(dataPagamento.getTime()) ? dataPagamento : null,
        descricao: String(c.descricao ?? "").trim() || null
      };
    })
    .filter((c): c is typeof c & { valor: number } => c.valor !== null);

  await prisma.$transaction([
    prisma.condicoes_pagamento.deleteMany({ where: { transacao_id: transacaoId } }),
    ...(linhas.length > 0
      ? [
          prisma.condicoes_pagamento.createMany({
            data: linhas.map((c) => ({ transacao_id: transacaoId, ...c }))
          })
        ]
      : [])
  ]);
}

export async function criarTransacaoAction(formData: FormData) {
  await requireAdminSession();

  const tipo = texto(formData, "tipo");
  const lojaId = texto(formData, "loja_id");
  const imovelId = texto(formData, "imovel_id");
  const interessadosIds = formData
    .getAll("interessado_id")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  if (!tipo || !lojaId || !imovelId) {
    throw new Error("Tipo, Loja e Imóvel são obrigatórios.");
  }
  if (interessadosIds.length === 0) {
    throw new Error("Adicione ao menos um Cliente Interessado.");
  }

  const clienteId = await proprietarioDoImovel(imovelId);
  const idLegado = await gerarProximoId(tipo);

  const novo = await prisma.transacoes.create({
    data: {
      ...camposEditaveis(formData),
      tipo,
      loja_id: lojaId,
      imovel_id: imovelId,
      cliente_id: clienteId,
      cliente_contraparte_id: interessadosIds[0],
      id_legado: idLegado
    }
  });

  await sincronizarInteressados(novo.id, formData);
  await sincronizarCondicoesPagamento(novo.id, formData);

  await logAlteracao({
    entidadeTipo: "transacoes",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { id_legado: novo.id_legado, tipo: novo.tipo, status: novo.status }
  });

  revalidatePath("/transacoes/locacao");
  revalidatePath("/transacoes/venda");
  redirect(`/transacoes/${novo.id}?salvo=1`);
}

export async function atualizarTransacaoAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "transacaoId");
  if (!id) throw new Error("Transação inválida.");

  const imovelId = texto(formData, "imovel_id");
  if (!imovelId) throw new Error("Imóvel é obrigatório.");

  const interessadosIds = formData
    .getAll("interessado_id")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);
  if (interessadosIds.length === 0) {
    throw new Error("Adicione ao menos um Cliente Interessado.");
  }

  const antes = await prisma.transacoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Transação não encontrada.");

  const clienteId = await proprietarioDoImovel(imovelId);

  const depois = await prisma.transacoes.update({
    where: { id },
    data: {
      ...camposEditaveis(formData),
      imovel_id: imovelId,
      cliente_id: clienteId,
      cliente_contraparte_id: interessadosIds[0]
    }
  });

  await sincronizarInteressados(id, formData);
  await sincronizarCondicoesPagamento(id, formData);

  await logAlteracao({
    entidadeTipo: "transacoes",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/transacoes/${id}`);
  revalidatePath("/transacoes/locacao");
  revalidatePath("/transacoes/venda");
  redirect(`/transacoes/${id}?salvo=1`);
}

// Ação enxuta usada só para o select de troca rápida de status dentro da
// tela de Administração.
export async function atualizarStatusTransacaoAction(formData: FormData) {
  await requireAdminSession();

  const id = formData.get("transacaoId");
  const status = formData.get("status");
  const admImovelId = formData.get("admImovelId");
  if (typeof id !== "string" || typeof status !== "string" || !id || !status) {
    throw new Error("Transação ou status inválido.");
  }

  const antes = await prisma.transacoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Transação não encontrada.");

  const depois = await prisma.transacoes.update({
    where: { id },
    data: { status, updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "transacoes",
    entidadeId: id,
    acao: "editar",
    dadosAntes: { status: antes.status },
    dadosDepois: { status: depois.status }
  });

  if (typeof admImovelId === "string" && admImovelId) {
    revalidatePath(`/administracoes/${admImovelId}`);
  }
  revalidatePath("/transacoes/locacao");
  revalidatePath("/transacoes/venda");
}

// "Apagar" aqui é sempre um soft-delete (excluido=true) — a transação
// costuma ter histórico real vinculado (pagamentos, movimentações,
// documentos já gerados) e um DELETE de verdade quebraria essas
// referências. Só ADM pode fazer isso.
export async function apagarTransacaoAction(formData: FormData) {
  const admin = await requireAdm();

  const id = texto(formData, "transacaoId");
  if (!id) throw new Error("Transação inválida.");

  const antes = await prisma.transacoes.findUnique({ where: { id } });
  if (!antes) throw new Error("Transação não encontrada.");

  await prisma.transacoes.update({
    where: { id },
    data: { excluido: true, updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "transacoes",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { status: antes.status },
    dadosDepois: { excluido: true, excluido_por: admin.nome }
  });

  revalidatePath(antes.tipo === "Locação" ? "/transacoes/locacao" : "/transacoes/venda");
  redirect(`${antes.tipo === "Locação" ? "/transacoes/locacao" : "/transacoes/venda"}?excluido=1`);
}
