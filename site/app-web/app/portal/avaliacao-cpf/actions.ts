"use server";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { enviarEmail, type EmailAnexo } from "@/lib/email";
import { buscarClienteDuplicado, mensagemClienteDuplicado } from "@/lib/clientes/duplicidade";
import { validarCpfCnpj } from "@/lib/clientes/validacao";
import { montarEnderecoPF } from "@/lib/clientes/endereco";
import { gerarProximoIdCliente } from "@/lib/clientes/id-legado";
import { gerarProximoIdAvaliacao } from "@/lib/avaliacoes/id-legado";
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
  nomeMae: string;
  nomePai: string;
  estadoCivil: string;
  uniaoEstavel: string;
  dataNascimento: string;
  catProfissao: string;
  tipoServidor: string;
  profissao: string;
  rendaBruta: string;
  endereco: string;
  cep: string;
  rua: string;
  nPredial: string;
  complemento: string;
  bairro: string;
  estadoId: string;
  cidadeId: string;
  observacao: string;
  bancoId: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  tipoPix: string;
  pix: string;
};

// "" (não perguntado) vira NULL, "true"/"false" viram booleano de verdade —
// usado no campo uniao_estavel (só existe quando estado_civil pede).
function booleanoTri(v: string): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

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
      nomeMae: String(c?.nomeMae ?? "").trim(),
      nomePai: String(c?.nomePai ?? "").trim(),
      estadoCivil: String(c?.estadoCivil ?? "").trim(),
      uniaoEstavel: String(c?.uniaoEstavel ?? "").trim(),
      dataNascimento: String(c?.dataNascimento ?? "").trim(),
      catProfissao: String(c?.catProfissao ?? "").trim(),
      tipoServidor: String(c?.tipoServidor ?? "").trim(),
      profissao: String(c?.profissao ?? "").trim(),
      rendaBruta: String(c?.rendaBruta ?? "").trim(),
      endereco: String(c?.endereco ?? "").trim(),
      cep: String(c?.cep ?? "").trim(),
      rua: String(c?.rua ?? "").trim(),
      nPredial: String(c?.nPredial ?? "").trim(),
      complemento: String(c?.complemento ?? "").trim(),
      bairro: String(c?.bairro ?? "").trim(),
      estadoId: String(c?.estadoId ?? "").trim(),
      cidadeId: String(c?.cidadeId ?? "").trim(),
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

  const endereco = ehCnpj
    ? c.endereco || null
    : await montarEnderecoPF({
        rua: c.rua || null,
        nPredial: c.nPredial || null,
        complemento: c.complemento || null,
        bairro: c.bairro || null,
        cidadeId: c.cidadeId || null,
        estadoId: c.estadoId || null
      });

  return prisma.clientes.create({
    data: {
      nome: c.nome,
      id_legado: await gerarProximoIdCliente(),
      tipo_cliente: c.tipoCliente,
      sexo: !ehCnpj ? c.sexo || null : null,
      cpf: !ehCnpj ? digitos(c.cpf) : null,
      cnpj: ehCnpj ? digitos(c.cnpj) : null,
      rg: !ehCnpj ? c.rg || null : null,
      expedicao: !ehCnpj ? c.expedicao || null : null,
      nome_mae: !ehCnpj ? c.nomeMae || null : null,
      nome_pai: !ehCnpj ? c.nomePai || null : null,
      telefone: digitos(c.telefone),
      email: c.email || null,
      estado_civil: !ehCnpj ? c.estadoCivil || null : null,
      uniao_estavel: !ehCnpj ? booleanoTri(c.uniaoEstavel) : null,
      data_nascimento: dataNasc && !Number.isNaN(dataNasc.getTime()) ? dataNasc : null,
      cat_profissao: c.catProfissao || null,
      tipo_servidor: c.tipoServidor || null,
      profissao: c.profissao || null,
      renda_bruta: c.rendaBruta ? valorEditavelParaDecimal(c.rendaBruta) : null,
      cep: !ehCnpj ? digitos(c.cep) : null,
      rua: !ehCnpj ? c.rua || null : null,
      n_predial: !ehCnpj ? c.nPredial || null : null,
      complemento: !ehCnpj ? c.complemento || null : null,
      bairro: !ehCnpj ? c.bairro || null : null,
      estado_id: !ehCnpj ? c.estadoId || null : null,
      cidade_id: !ehCnpj ? c.cidadeId || null : null,
      endereco,
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
): Promise<{ ok: true; avaliacaoId: string } | { ok: false; erro: string }> {
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

    // Sexo (PF) e Telefone também obrigatórios — pedido do usuário
    // (09/08/2026, "alinhamento do cadastro de cliente em todos os pontos de
    // entrada"). Nome/CPF/CNPJ já checados acima.
    if (!cliente.clienteId) {
      if (!ehCnpj && !cliente.sexo) {
        return { ok: false, erro: "Informe o sexo do cliente." };
      }
      if (!cliente.telefone) {
        return { ok: false, erro: "Informe o telefone do cliente." };
      }
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
      const erroDocumento = documentoDigitado ? validarCpfCnpj(documentoDigitado) : null;
      if (erroDocumento) return { ok: false, erro: erroDocumento };

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

    const idLegado = await gerarProximoIdAvaliacao();

    const novaAvaliacao = await prisma.avaliacoes
      .create({
        data: {
          id_legado: idLegado,
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
    // Movido pra depois da resposta ao corretor (after(), do Next.js) — mesmo
    // achado do Compra e Venda (ver comentário completo em
    // app/portal/compra-venda/actions.ts): baixar anexo do Storage + mandar
    // pelo Gmail no fim da função é que empurrava o tempo total pra perto do
    // limite e causava "An unexpected response was received from the
    // server." pro corretor, mesmo com a avaliação já salva. Falha no envio
    // agora só aparece em Configurações > Erros de cadastro.
    const documentosEnviados = parseDocumentos(formData);

    after(async () => {
      try {
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
      } catch (erroEmail) {
        await registrarEJogarErro({
          entidadeTipo: "avaliacoes",
          entidadeId: novaAvaliacao.id,
          acao: "enviar_email_avaliacao_cpf",
          erro: erroEmail instanceof Error ? erroEmail : new Error(String(erroEmail))
        }).catch(() => undefined);
      }
    });

    return { ok: true, avaliacaoId: novaAvaliacao.id };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: mensagem };
  }
}
