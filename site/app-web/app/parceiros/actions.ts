"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireAdm, logAlteracao } from "@/lib/auth";
import { percentualParaDecimal } from "@/lib/format";
import { FUNCOES_EQUIPE } from "@/lib/parceiros/opcoes";
import { registrarEJogarErro } from "@/lib/erros";
import { montarEnderecoPF } from "@/lib/clientes/endereco";
import { buscarParceiroDuplicado, mensagemParceiroDuplicado } from "@/lib/parceiros/duplicidade";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// Telefone e CPF são digitados com máscara mas gravados só com dígitos, no
// mesmo formato já usado no restante da base.
function somenteDigitos(formData: FormData, campo: string): string | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = t.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

function decimal(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Campos de comissionamento são exibidos como percentual (22,5) mas gravados
// como fração decimal (0.225), no mesmo formato já usado na base.
function percentual(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return percentualParaDecimal(t);
}

function inteiro(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "" (não perguntado) vira NULL, "true"/"false" viram booleano de verdade —
// usado no campo uniao_estavel (só existe quando estado_civil pede).
function booleanoTri(formData: FormData, campo: string): boolean | null {
  const v = formData.get(campo);
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

// Endereço do parceiro é sempre concatenado a partir dos campos divididos
// (CEP/rua/número/complemento/bairro/cidade/estado) — mesmo padrão de
// app/clientes/actions.ts#montarEnderecoCliente (pessoa física), reaproveitando
// o mesmo helper compartilhado (lib/clientes/endereco.ts#montarEnderecoPF).
// Quando nenhum campo do endereço dividido foi preenchido (cadastro antigo,
// aberto pra editar outra coisa sem mexer no endereço), devolve `undefined` —
// o Prisma não inclui `endereco` no update e o texto livre antigo continua
// intacto, em vez de ser apagado sem querer.
async function montarEnderecoParceiro(formData: FormData): Promise<string | null | undefined> {
  const rua = texto(formData, "rua");
  const nPredial = texto(formData, "n_predial");
  const complemento = texto(formData, "complemento");
  const bairro = texto(formData, "bairro");
  const cidadeId = texto(formData, "cidade_id");
  const estadoId = texto(formData, "estado_id");

  if (!rua && !nPredial && !complemento && !bairro && !cidadeId && !estadoId) {
    return undefined;
  }

  return montarEnderecoPF({ rua, nPredial, complemento, bairro, cidadeId, estadoId });
}

// Campos que qualquer parceiro autenticado pode editar em um cadastro já
// existente. Nome fica de fora de propósito: é a âncora de identidade usada
// no login (nome + CPF) e só muda via aprovação de acesso em Configurações
// — nunca por este formulário, nem por ADM. CPF, a pedido do ADM, passou a
// ser editável por aqui (era protegido antes) — atenção: mudar o CPF de um
// parceiro que já usa o portal muda o que ele precisa digitar pra entrar.
async function camposEditaveis(formData: FormData) {
  return {
    cpf: somenteDigitos(formData, "cpf"),
    telefone: somenteDigitos(formData, "telefone"),
    email: texto(formData, "email"),
    empresa: texto(formData, "empresa"),
    funcao: texto(formData, "funcao") ?? undefined,
    loja_id: texto(formData, "loja_id"),
    status_funcao: texto(formData, "status_funcao") ?? undefined,
    data_nascimento: data(formData, "data_nascimento"),
    identidade: texto(formData, "identidade"),
    expedicao_estado: texto(formData, "expedicao_estado"),
    estado_civil: texto(formData, "estado_civil"),
    uniao_estavel: booleanoTri(formData, "uniao_estavel"),
    creci: texto(formData, "creci"),
    cep: somenteDigitos(formData, "cep"),
    rua: texto(formData, "rua"),
    n_predial: texto(formData, "n_predial"),
    complemento: texto(formData, "complemento"),
    bairro: texto(formData, "bairro"),
    estado_id: texto(formData, "estado_id"),
    cidade_id: texto(formData, "cidade_id"),
    endereco: await montarEnderecoParceiro(formData),
    data_entrada: data(formData, "data_entrada"),
    data_saida: data(formData, "data_saida"),
    obs_funcao: texto(formData, "obs_funcao"),
    fee: decimal(formData, "fee"),
    porc_proprietario: percentual(formData, "porc_proprietario"),
    porc_interessado: percentual(formData, "porc_interessado"),
    dia_fee: inteiro(formData, "dia_fee"),
    banco_id: texto(formData, "banco_id"),
    codigo_banco: texto(formData, "codigo_banco"),
    agencia: texto(formData, "agencia"),
    conta: texto(formData, "conta"),
    tipo_conta: texto(formData, "tipo_conta"),
    tipo_pix: texto(formData, "tipo_pix"),
    pix: texto(formData, "pix"),
    link_drive: texto(formData, "link_drive"),
    updated_at: new Date()
  };
}

// Mesmo padrão de app/clientes/actions.ts: retorna { erro } em vez de dar
// throw, pra não derrubar a página inteira (com o formulário preenchido
// junto) quando o problema é uma validação esperada — só bug de verdade
// continua indo pro catch/registrarEJogarErro. `duplicado: true` acompanha
// o erro quando o bloqueio foi a checagem de nome+CPF repetido — o
// formulário usa isso pra mostrar a opção "cadastrar mesmo assim".
export type ResultadoFormulario = { erro: string; duplicado?: boolean } | undefined;

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export async function criarParceiroAction(_prev: unknown, formData: FormData): Promise<ResultadoFormulario> {
  await requireAdminSession();

  const nome = texto(formData, "nome");
  const funcao = texto(formData, "funcao");
  if (!nome || !funcao) {
    return { erro: "Nome e função são obrigatórios." };
  }

  // Loja obrigatória em todo cadastro novo (pedido do usuário em
  // 01/08/2026) — dá suporte ao filtro de loja no Topbar. Cadastro já
  // existente sem loja continua editável normalmente (reforçado só pelo
  // `required` no <select>, mesmo padrão de Transações/Administrações).
  if (!texto(formData, "loja_id")) {
    return { erro: "Loja é obrigatória." };
  }

  // Bloqueia cadastro repetido: mesmo nome E mesmo CPF já cadastrados em
  // outro parceiro (ver lib/parceiros/duplicidade.ts — homônimo sem o CPF
  // bater não é bloqueado, só quando os dois coincidem). ADM pode decidir
  // cadastrar mesmo assim marcando a opção que o formulário mostra.
  const cadastrarMesmoAssim = formData.get("cadastrar_mesmo_assim") === "on";
  if (!cadastrarMesmoAssim) {
    const duplicado = await buscarParceiroDuplicado({ nome, cpf: texto(formData, "cpf") });
    if (duplicado) {
      return { erro: mensagemParceiroDuplicado(duplicado), duplicado: true };
    }
  }

  let novo: { id: string; nome: string; funcao: string };
  try {
    novo = await prisma.parceiros
      .create({
        data: {
          nome,
          ...(await camposEditaveis(formData)),
          funcao
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "parceiros", acao: "criar", erro }));
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }

  await logAlteracao({
    entidadeTipo: "parceiros",
    entidadeId: novo.id,
    acao: "criar",
    dadosDepois: { nome: novo.nome, funcao: novo.funcao }
  });

  revalidatePath("/parceiros");
  redirect(`/parceiros/${novo.id}?salvo=1`);
}

export async function atualizarParceiroAction(_prev: unknown, formData: FormData): Promise<ResultadoFormulario> {
  await requireAdminSession();

  const id = texto(formData, "parceiroId");
  if (!id) return { erro: "Parceiro inválido." };

  const antes = await prisma.parceiros.findUnique({ where: { id } });
  if (!antes) return { erro: "Parceiro não encontrado." };

  const campos = await camposEditaveis(formData);

  // Quando Administrativo/Corretor/Corretor Estagiário muda para Inativo, a
  // função sai automaticamente da equipe: vira Corretor Externo se tiver
  // CRECI (continua atuando de forma externa) ou Desligado se não tiver.
  // A data de saída, se ainda não informada, é preenchida com a data de hoje.
  const funcaoAtual = campos.funcao ?? antes.funcao;
  if (campos.status_funcao === "Inativo" && FUNCOES_EQUIPE.includes(funcaoAtual)) {
    const creciAtual = campos.creci ?? antes.creci;
    campos.funcao = creciAtual ? "Corretor Externo" : "Desligado";
    if (!campos.data_saida && !antes.data_saida) {
      campos.data_saida = new Date();
    }
  }

  let depois: unknown;
  try {
    depois = await prisma.parceiros
      .update({
        where: { id },
        data: campos
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "parceiros", entidadeId: id, acao: "editar", erro }));
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }

  await logAlteracao({
    entidadeTipo: "parceiros",
    entidadeId: id,
    acao: "editar",
    dadosAntes: antes,
    dadosDepois: depois
  });

  revalidatePath(`/parceiros/${id}`);
  revalidatePath("/parceiros");
  redirect(`/parceiros/${id}?salvo=1`);
}

// "Apagar" aqui é sempre um soft-delete (status_funcao = Excluído): a maior
// parte dos parceiros tem histórico real vinculado (imóveis, transações,
// pagamentos...) e um DELETE de verdade quebraria essas referências. Só ADM
// pode fazer isso.
export async function apagarParceiroAction(formData: FormData) {
  const admin = await requireAdm();

  const id = texto(formData, "parceiroId");
  if (!id) throw new Error("Parceiro inválido.");

  const antes = await prisma.parceiros.findUnique({ where: { id } });
  if (!antes) throw new Error("Parceiro não encontrado.");

  await prisma.parceiros.update({
    where: { id },
    data: { status_funcao: "Excluído", updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "parceiros",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { status_funcao: antes.status_funcao },
    dadosDepois: { status_funcao: "Excluído", excluido_por: admin.nome }
  });

  revalidatePath("/parceiros");
  redirect("/parceiros?excluido=1");
}
