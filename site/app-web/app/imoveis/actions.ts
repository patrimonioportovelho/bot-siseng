"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireAdm, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function valorMonetario(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return valorEditavelParaDecimal(t);
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Inscrição imobiliária tem formato fixo de 14 dígitos, mas registros antigos
// da planilha às vezes só têm uma anotação em texto livre (ex.: "sem
// inscrição", "Lote 30 quadra 4"). Só reduz a só-dígitos quando o valor
// digitado já fecha em 14 dígitos — caso contrário mantém o texto como foi
// digitado, sem forçar um formato que não existe.
function inscricaoValor(formData: FormData, campo: string): string | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = t.replace(/\D/g, "");
  return d.length === 14 ? d : t;
}

// Endereço é sempre concatenado a partir de rua/número/complemento/bairro/
// cidade/estado — não é um campo digitado à parte no formulário.
async function montarEndereco(formData: FormData): Promise<string | null> {
  const rua = texto(formData, "rua");
  const nPredial = texto(formData, "n_predial");
  const complemento = texto(formData, "complemento");
  const bairro = texto(formData, "bairro");
  const cidadeId = texto(formData, "cidade_id");
  const estadoId = texto(formData, "estado_id");

  const [cidade, estado] = await Promise.all([
    cidadeId ? prisma.cidades.findUnique({ where: { id: cidadeId } }) : Promise.resolve(null),
    estadoId ? prisma.estados.findUnique({ where: { id: estadoId } }) : Promise.resolve(null)
  ]);

  const partes = [
    [rua, nPredial].filter(Boolean).join(", ") || null,
    complemento,
    bairro,
    cidade?.nome ?? null,
    estado?.nome ?? null
  ].filter((p): p is string => Boolean(p));

  return partes.length > 0 ? partes.join(" - ") : null;
}

async function camposEditaveis(formData: FormData) {
  return {
    tipo_imovel: texto(formData, "tipo_imovel"),
    status_imovel: texto(formData, "status_imovel"),
    tipo_oferta: texto(formData, "tipo_oferta"),
    inscricao: inscricaoValor(formData, "inscricao"),
    matricula: texto(formData, "matricula"),
    pasta_url: texto(formData, "pasta_url"),
    rua: texto(formData, "rua"),
    n_predial: texto(formData, "n_predial"),
    complemento: texto(formData, "complemento"),
    bairro: texto(formData, "bairro"),
    estado_id: texto(formData, "estado_id"),
    cidade_id: texto(formData, "cidade_id"),
    endereco: await montarEndereco(formData),
    parceiro_id: texto(formData, "parceiro_id"),
    valor_venda: valorMonetario(formData, "valor_venda"),
    valor_avaliacao: valorMonetario(formData, "valor_avaliacao"),
    validade_avaliacao: data(formData, "validade_avaliacao"),
    descricao: texto(formData, "descricao"),
    updated_at: new Date()
  };
}

// Um imóvel pode ter mais de um proprietário (ex.: herdeiros) — a lista vem
// do formulário como vários campos "proprietario_id" repetidos. Sincroniza
// a tabela imoveis_proprietarios apagando os vínculos atuais e recriando na
// ordem em que foram adicionados no formulário (ordem usada no contrato).
async function sincronizarProprietarios(imovelId: string, formData: FormData) {
  const ids = formData
    .getAll("proprietario_id")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  await prisma.$transaction([
    prisma.imoveis_proprietarios.deleteMany({ where: { imovel_id: imovelId } }),
    ...(ids.length > 0
      ? [
          prisma.imoveis_proprietarios.createMany({
            data: ids.map((clienteId, ordem) => ({ imovel_id: imovelId, cliente_id: clienteId, ordem }))
          })
        ]
      : [])
  ]);
}

export async function criarImovelAction(formData: FormData) {
  await requireAdminSession();

  const novo = await prisma.imoveis
    .create({
      data: await camposEditaveis(formData)
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "imoveis", acao: "criar", erro }));

  await sincronizarProprietarios(novo.id, formData);

  await logAlteracao({
    entidadeTipo: "imoveis",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { endereco: novo.endereco, tipo_imovel: novo.tipo_imovel }
  });

  revalidatePath("/imoveis");
  redirect(`/imoveis/${novo.id}?salvo=1`);
}

export async function atualizarImovelAction(formData: FormData) {
  await requireAdminSession();

  const id = texto(formData, "imovelId");
  if (!id) throw new Error("Imóvel inválido.");

  const antes = await prisma.imoveis.findUnique({ where: { id } });
  if (!antes) throw new Error("Imóvel não encontrado.");

  const depois = await prisma.imoveis
    .update({
      where: { id },
      data: await camposEditaveis(formData)
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "imoveis", entidadeId: id, acao: "editar", erro }));

  await sincronizarProprietarios(id, formData);

  await logAlteracao({
    entidadeTipo: "imoveis",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/imoveis/${id}`);
  revalidatePath("/imoveis");
  // Salvo pelo painel lateral (drawer) embutido num iframe — mantém o
  // ?embed=1 no redirect pra não perder o menu/Topbar escondidos (ver
  // components/app-shell.tsx) depois de salvar.
  const embutido = texto(formData, "_embed") === "1";
  redirect(`/imoveis/${id}?salvo=1${embutido ? "&embed=1" : ""}`);
}

// "Apagar" aqui é sempre um soft-delete (excluido=true) — o imóvel costuma
// ter histórico real vinculado (administrações, transações, avaliações) e
// um DELETE de verdade quebraria essas referências. Só ADM pode fazer isso.
export async function apagarImovelAction(formData: FormData) {
  const admin = await requireAdm();

  const id = texto(formData, "imovelId");
  if (!id) throw new Error("Imóvel inválido.");

  const antes = await prisma.imoveis.findUnique({ where: { id } });
  if (!antes) throw new Error("Imóvel não encontrado.");

  await prisma.imoveis.update({
    where: { id },
    data: { excluido: true, updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "imoveis",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { status_imovel: antes.status_imovel },
    dadosDepois: { excluido: true, excluido_por: admin.nome }
  });

  revalidatePath("/imoveis");
  redirect("/imoveis?excluido=1");
}
