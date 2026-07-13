"use server";

import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
import { gerarDocumento } from "@/lib/documentos/gerar";
import { registrarEJogarErro } from "@/lib/erros";
import { buscarClienteDuplicado, mensagemClienteDuplicado } from "@/lib/clientes/duplicidade";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function digitos(valor: string | null): string | null {
  if (!valor) return null;
  const d = valor.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Um cliente do formulário — ou já cadastrado deste corretor (clienteId
// presente, reaproveitado sem edição), ou novo (digitado na hora). Mesmo
// padrão do formulário de Contrato de Gestão, mas só um cliente por
// proposta (o template não tem bloco de assinaturas adicionais).
type ClienteDigitado = {
  clienteId?: string;
  nome: string;
  cpfCnpj: string;
  endereco: string;
  estadoCivil: string;
};

function parseCliente(formData: FormData): ClienteDigitado | null {
  const bruto = texto(formData, "clienteJson");
  if (!bruto) return null;
  try {
    const c = JSON.parse(bruto);
    const cliente: ClienteDigitado = {
      clienteId: typeof c?.clienteId === "string" && c.clienteId.length > 0 ? c.clienteId : undefined,
      nome: String(c?.nome ?? "").trim(),
      cpfCnpj: String(c?.cpfCnpj ?? "").trim(),
      endereco: String(c?.endereco ?? "").trim(),
      estadoCivil: String(c?.estadoCivil ?? "").trim()
    };
    return cliente.clienteId || cliente.nome.length > 0 ? cliente : null;
  } catch {
    return null;
  }
}

// Uma condição de pagamento digitada no formulário — mesmos campos de
// condicoes_pagamento (transação de Compra e Venda), mas aqui NUNCA vira
// registro na tabela: a proposta não é uma transação de verdade, só junta
// tudo numa linha de texto pro {{FormaPagamento}} do documento.
type CondicaoDigitada = {
  tipo: string;
  valor: string;
  forma_pagamento: string;
  parcelas: string;
  momento: string;
  data_pagamento: string;
};

function parseCondicoes(formData: FormData): CondicaoDigitada[] {
  const bruto = texto(formData, "condicoesJson");
  if (!bruto) return [];
  try {
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista.map((c) => ({
      tipo: String(c?.tipo ?? "").trim(),
      valor: String(c?.valor ?? "").trim(),
      forma_pagamento: String(c?.forma_pagamento ?? "").trim(),
      parcelas: String(c?.parcelas ?? "").trim(),
      momento: String(c?.momento ?? "").trim(),
      data_pagamento: String(c?.data_pagamento ?? "").trim()
    }));
  } catch {
    return [];
  }
}

function dataCurtaTexto(t: string): string {
  if (!t) return "";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Mesma linha de condição de pagamento do contrato de compra e venda
// (linhaCondicaoPagamento em lib/documentos/gerar.ts), só que operando
// direto sobre o que o corretor digitou no formulário (não sobre um
// registro condicoes_pagamento de verdade).
function linhaCondicaoDigitada(c: CondicaoDigitada): string {
  const valorNum = c.valor ? valorEditavelParaDecimal(c.valor) : null;
  const partes = [
    `${c.tipo || "Parcela"}: R$ ${(valorNum ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    c.parcelas ? `em ${c.parcelas}x` : null,
    c.forma_pagamento ? `forma de pagamento ${c.forma_pagamento}` : null,
    c.momento ? `no momento ${c.momento}` : null,
    c.data_pagamento ? `com vencimento em ${dataCurtaTexto(c.data_pagamento)}` : null
  ].filter((p): p is string => Boolean(p));
  return partes.join(", ");
}

// Gera a Proposta de Compra e Venda a partir do formulário do portal:
// reaproveita o cliente já cadastrado quando escolhido (evita duplicar),
// cria um novo se for o caso, grava a proposta (imóvel só em texto — NUNCA
// vira registro de `imoveis`, já que geralmente é sobre imóvel externo, sem
// proprietário na base) e gera o .docx.
export async function gerarPropostaAction(
  formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  const session = await requirePortalSession();

  try {
    const clienteForm = parseCliente(formData);
    if (!clienteForm) {
      return { ok: false, erro: "Informe o cliente (comprador/interessado) da proposta." };
    }

    const descricao = texto(formData, "descricao");
    const rua = texto(formData, "rua");
    const numero = texto(formData, "numero");
    const complemento = texto(formData, "complemento");
    const bairro = texto(formData, "bairro");
    const cidade = texto(formData, "cidade");
    const estado = texto(formData, "estado");
    const dataFechamento = data(formData, "data_fechamento") ?? new Date();

    const valorProposta = (() => {
      const t = texto(formData, "valor_proposta");
      return t ? valorEditavelParaDecimal(t) : null;
    })();
    if (!valorProposta) {
      return { ok: false, erro: "Informe o valor da proposta." };
    }

    const condicoes = parseCondicoes(formData);
    const formaPagamento = condicoes.map(linhaCondicaoDigitada).join("\n");

    let cliente: Awaited<ReturnType<typeof prisma.clientes.findFirst>>;
    if (clienteForm.clienteId) {
      cliente = await prisma.clientes.findFirst({
        where: { id: clienteForm.clienteId, parceiro_id: session.parceiroId }
      });
      if (!cliente) {
        return { ok: false, erro: "O cliente selecionado não pertence ao seu cadastro." };
      }
    } else {
      // Mesma checagem do Contrato de Gestão: a lista de "cliente já
      // cadastrado" só mostra os clientes do próprio corretor, então sem
      // isso seria fácil duplicar sem querer o cadastro que outro corretor
      // já fez pro mesmo cliente. Quem decide se transfere é o
      // administrativo, não o corretor digitando por cima.
      const duplicado = await buscarClienteDuplicado({ nome: clienteForm.nome, cpfCnpj: clienteForm.cpfCnpj });
      if (duplicado) {
        return { ok: false, erro: mensagemClienteDuplicado(duplicado) };
      }

      const doc = digitos(clienteForm.cpfCnpj);
      const ehCnpj = (doc?.length ?? 0) === 14;
      cliente = await prisma.clientes
        .create({
          data: {
            nome: clienteForm.nome,
            tipo_cliente: ehCnpj ? "Pessoa Jurídica" : "Pessoa Física",
            cpf: !ehCnpj ? doc : null,
            cnpj: ehCnpj ? doc : null,
            endereco: clienteForm.endereco || null,
            estado_civil: clienteForm.estadoCivil || null,
            parceiro_id: session.parceiroId
          }
        })
        .catch((erro: unknown) => registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar_via_portal_proposta", erro }));
    }

    const proposta = await prisma.propostas
      .create({
        data: {
          parceiro_id: session.parceiroId,
          cliente_id: cliente.id,
          descricao,
          rua,
          numero,
          complemento,
          bairro,
          cidade,
          estado,
          valor_proposta: valorProposta,
          forma_pagamento: formaPagamento || null,
          data_fechamento: dataFechamento
        }
      })
      .catch((erro: unknown) => registrarEJogarErro({ entidadeTipo: "propostas", acao: "criar_via_portal", erro }));

    const url = await gerarDocumento({
      tipoDocumento: "proposta_compra_venda",
      entidadeTipo: "proposta",
      entidadeId: proposta.id
    });

    await logAlteracaoPortal({
      parceiroId: session.parceiroId,
      entidadeTipo: "propostas",
      entidadeId: proposta.id,
      acao: "gerar_proposta_compra_venda",
      dadosDepois: { cliente: cliente.nome, valor: String(valorProposta), url }
    });

    return { ok: true, url };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: mensagem };
  }
}
