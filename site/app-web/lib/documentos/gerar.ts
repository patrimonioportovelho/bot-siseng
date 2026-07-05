import fs from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import type { TipoDocumento } from "./campos";
import { valorPorExtenso, dataPorExtenso, formatarCpf } from "./extenso";
import { formatTelefone } from "@/lib/format";

// Nome do arquivo .docx (com o timbrado já formatado) que corresponde a cada
// tipo de documento. Os arquivos ficam em site/app-web/templates/ — ver
// templates/README.md para como criar/editar cada um.
const ARQUIVO_TEMPLATE: Record<TipoDocumento, string> = {
  contrato_locacao: "contrato_locacao.docx",
  contrato_compra_venda: "contrato_compra_venda.docx",
  carta_preferencia: "carta_preferencia.docx",
  contrato_administracao: "contrato_administracao.docx",
  contrato_associacao_corretor: "contrato_associacao_corretor.docx",
  termo_entrega_chaves: "termo_entrega_chaves.docx",
  recibo_honorarios: "recibo_honorarios.docx",
  repasse_administracao: "repasse_administracao.docx",
  repasse_primeira_locacao: "repasse_primeira_locacao.docx"
};

// Contrato de associação do corretor tem duas versões conforme a função do
// parceiro: Corretor (contrato normal) e Corretor Estagiário (contrato de
// estágio). O template do estagiário ainda precisa ser adicionado em
// site/app-web/templates/ (e no bucket "templates" do Supabase Storage em
// produção) — até lá, gerar o documento para um Corretor Estagiário falha
// com um erro claro dizendo qual arquivo falta.
const ARQUIVO_TEMPLATE_CORRETOR_ESTAGIARIO = "contrato_associacao_corretor_estagiario.docx";

// Resolve qual arquivo .docx usar. Só contrato_associacao_corretor varia
// conforme o registro (função do parceiro); os demais são fixos por tipo.
async function resolverArquivoTemplate(tipoDocumento: TipoDocumento, entidadeId: string): Promise<string> {
  if (tipoDocumento === "contrato_associacao_corretor") {
    const p = await prisma.parceiros.findUnique({ where: { id: entidadeId }, select: { funcao: true } });
    if (p?.funcao === "Corretor Estagiário") return ARQUIVO_TEMPLATE_CORRETOR_ESTAGIARIO;
  }
  return ARQUIVO_TEMPLATE[tipoDocumento];
}

// URL do serviço de conversão docx -> PDF (Gotenberg rodando no Railway).
// Ex.: DOCUMENT_CONVERTER_URL=https://gotenberg-production.up.railway.app
// Se não estiver configurado, o motor devolve o .docx preenchido sem converter,
// para não travar o desenvolvimento local antes de o serviço existir.
const DOCUMENT_CONVERTER_URL = process.env.DOCUMENT_CONVERTER_URL;

function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type GerarDocumentoParams = {
  tipoDocumento: TipoDocumento;
  entidadeTipo: "transacao" | "adm_imovel" | "cont_corretor" | "parceiro" | "chaves" | "movimentacao" | "gestao";
  entidadeId: string;
  usuarioId?: string;
};

// Qual entidadeTipo cada modelo de documento espera (usado pela tela de
// geração em Configurações para saber que tipo de registro buscar).
export const ENTIDADE_POR_DOCUMENTO: Record<TipoDocumento, GerarDocumentoParams["entidadeTipo"]> = {
  contrato_locacao: "transacao",
  contrato_compra_venda: "transacao",
  carta_preferencia: "gestao",
  contrato_administracao: "adm_imovel",
  contrato_associacao_corretor: "cont_corretor",
  termo_entrega_chaves: "chaves",
  recibo_honorarios: "movimentacao",
  repasse_administracao: "movimentacao",
  repasse_primeira_locacao: "movimentacao"
};

export async function gerarDocumento(params: GerarDocumentoParams): Promise<string> {
  const { tipoDocumento, entidadeTipo, entidadeId, usuarioId } = params;

  try {
    const dados = await montarDadosDoMerge(tipoDocumento, entidadeId);
    const nomeArquivo = await resolverArquivoTemplate(tipoDocumento, entidadeId);
    const docxBuffer = await preencherTemplate(nomeArquivo, dados);
    const arquivoFinal = DOCUMENT_CONVERTER_URL
      ? await converterParaPdf(docxBuffer)
      : { buffer: docxBuffer, extensao: "docx" as const };

    const caminho = `${entidadeTipo}/${tipoDocumento}/${entidadeId}-${Date.now()}.${arquivoFinal.extensao}`;
    const supabase = supabaseAdmin();
    const { error: erroUpload } = await supabase.storage
      .from("documentos")
      .upload(caminho, arquivoFinal.buffer, {
        contentType:
          arquivoFinal.extensao === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      });

    if (erroUpload) throw new Error(erroUpload.message);

    const { data: urlPublica } = supabase.storage.from("documentos").getPublicUrl(caminho);

    await prisma.documentos_gerados.create({
      data: {
        entidade_tipo: entidadeTipo,
        entidade_id: entidadeId,
        tipo_documento: tipoDocumento,
        arquivo_url: urlPublica.publicUrl,
        gerado_por_usuario_id: usuarioId ?? null,
        status: "Sucesso"
      }
    });

    return urlPublica.publicUrl;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await prisma.documentos_gerados.create({
      data: {
        entidade_tipo: entidadeTipo,
        entidade_id: entidadeId,
        tipo_documento: tipoDocumento,
        gerado_por_usuario_id: usuarioId ?? null,
        status: "Erro",
        mensagem
      }
    });
    throw erro;
  }
}

// Em desenvolvimento local (TEMPLATES_LOCAL_DIR configurado no .env, apontando
// para bot-siseng/templates/), lê o arquivo direto do disco. Em produção, esse
// diretório não existe no build da Vercel — busca do bucket "templates" no
// Supabase Storage, onde uma cópia de cada .docx deve ser mantida sincronizada
// (ver bot-siseng/templates/README.md).
async function carregarTemplate(nomeArquivo: string): Promise<Buffer> {
  const pastaLocal = process.env.TEMPLATES_LOCAL_DIR;

  if (pastaLocal) {
    return fs.readFile(path.join(pastaLocal, nomeArquivo));
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from("templates").download(nomeArquivo);
  if (error || !data) {
    throw new Error(
      `Não consegui baixar o template "${nomeArquivo}" do bucket "templates" no Supabase Storage: ` +
        (error?.message ?? "arquivo não encontrado")
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

async function preencherTemplate(
  nomeArquivo: string,
  dados: Record<string, unknown>
): Promise<Buffer> {
  const conteudoTemplate = await carregarTemplate(nomeArquivo);
  const zip = new PizZip(conteudoTemplate);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" }
  });
  doc.render(dados);
  return doc.getZip().generate({ type: "nodebuffer" });
}

async function converterParaPdf(docxBuffer: Buffer): Promise<{ buffer: Buffer; extensao: "pdf" }> {
  const form = new FormData();
  form.append("files", new Blob([docxBuffer]), "documento.docx");
  const resposta = await fetch(`${DOCUMENT_CONVERTER_URL}/forms/libreoffice/convert`, {
    method: "POST",
    body: form
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao converter para PDF (status ${resposta.status})`);
  }
  const buffer = Buffer.from(await resposta.arrayBuffer());
  return { buffer, extensao: "pdf" };
}

// Formata um valor decimal como número brasileiro simples (sem "R$"), do
// jeito que costuma aparecer dentro do corpo de um contrato: "1.850,00".
function numero(valor: unknown): string {
  const n = Number(valor ?? 0);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percentual(valor: unknown): string {
  const n = Number(valor ?? 0) * 100;
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function dataCurta(d: Date | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("pt-BR") : "";
}

function mesReferencia(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

// Busca os dados da entidade e monta o objeto plano de placeholders (ver
// lib/documentos/campos.ts) que o Docxtemplater usa para preencher o .docx.
async function montarDadosDoMerge(
  tipoDocumento: TipoDocumento,
  entidadeId: string
): Promise<Record<string, unknown>> {
  switch (tipoDocumento) {
    case "contrato_locacao":
    case "contrato_compra_venda":
      return montarDadosTransacao(tipoDocumento, entidadeId);
    case "carta_preferencia":
      return montarDadosGestao(entidadeId);
    case "contrato_administracao":
      return montarDadosAdmImovel(entidadeId);
    case "contrato_associacao_corretor":
      return montarDadosContratoCorretor(entidadeId);
    case "termo_entrega_chaves":
      return montarDadosChaves(entidadeId);
    case "recibo_honorarios":
    case "repasse_administracao":
    case "repasse_primeira_locacao":
      return montarDadosMovimentacao(tipoDocumento, entidadeId);
  }
}

async function montarDadosTransacao(
  tipoDocumento: "contrato_locacao" | "contrato_compra_venda",
  transacaoId: string
): Promise<Record<string, unknown>> {
  const t = await prisma.transacoes.findUnique({
    where: { id: transacaoId },
    include: {
      clientes_transacoes_cliente_idToclientes: true,
      clientes_transacoes_cliente_contraparte_idToclientes: true,
      imoveis: true,
      lojas: true,
      condicoes_pagamento: true
    }
  });
  if (!t) throw new Error(`Transação "${transacaoId}" não encontrada.`);

  const parte = t.clientes_transacoes_cliente_idToclientes;
  const contraparte = t.clientes_transacoes_cliente_contraparte_idToclientes;
  const hoje = new Date();

  if (tipoDocumento === "contrato_locacao") {
    return {
      loja_nome: t.lojas.nome,
      proprietario_nome: parte.nome,
      proprietario_cpf: formatarCpf(parte.cpf ?? ""),
      proprietario_estado_civil: parte.estado_civil ?? "",
      locatario_nome: contraparte.nome,
      locatario_cpf: formatarCpf(contraparte.cpf ?? ""),
      imovel_endereco: t.imoveis?.endereco ?? "",
      finalidade_locacao: t.finalidade_locacao ?? "",
      valor_transacao: numero(t.valor_transacao),
      valor_transacao_extenso: valorPorExtenso(Number(t.valor_transacao)),
      dia_vencimento: t.dia_vencimento ?? "",
      prazo_contrato_meses: "",
      garantia: t.garantia ?? "",
      encargos_lista: (t.encargos ?? []).join(", "),
      data_assinatura: dataCurta(t.data_assinatura ?? hoje),
      data_assinatura_extenso: dataPorExtenso(t.data_assinatura ?? hoje)
    };
  }

  return {
    loja_nome: t.lojas.nome,
    vendedor_nome: parte.nome,
    vendedor_cpf: formatarCpf(parte.cpf ?? ""),
    comprador_nome: contraparte.nome,
    comprador_cpf: formatarCpf(contraparte.cpf ?? ""),
    imovel_endereco: t.imoveis?.endereco ?? "",
    imovel_matricula: t.imoveis?.matricula ?? "",
    valor_transacao: numero(t.valor_transacao),
    valor_transacao_extenso: valorPorExtenso(Number(t.valor_transacao)),
    condicoes_pagamento_lista: t.condicoes_pagamento
      .map((c) => `${c.tipo ?? "Parcela"}: R$ ${numero(c.valor)} (${c.forma_pagamento ?? "—"})`)
      .join("\n"),
    data_assinatura: dataCurta(t.data_assinatura ?? hoje),
    data_assinatura_extenso: dataPorExtenso(t.data_assinatura ?? hoje)
  };
}

async function montarDadosGestao(gestaoId: string): Promise<Record<string, unknown>> {
  const g = await prisma.gestoes.findUnique({
    where: { id: gestaoId },
    include: { clientes: true, imoveis: true }
  });
  if (!g) throw new Error(`Gestão "${gestaoId}" não encontrada.`);

  return {
    proprietario_nome: g.clientes.nome,
    imovel_endereco: g.imoveis.endereco ?? "",
    valor_venda: numero(g.valor_venda),
    prazo_gestao_meses: g.prazo_gestao_meses ?? "",
    porc_honorario: percentual(g.porc_honorario),
    data_emissao: dataCurta(new Date())
  };
}

async function montarDadosAdmImovel(admImovelId: string): Promise<Record<string, unknown>> {
  const a = await prisma.adm_imoveis.findUnique({
    where: { id: admImovelId },
    include: { clientes: true, imoveis: true, lojas: true }
  });
  if (!a) throw new Error(`Administração "${admImovelId}" não encontrada.`);

  return {
    loja_nome: a.lojas.nome,
    proprietario_nome: a.clientes.nome,
    proprietario_cpf: formatarCpf(a.clientes.cpf ?? ""),
    imovel_endereco: a.imoveis.endereco ?? "",
    tx_administracao: percentual(a.tx_administracao),
    valor_administracao: numero(a.valor_administracao),
    prazo_contrato_meses: a.prazo_contrato_meses ?? "",
    data_assinatura: dataCurta(a.data_assinatura ?? new Date())
  };
}

// entidadeId aqui é o id do parceiro (Corretor ou Corretor Estagiário), não
// de um registro de contratos_corretor: os dados de comissionamento (fee,
// %compra, %venda, dia do fee) já vivem direto na ficha do parceiro e são
// editados por lá, então a geração do contrato lê sempre o valor atual.
// Campos no formato exato usado nos dois templates reais (ver
// campos.ts e templates/contrato_associacao_corretor*.docx).
async function montarDadosContratoCorretor(parceiroId: string): Promise<Record<string, unknown>> {
  const p = await prisma.parceiros.findUnique({
    where: { id: parceiroId },
    include: { lojas: true }
  });
  if (!p) throw new Error(`Parceiro "${parceiroId}" não encontrado.`);

  return {
    Parceiro: p.nome,
    EstadoCivil: p.estado_civil ?? "",
    DataNascimento: dataCurta(p.data_nascimento),
    CPF: formatarCpf(p.cpf ?? ""),
    Creci: p.creci ?? "",
    Email: p.email ?? "",
    Telefone: formatTelefone(p.telefone),
    Endereco: p.endereco ?? "",
    Fee: p.fee != null ? numero(p.fee) : "",
    PorcCompr: percentual(p.porc_compr),
    PorcVend: percentual(p.porc_vend),
    DiaFee: p.dia_fee ?? "",
    Cidade: p.lojas?.cidade ?? "",
    Estado: p.lojas?.estado ?? "",
    DataEntrada: dataCurta(p.data_entrada)
  };
}

async function montarDadosChaves(chavesId: string): Promise<Record<string, unknown>> {
  const k = await prisma.chaves.findUnique({
    where: { id: chavesId },
    include: {
      transacoes: {
        include: {
          clientes_transacoes_cliente_contraparte_idToclientes: true,
          imoveis: true,
          parceiros_transacoes_corretor_proprietario_idToparceiros: true,
          parceiros_transacoes_corretor_contraparte_idToparceiros: true
        }
      }
    }
  });
  if (!k) throw new Error(`Registro de chaves "${chavesId}" não encontrado.`);

  const t = k.transacoes;
  const corretorResponsavel =
    t.parceiros_transacoes_corretor_contraparte_idToparceiros?.nome ??
    t.parceiros_transacoes_corretor_proprietario_idToparceiros?.nome ??
    "";

  return {
    transacao_tipo: t.tipo,
    imovel_endereco: t.imoveis?.endereco ?? "",
    recebedor_nome: t.clientes_transacoes_cliente_contraparte_idToclientes.nome,
    corretor_responsavel: corretorResponsavel,
    data_entrega: dataCurta(k.data ?? new Date())
  };
}

async function montarDadosMovimentacao(
  tipoDocumento: "recibo_honorarios" | "repasse_administracao" | "repasse_primeira_locacao",
  movimentacaoId: string
): Promise<Record<string, unknown>> {
  const m = await prisma.movimentacoes.findUnique({
    where: { id: movimentacaoId },
    include: {
      parceiros: true,
      categorias_financeiras: true,
      transacoes: {
        include: {
          clientes_transacoes_cliente_idToclientes: true,
          clientes_transacoes_cliente_contraparte_idToclientes: true,
          imoveis: true
        }
      }
    }
  });
  if (!m) throw new Error(`Movimentação "${movimentacaoId}" não encontrada.`);

  const t = m.transacoes;

  if (tipoDocumento === "recibo_honorarios") {
    return {
      parceiro_nome: m.parceiros?.nome ?? "",
      transacao_referencia: t?.chave ?? t?.id ?? "",
      valor_honorario: numero(m.valor),
      valor_honorario_extenso: valorPorExtenso(Number(m.valor)),
      categoria: m.categorias_financeiras.nome,
      data_pagamento: dataCurta(m.data_pagamento ?? new Date())
    };
  }

  if (tipoDocumento === "repasse_administracao") {
    return {
      proprietario_nome: t?.clientes_transacoes_cliente_idToclientes.nome ?? "",
      imovel_endereco: t?.imoveis?.endereco ?? "",
      mes_referencia: mesReferencia(m.vencimento),
      valor_administracao: numero(t?.valor_administracao),
      valor_repasse: numero(m.valor),
      data_repasse: dataCurta(m.data_pagamento ?? new Date())
    };
  }

  return {
    proprietario_nome: t?.clientes_transacoes_cliente_idToclientes.nome ?? "",
    locatario_nome: t?.clientes_transacoes_cliente_contraparte_idToclientes.nome ?? "",
    imovel_endereco: t?.imoveis?.endereco ?? "",
    mes_referencia: mesReferencia(m.vencimento),
    valor_repasse: numero(m.valor),
    data_repasse: dataCurta(m.data_pagamento ?? new Date())
  };
}
