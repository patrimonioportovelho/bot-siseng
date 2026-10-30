"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { notificarModulo } from "@/lib/push";
import { enviarEmail, type EmailAnexo } from "@/lib/email";
import { buscarClienteDuplicado, mensagemClienteDuplicado } from "@/lib/clientes/duplicidade";
import { validarCpfCnpj } from "@/lib/clientes/validacao";
import { montarEnderecoPF } from "@/lib/clientes/endereco";
import { gerarProximoIdCliente } from "@/lib/clientes/id-legado";
import { gerarProximoIdAvaliacao } from "@/lib/avaliacoes/id-legado";
import {
  PERGUNTAS_CREDITO,
  camposFaltandoCredito,
  respostaParaBooleano,
  respostasIncompletas,
  textoDaResposta,
  type ClienteAvaliacao,
  type RespostasCredito
} from "@/lib/financiamento/avaliacao-credito";
import { clienteParaFormulario } from "@/lib/financiamento/avaliacao-credito-servidor";
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
// Ver comentário completo em app/portal/locacao/actions.ts (achado de
// 08/09/2026): 18 MB de anexo estourava o Gmail / o socketTimeout do SMTP na
// função serverless e o e-mail falhava silenciosamente. 7 MB sobe rápido; o
// que passar disso vai só como link assinado de 7 dias no corpo.
const ORCAMENTO_ANEXOS_BYTES = 7 * 1024 * 1024;

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

// Campos do cadastro do cliente a partir do que o corretor digitou — usado tanto
// para criar quanto para atualizar (Avaliação de crédito completa o cadastro).
async function dadosDoCliente(c: ClienteAvaliacaoDigitado) {
  const ehCnpj = c.tipoCliente === "Pessoa Jurídica";
  const dataNasc = c.dataNascimento ? new Date(c.dataNascimento) : null;

  // Endereço estruturado vale pros dois tipos agora — PF ("Endereço") e PJ
  // ("Sede"), mesmo padrão do cadastro de Clientes do admin (19/08/2026,
  // antes PJ usava só texto livre solto em `endereco`).
  const endereco = await montarEnderecoPF({
    rua: c.rua || null,
    nPredial: c.nPredial || null,
    complemento: c.complemento || null,
    bairro: c.bairro || null,
    cidadeId: c.cidadeId || null,
    estadoId: c.estadoId || null
  });

  return {
    nome: c.nome,
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
    cep: digitos(c.cep),
    rua: c.rua || null,
    n_predial: c.nPredial || null,
    complemento: c.complemento || null,
    bairro: c.bairro || null,
    estado_id: c.estadoId || null,
    cidade_id: c.cidadeId || null,
    endereco,
    observacao: c.observacao || null,
    banco_id: c.bancoId || null,
    codigo_banco: c.codigoBanco || null,
    agencia: c.agencia || null,
    conta: c.conta || null,
    tipo_conta: c.tipoConta || null,
    tipo_pix: c.tipoPix || null,
    pix: c.pix || null
  };
}

async function criarClienteCompleto(c: ClienteAvaliacaoDigitado, parceiroId: string) {
  return prisma.clientes.create({
    data: {
      ...(await dadosDoCliente(c)),
      id_legado: await gerarProximoIdCliente(),
      parceiro_id: parceiroId,
      status_cadastro: "Completo"
    }
  });
}

// Respostas das 3 perguntas da Avaliação de crédito ("sim" | "nao" | "").
function parseRespostas(formData: FormData): RespostasCredito {
  const vazio: RespostasCredito = { fgts3Anos: "", maisCompradores: "", primeiroImovel: "" };
  const bruto = texto(formData, "respostasJson");
  if (!bruto) return vazio;
  try {
    const r = JSON.parse(bruto);
    const limpa = (v: unknown) => (v === "sim" || v === "nao" ? v : "");
    return { fgts3Anos: limpa(r?.fgts3Anos), maisCompradores: limpa(r?.maisCompradores), primeiroImovel: limpa(r?.primeiroImovel) };
  } catch {
    return vazio;
  }
}

function dadosDasRespostas(r: RespostasCredito) {
  return {
    credito_fgts_3_anos: respostaParaBooleano(r.fgts3Anos),
    credito_mais_compradores: respostaParaBooleano(r.maisCompradores),
    credito_primeiro_imovel: respostaParaBooleano(r.primeiroImovel)
  };
}

type ClientePreparado =
  | { ok: true; id: string; nome: string; telefone: string | null; cpf: string | null; documento: string }
  | { ok: false; erro: string };

// Valida e grava o cadastro completo do cliente para a Avaliação de crédito:
// cliente novo é criado; cliente já cadastrado (só do próprio corretor) é
// completado com o que veio do formulário.
async function prepararClienteCredito(cliente: ClienteAvaliacaoDigitado, parceiroId: string): Promise<ClientePreparado> {
  const falta = camposFaltandoCredito(cliente);
  if (falta.length > 0) {
    return { ok: false, erro: `Avaliação de crédito exige o cadastro completo. Falta preencher: ${falta.join(", ")}.` };
  }
  const ehCnpj = cliente.tipoCliente === "Pessoa Jurídica";
  const documento = ehCnpj ? cliente.cnpj : cliente.cpf;
  const erroDocumento = validarCpfCnpj(documento);
  if (erroDocumento) return { ok: false, erro: erroDocumento };

  if (cliente.clienteId) {
    const existente = await prisma.clientes.findUnique({ where: { id: cliente.clienteId } });
    if (!existente) {
      return { ok: false, erro: "Cliente selecionado não foi encontrado — atualize a página e tente de novo." };
    }
    if (existente.parceiro_id !== parceiroId) {
      return {
        ok: false,
        erro: "Este cliente está no cadastro de outro corretor — Avaliação de crédito precisa do cadastro completo, então use um cliente seu ou fale com o administrativo."
      };
    }
    const docAtual = ehCnpj ? existente.cnpj : existente.cpf;
    if (digitos(documento) !== (docAtual ?? "")) {
      const duplicado = await buscarClienteDuplicado({ nome: "", cpfCnpj: documento, ignorarIds: [existente.id] });
      if (duplicado) return { ok: false, erro: mensagemClienteDuplicado(duplicado, parceiroId) };
    }
    const atualizado = await prisma.clientes
      .update({
        where: { id: existente.id },
        data: { ...(await dadosDoCliente(cliente)), status_cadastro: "Completo", updated_at: new Date() }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", acao: "completar_via_portal_avaliacao_credito", erro }));
    return { ok: true, id: atualizado.id, nome: atualizado.nome, telefone: atualizado.telefone, cpf: atualizado.cpf, documento };
  }

  const duplicado = await buscarClienteDuplicado({ nome: cliente.nome, cpfCnpj: documento });
  if (duplicado) return { ok: false, erro: mensagemClienteDuplicado(duplicado, parceiroId) };
  const criado = await criarClienteCompleto(cliente, parceiroId).catch((erro) =>
    registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar_via_portal_avaliacao_cpf", erro })
  );
  return { ok: true, id: criado.id, nome: criado.nome, telefone: criado.telefone, cpf: criado.cpf, documento };
}

// Abre a etapa (relógio do quadro de Financiamento) da avaliação, fechando a
// que estivesse aberta. Mesmo registro que o quadro faz ao mover um card.
function escritasEtapa(avaliacaoId: string, coluna: "cpf" | "montagem", etapa: string, parceiroId: string) {
  const agora = new Date();
  return [
    prisma.financiamento_atividades.updateMany({
      where: { avaliacao_id: avaliacaoId, tipo: "etapa", fim: null },
      data: { fim: agora }
    }),
    prisma.financiamento_atividades.create({
      data: { avaliacao_id: avaliacaoId, tipo: "etapa", coluna, etapa, inicio: agora, por_parceiro_id: parceiroId }
    })
  ];
}

// Respostas em HTML para o e-mail do administrativo.
function respostasHtml(r: {
  credito_fgts_3_anos: boolean | null;
  credito_mais_compradores: boolean | null;
  credito_primeiro_imovel: boolean | null;
}): string {
  return PERGUNTAS_CREDITO.map(
    (p) => `<li><strong>${p.pergunta}</strong><br/>${textoDaResposta(p.campo, r[p.campo]) ?? "—"}</li>`
  ).join("");
}

// E-mail ao administrativo (com os documentos anexados de verdade — mesmo
// padrão do Compra e Venda, ver montarAnexosDocumentos). Roda depois da
// resposta ao corretor (after(), do Next.js) — mesmo achado do Compra e Venda
// (ver comentário completo em app/portal/compra-venda/actions.ts): baixar
// anexo do Storage + mandar pelo Gmail no fim da função é que empurrava o
// tempo total pra perto do limite e causava "An unexpected response was
// received from the server." pro corretor, mesmo com a avaliação já salva.
// Falha no envio agora só aparece em Configurações > Erros de cadastro.
function agendarEmailAvaliacao(params: {
  avaliacaoId: string;
  parceiroId: string;
  corretorNome: string;
  introHtml: string;
  clienteNome: string;
  documento: string;
  telefone: string | null;
  respostasLista: string | null;
  documentos: DocumentoEnviado[];
  rodapeHtml: string;
  assunto: string;
}) {
  after(async () => {
    try {
      const linksDocumentosHtml = await montarLinksDocumentos(params.documentos);
      const anexosDocumentos = await montarAnexosDocumentos(params.documentos);

      const html = `
        <div style="font-family: sans-serif; font-size: 14px; color: #1f2937;">
          <p>${params.introHtml}</p>
          <p>
            <strong>Cliente:</strong> ${params.clienteNome}<br/>
            <strong>CPF/CNPJ:</strong> ${params.documento || "—"}<br/>
            <strong>Telefone:</strong> ${params.telefone ?? "—"}<br/>
            <strong>Corretor que cadastrou:</strong> ${params.corretorNome}
          </p>
          ${params.respostasLista ? `<ul style="padding-left:18px;">${params.respostasLista}</ul>` : ""}
          ${linksDocumentosHtml}
          <p style="color:#6b7280; font-size:12px;">${params.rodapeHtml}</p>
        </div>
      `;

      // .trim(): ver comentário igual em app/portal/locacao/actions.ts.
      const destinoEmail = (process.env.EMAIL_ADM_FINANCIAMENTO || "").trim() || EMAIL_DESTINO_PADRAO;

      const resultadoEmail = await enviarEmail({
        to: destinoEmail,
        subject: params.assunto,
        html,
        attachments: anexosDocumentos
      });

      await logAlteracaoPortal({
        parceiroId: params.parceiroId,
        entidadeTipo: "avaliacoes",
        entidadeId: params.avaliacaoId,
        acao: resultadoEmail.ok ? "email_avaliacao_cpf_enviado" : "email_avaliacao_cpf_falhou",
        dadosDepois: {
          para: destinoEmail,
          anexos: anexosDocumentos.length,
          docs_como_link: Math.max(0, params.documentos.length - anexosDocumentos.length),
          erro: resultadoEmail.ok ? undefined : resultadoEmail.erro
        }
      }).catch(() => undefined);

      if (!resultadoEmail.ok) {
        await registrarEJogarErro({
          entidadeTipo: "avaliacoes",
          entidadeId: params.avaliacaoId,
          acao: "enviar_email_avaliacao_cpf",
          erro: new Error(resultadoEmail.erro)
        }).catch(() => undefined);
      }
    } catch (erroEmail) {
      await registrarEJogarErro({
        entidadeTipo: "avaliacoes",
        entidadeId: params.avaliacaoId,
        acao: "enviar_email_avaliacao_cpf",
        erro: erroEmail instanceof Error ? erroEmail : new Error(String(erroEmail))
      }).catch(() => undefined);
    }
  });
}

// Cadastro completo de um cliente do próprio corretor, para preencher o
// formulário da Avaliação de crédito (que exige identificação e contato).
export async function carregarClienteParaCreditoAction(
  clienteId: string
): Promise<{ ok: true; cliente: ClienteAvaliacao } | { ok: false; erro: string }> {
  const session = await requirePortalSession();
  const c = await prisma.clientes.findUnique({ where: { id: clienteId } });
  if (!c) return { ok: false, erro: "Cliente não encontrado." };
  if (c.parceiro_id !== session.parceiroId) {
    return {
      ok: false,
      erro: "Este cliente está no cadastro de outro corretor. Para Avaliação de crédito use um cliente seu ou fale com o administrativo."
    };
  }
  return { ok: true, cliente: clienteParaFormulario(c) };
}

// Avaliação cadastrada pelo corretor. Duas modalidades:
//  - "consulta" (Consulta de CPF): é a mesma "Consulta de CPF" que já existe no
//    módulo Financiamento do administrativo (lib/financiamento/opcoes.ts), só
//    que com uma porta de entrada pelo portal. Entra com status "Consulta de
//    CPF" e SEM tipo_avaliacao — quem decide a finalidade (Financiamento,
//    Análise de crédito, Locação) e dá seguimento é o administrativo.
//  - "credito" (Avaliação de crédito, 30/10/2026): exige o cadastro completo do
//    cliente (identificação e contato) e as 3 perguntas, e a etiqueta já nasce
//    em "Montagem de processo".
export async function criarAvaliacaoCpfAction(
  formData: FormData
): Promise<{ ok: true; avaliacaoId: string } | { ok: false; erro: string }> {
  const session = await requirePortalSession();

  try {
    const modalidade = texto(formData, "modalidade") === "credito" ? "credito" : "consulta";
    const credito = modalidade === "credito";
    const cliente = parseCliente(formData);
    if (!cliente || (!cliente.clienteId && !cliente.nome)) {
      return { ok: false, erro: "Preencha o cadastro do cliente." };
    }
    const respostas = parseRespostas(formData);

    const ehCnpj = cliente.tipoCliente === "Pessoa Jurídica";
    let documentoDigitado = ehCnpj ? cliente.cnpj : cliente.cpf;

    let clienteId: string;
    let clienteNome: string;
    let clienteTelefone: string | null;
    let clienteCpf: string | null;

    if (credito) {
      if (respostasIncompletas(respostas)) {
        return { ok: false, erro: "Responda as 3 perguntas da Avaliação de crédito antes de enviar." };
      }
      const preparado = await prepararClienteCredito(cliente, session.parceiroId);
      if (!preparado.ok) return preparado;
      clienteId = preparado.id;
      clienteNome = preparado.nome;
      clienteTelefone = preparado.telefone;
      clienteCpf = preparado.cpf;
      documentoDigitado = preparado.documento;
    } else {
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
          return { ok: false, erro: mensagemClienteDuplicado(duplicado, session.parceiroId) };
        }
        const criado = await criarClienteCompleto(cliente, session.parceiroId).catch((erro) =>
          registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar_via_portal_avaliacao_cpf", erro })
        );
        clienteId = criado.id;
        clienteNome = criado.nome;
        clienteTelefone = criado.telefone;
        clienteCpf = criado.cpf;
      }
    }

    const idLegado = await gerarProximoIdAvaliacao();
    const statusInicial = credito ? "Montagem de processo" : "Consulta de CPF";

    const novaAvaliacao = await prisma.avaliacoes
      .create({
        data: {
          id_legado: idLegado,
          status: statusInicial,
          data_avaliacao: data(formData, "data_avaliacao") ?? new Date(),
          cliente_id: clienteId,
          telefone: clienteTelefone,
          cpf: clienteCpf,
          parceiro_id: session.parceiroId,
          observacao: credito
            ? "Avaliação de crédito cadastrada pelo corretor via portal — cliente quer comprar imóvel."
            : "Cadastrado pelo corretor via portal — cliente quer comprar imóvel.",
          criado_no_portal: true,
          ...(credito ? dadosDasRespostas(respostas) : {})
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "avaliacoes", acao: "criar_via_portal_avaliacao_cpf", erro }));

    // Relógio do quadro desde o primeiro minuto (sem isso o quadro estimaria
    // o início pela data da avaliação).
    await prisma
      .$transaction(escritasEtapa(novaAvaliacao.id, credito ? "montagem" : "cpf", statusInicial, session.parceiroId))
      .catch(() => undefined);

    await logAlteracaoPortal({
      parceiroId: session.parceiroId,
      entidadeTipo: "avaliacoes",
      entidadeId: novaAvaliacao.id,
      acao: credito ? "criar_avaliacao_credito" : "criar_avaliacao_cpf",
      dadosDepois: {
        cliente_id: clienteId,
        status: novaAvaliacao.status,
        ...(credito ? dadosDasRespostas(respostas) : {})
      }
    });

    // Aviso na tela para a equipe (quem ativou os avisos do portal).
    after(() =>
      notificarModulo({
        modulo: "portal",
        titulo: credito ? "Portal · Nova avaliação de crédito" : "Portal · Nova consulta de CPF",
        corpo: `${clienteNome} · cadastrada por ${session.nome}`,
        url: `/financiamento/${novaAvaliacao.id}/etiqueta`,
        tag: `portal-avaliacao-${novaAvaliacao.id}`
      })
    );

    agendarEmailAvaliacao({
      avaliacaoId: novaAvaliacao.id,
      parceiroId: session.parceiroId,
      corretorNome: session.nome,
      introHtml: credito
        ? "Nova <strong>Avaliação de crédito</strong> cadastrada pelo portal do corretor — cliente quer comprar imóvel. A etiqueta já está em <strong>Montagem de processo</strong>."
        : "Nova <strong>Avaliação de CPF</strong> cadastrada pelo portal do corretor — cliente quer comprar imóvel.",
      clienteNome,
      documento: documentoDigitado || clienteCpf || "",
      telefone: clienteTelefone,
      respostasLista: credito ? respostasHtml(dadosDasRespostas(respostas)) : null,
      documentos: parseDocumentos(formData),
      rodapeHtml: credito
        ? "As respostas também estão na ficha da avaliação, no módulo Financiamento. Defina a finalidade e dê seguimento."
        : "Defina a finalidade (Financiamento, Análise de crédito ou Locação) e dê seguimento no módulo Financiamento.",
      assunto: credito ? `Avaliação de crédito — ${clienteNome}` : `Avaliação de CPF — ${clienteNome}`
    });

    return { ok: true, avaliacaoId: novaAvaliacao.id };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: mensagem };
  }
}

// O corretor primeiro consulta o CPF e, depois, transforma a consulta em
// Avaliação de crédito: completa o cadastro, responde as 3 perguntas e a
// etiqueta passa de "Consulta de CPF" para "Montagem de processo".
export async function converterEmAvaliacaoCreditoAction(
  avaliacaoId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const session = await requirePortalSession();

  try {
    const avaliacao = await prisma.avaliacoes.findUnique({
      where: { id: avaliacaoId },
      select: { id: true, status: true, excluido: true, parceiro_id: true, cliente_id: true }
    });
    if (!avaliacao || avaliacao.excluido || avaliacao.parceiro_id !== session.parceiroId) {
      return { ok: false, erro: "Avaliação não encontrada." };
    }
    if (avaliacao.status !== "Consulta de CPF") {
      return { ok: false, erro: "Só uma Consulta de CPF pode ser transformada em Avaliação de crédito." };
    }

    const cliente = parseCliente(formData);
    if (!cliente || !cliente.clienteId || cliente.clienteId !== avaliacao.cliente_id) {
      return { ok: false, erro: "Cadastro do cliente inválido — volte e abra a avaliação de novo." };
    }
    const respostas = parseRespostas(formData);
    if (respostasIncompletas(respostas)) {
      return { ok: false, erro: "Responda as 3 perguntas da Avaliação de crédito antes de enviar." };
    }

    const preparado = await prepararClienteCredito(cliente, session.parceiroId);
    if (!preparado.ok) return preparado;

    const agora = new Date();
    const respostasDados = dadosDasRespostas(respostas);
    await prisma
      .$transaction([
        prisma.avaliacoes.update({
          where: { id: avaliacaoId },
          data: {
            status: "Montagem de processo",
            telefone: preparado.telefone,
            cpf: preparado.cpf,
            ...respostasDados,
            updated_at: agora
          }
        }),
        ...escritasEtapa(avaliacaoId, "montagem", "Montagem de processo", session.parceiroId)
      ])
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "avaliacoes", entidadeId: avaliacaoId, acao: "converter_avaliacao_credito", erro }));

    await logAlteracaoPortal({
      parceiroId: session.parceiroId,
      entidadeTipo: "avaliacoes",
      entidadeId: avaliacaoId,
      acao: "converter_avaliacao_credito",
      dadosAntes: { status: avaliacao.status },
      dadosDepois: { status: "Montagem de processo", ...respostasDados }
    });

    after(() =>
      notificarModulo({
        modulo: "portal",
        titulo: "Portal · Consulta virou avaliação de crédito",
        corpo: `${preparado.nome} · por ${session.nome} · agora em Montagem de processo`,
        url: `/financiamento/${avaliacaoId}/etiqueta`,
        tag: `portal-avaliacao-${avaliacaoId}`
      })
    );

    agendarEmailAvaliacao({
      avaliacaoId,
      parceiroId: session.parceiroId,
      corretorNome: session.nome,
      introHtml:
        "A <strong>Consulta de CPF</strong> abaixo foi transformada em <strong>Avaliação de crédito</strong> pelo corretor. A etiqueta passou para <strong>Montagem de processo</strong>.",
      clienteNome: preparado.nome,
      documento: preparado.documento,
      telefone: preparado.telefone,
      respostasLista: respostasHtml(respostasDados),
      documentos: parseDocumentos(formData),
      rodapeHtml: "As respostas também estão na ficha da avaliação, no módulo Financiamento.",
      assunto: `Avaliação de crédito (de consulta) — ${preparado.nome}`
    });

    revalidatePath("/financiamento");
    revalidatePath("/portal/avaliacao-cpf");
    return { ok: true };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: mensagem };
  }
}
