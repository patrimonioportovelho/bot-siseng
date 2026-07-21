"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireAdm, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { buscarClienteDuplicado } from "@/lib/clientes/duplicidade";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// Telefone é digitado com máscara ((xx) xxxxx-xxxx) mas gravado só com
// dígitos, no mesmo formato já usado no restante da base.
function telefoneDigitos(formData: FormData, campo: string): string | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = t.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

// CPF/CNPJ são digitados com máscara mas gravados só com dígitos.
function digitos(formData: FormData, campo: string): string | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = t.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

function rendaBruta(formData: FormData, campo: string): number | null {
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

function camposEditaveis(formData: FormData) {
  return {
    tipo_cliente: texto(formData, "tipo_cliente") ?? undefined,
    sexo: texto(formData, "sexo"),
    cpf: digitos(formData, "cpf"),
    cnpj: digitos(formData, "cnpj"),
    rg: texto(formData, "rg"),
    expedicao: texto(formData, "expedicao"),
    telefone: telefoneDigitos(formData, "telefone"),
    email: texto(formData, "email"),
    estado_civil: texto(formData, "estado_civil"),
    renda_bruta: rendaBruta(formData, "renda_bruta"),
    data_nascimento: data(formData, "data_nascimento"),
    cat_profissao: texto(formData, "cat_profissao"),
    tipo_servidor: texto(formData, "tipo_servidor"),
    profissao: texto(formData, "profissao"),
    endereco: texto(formData, "endereco"),
    observacao: texto(formData, "observacao"),
    parceiro_id: texto(formData, "parceiro_id"),
    loja_id: texto(formData, "loja_id"),
    banco_id: texto(formData, "banco_id"),
    codigo_banco: texto(formData, "codigo_banco"),
    agencia: texto(formData, "agencia"),
    conta: texto(formData, "conta"),
    tipo_conta: texto(formData, "tipo_conta"),
    tipo_pix: texto(formData, "tipo_pix"),
    pix: texto(formData, "pix"),
    updated_at: new Date()
  };
}

// Resultado padrão das actions de formulário grande do admin: em vez de
// `throw new Error(...)` (que derruba a página inteira pro error boundary e
// APAGA tudo que estava digitado — era a raiz do "toda vez perdemos
// cadastro"), a action devolve { erro } e o formulário mostra a mensagem
// inline, com os campos intactos. O registro no logs_erro continua igual:
// registrarEJogarErro grava ANTES de lançar, e aqui o catch só transforma o
// throw em retorno — nenhum erro deixa de ficar registrado.
// `duplicado: true` acompanha o erro quando o bloqueio foi a checagem de
// cliente repetido — o formulário usa isso pra mostrar a opção "criar mesmo
// assim" (só faz sentido nesse caso).
export type ResultadoFormulario = { erro: string; duplicado?: boolean } | undefined;

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export async function criarClienteAction(_prev: unknown, formData: FormData): Promise<ResultadoFormulario> {
  await requireAdminSession();

  const nome = texto(formData, "nome");
  const tipoCliente = texto(formData, "tipo_cliente");
  if (!nome || !tipoCliente) {
    return { erro: "Nome e tipo de cliente são obrigatórios." };
  }

  // Mesma checagem de duplicidade que o portal do corretor já faz — o admin
  // era o único caminho que criava cliente sem conferir nada (e a auditoria
  // achou 19 CPFs e 27 nomes duplicados na base). Diferente do portal, aqui
  // o admin PODE decidir criar mesmo assim (homônimo de verdade): marcando o
  // checkbox "criar mesmo assim" que o formulário mostra junto do aviso.
  const criarMesmoAssim = formData.get("criar_mesmo_assim") === "on";
  if (!criarMesmoAssim) {
    const duplicado = await buscarClienteDuplicado({
      nome,
      cpfCnpj: texto(formData, "cpf") ?? texto(formData, "cnpj")
    });
    if (duplicado) {
      const dono = duplicado.parceiroNome ? ` (parceiro responsável: ${duplicado.parceiroNome})` : "";
      return {
        erro: `Já existe um cliente chamado "${duplicado.nome}"${dono} — confira se não é a mesma pessoa antes de cadastrar de novo.`,
        duplicado: true
      };
    }
  }

  let novoId: string;
  try {
    const novo = await prisma.clientes
      .create({
        data: {
          nome,
          ...camposEditaveis(formData),
          tipo_cliente: tipoCliente
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar", erro }));

    await logAlteracao({
      entidadeTipo: "clientes",
      entidadeId: novo.id,
      acao: "criar",
      dadosDepois: { nome: novo.nome, tipo_cliente: novo.tipo_cliente }
    });
    novoId = novo.id;
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }

  revalidatePath("/clientes");
  redirect(`/clientes/${novoId}?salvo=1`);
}

export async function atualizarClienteAction(_prev: unknown, formData: FormData): Promise<ResultadoFormulario> {
  await requireAdminSession();

  const id = texto(formData, "clienteId");
  if (!id) return { erro: "Cliente inválido." };

  const antes = await prisma.clientes.findUnique({ where: { id } });
  if (!antes) return { erro: "Cliente não encontrado." };

  try {
    const depois = await prisma.clientes
      .update({
        where: { id },
        data: camposEditaveis(formData)
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", entidadeId: id, acao: "editar", erro }));

    await logAlteracao({
      entidadeTipo: "clientes",
      entidadeId: id,
      acao: "editar",
      dadosAntes: antes,
      dadosDepois: depois
    });
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }

  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  // Ver mesmo comentário em app/imoveis/actions.ts: preserva ?embed=1 no
  // redirect quando salvo pelo painel lateral embutido num iframe.
  const embutido = texto(formData, "_embed") === "1";
  redirect(`/clientes/${id}?salvo=1${embutido ? "&embed=1" : ""}`);
}

// "Apagar" aqui é sempre um soft-delete: reaproveita o valor "Arquivado" já
// existente em status_cadastro (não precisou de coluna nova) — o cliente
// costuma ter histórico real vinculado (imóveis, transações, avaliações) e
// um DELETE de verdade quebraria essas referências. Só ADM pode fazer isso.
export async function apagarClienteAction(formData: FormData) {
  const admin = await requireAdm();

  const id = texto(formData, "clienteId");
  if (!id) throw new Error("Cliente inválido.");

  const antes = await prisma.clientes.findUnique({ where: { id } });
  if (!antes) throw new Error("Cliente não encontrado.");

  await prisma.clientes.update({
    where: { id },
    data: { status_cadastro: "Arquivado", updated_at: new Date() }
  });

  await logAlteracao({
    entidadeTipo: "clientes",
    entidadeId: id,
    acao: "excluir",
    dadosAntes: { status_cadastro: antes.status_cadastro },
    dadosDepois: { status_cadastro: "Arquivado", excluido_por: admin.nome }
  });

  revalidatePath("/clientes");
  redirect("/clientes?excluido=1");
}
