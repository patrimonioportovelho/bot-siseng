"use server";

import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { enviarEmail, type EmailAnexo } from "@/lib/email";
import { buscarClienteDuplicado, mensagemClienteDuplicado } from "@/lib/clientes/duplicidade";
import { criarUploadAssinadoDocumento, criarLinkDownloadDocumento, baixarDocumentoPortal } from "@/lib/supabase-admin";

const EMAIL_DESTINO_PADRAO = "engimob@remax.com.br";

// Mesmo esquema de upload direto pro Supabase Storage do Compra e Venda (ver
// app/portal/compra-venda/actions.ts) — a Vercel tem limite fixo de 4,5MB
// por requisição de função, documento escaneado ou foto de celular estoura
// isso fácil. O navegador pede essa URL assinada (chamada pequena, só o
// nome do arquivo) e sobe o arquivo direto pro Supabase, sem passar por
// nenhuma Server Action de cadastro.
export async function prepararUploadDocumentoAvaliacaoAction(
  nomeArquivo: string
): Promise<{ ok: true; caminho: string; token: string } | { ok: false; erro: string }> {
  await requirePortalSession();
  try {
    const { caminho, token } = await criarUploadAssinadoDocumento(nomeArquivo);
    return { ok: true, caminho, token };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

type DocumentoEnviado = { caminho: string; nomeOriginal: string };

function parseDocumentos(formData: FormData): DocumentoEnviado[] {
  const bruto = texto(formData, "documentosJson");
  if (!bruto) return [];
  try {
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista
      .map((d) => ({
        caminho: String(d?.caminho ?? "").trim(),
        nomeOriginal: String(d?.nomeOriginal ?? "").trim() || "documento"
      }))
      .filter((d) => d.caminho.length > 0);
  } catch {
    return [];
  }
}

async function montarLinksDocumentos(documentos: DocumentoEnviado[]): Promise<string> {
  if (documentos.length === 0) {
    return "<p>Nenhum documento foi anexado no cadastro — cobrar do corretor se precisar.</p>";
  }
  const links = await Promise.all(
    documentos.map(async (d) => {
      const url = await criarLinkDownloadDocumento(d.caminho);
      return url ? `<li><a href="${url}">${d.nomeOriginal}</a></li>` : `<li>${d.nomeOriginal} (link indisponível)</li>`;
    })
  );
  return `<p>${documentos.length} documento(s) anexado(s) — link válido por 7 dias:</p><ul>${links.join("")}</ul>`;
}

// Mesmo orçamento de anexo real usado no Compra e Venda (ver comentário lá):
// 18MB de bytes crus cabe com folga nos 25MB que o Gmail aceita por
// mensagem, mesmo depois da inflação de ~33% do base64.
const ORCAMENTO_ANEXOS_BYTES = 18 * 1024 * 1024;

async function montarAnexosDocumentos(documentos: DocumentoEnviado[]): Promise<EmailAnexo[]> {
  const anexos: EmailAnexo[] = [];
  let usado = 0;
  for (const d of documentos) {
    const conteudo = await baixarDocumentoPortal(d.caminho);
    if (!conteudo) continue;
    if (usado + conteudo.length > ORCAMENTO_ANEXOS_BYTES) continue;
    anexos.push({ filename: d.nomeOriginal, content: conteudo });
    usado += conteudo.length;
  }
  return anexos;
}

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

// O cliente da Avaliação de CPF — cadastro COMPLETO (não só nome+CPF como o
// resto do portal usa pra comprador/vendedor): é assim porque, se o
// administrativo vai rodar uma avaliação de crédito de verdade, precisa de
// renda, profissão, estado civil etc. desde o início, não só depois. Mesma
// ideia do cadastro completo do admin (ver components/cliente-form.tsx).
type ClienteAvaliacaoDigitado = {
  clienteId?: string;
  tipoCliente: string;
  nome: string;
  sexo: string;
  cpf: string;
  cnpj: string;
  rg: string;
  expedicao: string;
  telefone: string;
  email: string;
  estadoCivil: string;
  dataNascimento: string;
  catProfissao: string;
  tipoServidor: string;
  profissao: string;
  rendaBruta: string;
  endereco: string;
  observacao: string;
  bancoId: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  tipoPix: string;
  pix: string;
};

function parseCliente(formData: FormData): ClienteAvaliacaoDigitado | null {
  const bruto = texto(formData, "clienteJson");
  if (!bruto) return null;
  try {
    const c = JSON.parse(bruto);
    return {
      clienteId: typeof c?.clienteId === "string" && c.clienteId.length > 0 ? c.clienteId : undefined,
      tipoCliente: String(c?.tipoCliente ?? "Pessoa Física").trim() || "Pessoa Física",
      nome: String(c?.nome ?? "").trim(),
      sexo: String(c?.sexo ?? "").trim(),
      cpf: String(c?.cpf ?? "").trim(),
      cnpj: String(c?.cnpj ?? "").trim(),
      rg: String(c?.rg ?? "").trim(),
      expedicao: String(c?.expedicao ?? "").trim(),
      telefone: String(c?.telefone ?? "").trim(),
      email: String(c?.email ?? "").trim(),
      estadoCivil: String(c?.estadoCivil ?? "").trim(),
      dataNascimento: String(c?.dataNascimento ?? "").trim(),
      catProfissao: String(c?.catProfissao ?? "").trim(),
      tipoServidor: String(c?.tipoServidor ?? "").trim(),
      profissao: String(c?.profissao ?? "").trim(),
      rendaBruta: String(c?.rendaBruta ?? "").trim(),
      endereco: String(c?.endereco ?? "").trim(),
      observacao: String(c?.observacao ?? "").trim(),
      bancoId: String(c?.bancoId ?? "").trim(),
      codigoBanco: String(c?.codigoBanco ?? "").trim(),
      agencia: String(c?.agencia ?? "").trim(),
      conta: String(c?.conta ?? "").trim(),
      tipoConta: String(c?.tipoConta ?? "").trim(),
      tipoPix: String(c?.tipoPix ?? "").trim(),
      pix: String(c?.pix ?? "").trim()
    };
  } catch {
    return null;
  }
}

async function criarClienteCompleto(c: ClienteAvaliacaoDigitado, parceiroId: string) {
  const ehCnpj = c.tipoCliente === "Pessoa Jurídica";
  const dataNasc = c.dataNascimento ? new Date(c.dataNascimento) : null;
  return prisma.clientes.create({
    data: {
      nome: c.nome,
      tipo_cliente: c.tipoCliente,
      sexo: !ehCnpj ? c.sexo || null : null,
      cpf: !ehCnpj ? digitos(c.cpf) : null,
      cnpj: ehCnpj ? digitos(c.cnpj) : null,
      rg: c.rg || null,
      expedicao: c.expedicao || null,
      telefone: digitos(c.telefone),
      email: c.email || null,
      estado_civil: c.estadoCivil || null,
      data_nascimento: dataNasc && !Number.isNaN(dataNasc.getTime()) ? dataNasc : null,
      cat_profissao: c.catProfissao || null,
      tipo_servidor: c.tipoServidor || null,
      profissao: c.profissao || null,
      renda_bruta: c.rendaBruta ? valorEditavelParaDecimal(c.rendaBruta) : null,
      endereco: c.endereco || null,
      observacao: c.observacao || null,
      banco_id: c.bancoId || null,
      codigo_banco: c.codigoBanco || null,
      agencia: c.agencia || null,
      conta: c.conta || null,
      tipo_conta: c.tipoConta || null,
      tipo_pix: c.tipoPix || null,
      pix: c.pix || null,
      parceiro_id: parceiroId,
      status_cadastro: "Completo"
    }
  });
}

// Avaliação de CPF cadastrada pelo corretor — é a mesma "Consulta de CPF" que
// já existe no módulo Financiamento do administrativo (lib/financiamento/opcoes.ts),
// só que agora tem uma porta de entrada pelo portal. Entra sempre com status
// "Consulta de CPF" e SEM tipo_avaliacao definido — quem decide a finalidade
// (Financiamento, Análise de crédito, Locação) e dá seguimento é o
// administrativo, que já vê isso na tela /financiamento assim que salva.
export async function criarAvaliacaoCpfAction(
  formData: FormData
): Promise<
  | { ok: true; avaliacaoId: string; emailEnviado: boolean; emailErro?: string }
  | { ok: false; erro: string }
> {
  const session = await requirePortalSession();

  try {
    const cliente = parseCliente(formData);
    if (!cliente || (!cliente.clienteId && !cliente.nome)) {
      return { ok: false, erro: "Preencha o cadastro do cliente." };
    }

    const ehCnpj = cliente.tipoCliente === "Pessoa Jurídica";
    const documentoDigitado = ehCnpj ? cliente.cnpj : cliente.cpf;
    if (!cliente.clienteId && (!cliente.nome || !documentoDigitado)) {
      return {
        ok: false,
        erro: `Avaliação de CPF precisa do nome completo e do ${ehCnpj ? "CNPJ" : "CPF"} do cliente preenchidos.`
      };
    }

    let clienteId: string;
    let clienteNome: string;
    let clienteTelefone: string | null;
    let clienteCpf: string | null;

    if (cliente.clienteId) {
      const existente = await prisma.clientes.findUnique({ where: { id: cliente.clienteId } });
      if (!existente) {
        return { ok: false, erro: "Cliente selecionado não foi encontrado — atualize a página e tente de novo." };
      }
      clienteId = existente.id;
      clienteNome = existente.nome;
      clienteTelefone = existente.telefone;
      clienteCpf = existente.cpf;
    } else {
      const duplicado = await buscarClienteDuplicado({ nome: cliente.nome, cpfCnpj: documentoDigitado });
      if (duplicado) {
        return { ok: false, erro: mensagemClienteDuplicado(duplicado) };
      }
      const criado = await criarClienteCompleto(cliente, session.parceiroId).catch((erro) =>
        registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar_via_portal_avaliacao_cpf", erro })
      );
      clienteId = criado.id;
      clienteNome = criado.nome;
      clienteTelefone = criado.telefone;
      clienteCpf = criado.cpf;
    }

    const novaAvaliacao = await prisma.avaliacoes
      .create({
        data: {
          status: "Consulta de CPF",
          data_avaliacao: data(formData, "data_avaliacao") ?? new Date(),
          cliente_id: clienteId,
          telefone: clienteTelefone,
          cpf: clienteCpf,
          parceiro_id: session.parceiroId,
          observacao: "Cadastrado pelo corretor via portal — cliente quer comprar imóvel.",
          criado_no_portal: true
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "avaliacoes", acao: "criar_via_portal_avaliacao_cpf", erro }));

    await logAlteracaoPortal({
      parceiroId: session.parceiroId,
      entidadeTipo: "avaliacoes",
      entidadeId: novaAvaliacao.id,
      acao: "criar_avaliacao_cpf",
      dadosDepois: { cliente_id: clienteId, status: novaAvaliacao.status }
    });

    // Email pro administrativo, com os documentos do cliente anexados de
    // verdade (mesmo padrão do Compra e Venda — ver montarAnexosDocumentos).
    // Best-effort: se o envio falhar, a avaliação já está salva do mesmo
    // jeito, só avisa o corretor pra reportar por outro canal.
    const documentosEnviados = parseDocumentos(formData);
    const linksDocumentosHtml = await montarLinksDocumentos(documentosEnviados);
    const anexosDocumentos = await montarAnexosDocumentos(documentosEnviados);

    const html = `
      <div style="font-family: sans-serif; font-size: 14px; color: #1f2937;">
        <p>Nova <strong>Avaliação de CPF</strong> cadastrada pelo portal do corretor — cliente quer comprar imóvel.</p>
        <p>
          <strong>Cliente:</strong> ${clienteNome}<br/>
          <strong>CPF/CNPJ:</strong> ${documentoDigitado || clienteCpf || "—"}<br/>
          <strong>Telefone:</strong> ${clienteTelefone ?? "—"}<br/>
          <strong>Corretor que cadastrou:</strong> ${session.nome}
        </p>
        ${linksDocumentosHtml}
        <p style="color:#6b7280; font-size:12px;">
          Defina a finalidade (Financiamento, Análise de crédito ou Locação) e dê seguimento no módulo Financiamento.
        </p>
      </div>
    `;

    const resultadoEmail = await enviarEmail({
      to: process.env.EMAIL_ADM_FINANCIAMENTO || EMAIL_DESTINO_PADRAO,
      subject: `Avaliação de CPF — ${clienteNome}`,
      html,
      attachments: anexosDocumentos
    });

    if (!resultadoEmail.ok) {
      await registrarEJogarErro({
        entidadeTipo: "avaliacoes",
        entidadeId: novaAvaliacao.id,
        acao: "enviar_email_avaliacao_cpf",
        erro: new Error(resultadoEmail.erro)
      }).catch(() => undefined);
    }

    return {
      ok: true,
      avaliacaoId: novaAvaliacao.id,
      emailEnviado: resultadoEmail.ok,
      emailErro: resultadoEmail.ok ? undefined : resultadoEmail.erro
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: mensagem };
  }
}
