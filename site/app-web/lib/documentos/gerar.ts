import fs from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import type { TipoDocumento } from "./campos";

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
  entidadeTipo: "transacao" | "adm_imovel" | "cont_corretor" | "parceiro" | "chaves" | "movimentacao";
  entidadeId: string;
  usuarioId?: string;
};

export async function gerarDocumento(params: GerarDocumentoParams): Promise<string> {
  const { tipoDocumento, entidadeTipo, entidadeId, usuarioId } = params;

  try {
    const dados = await montarDadosDoMerge(tipoDocumento, entidadeId);
    const docxBuffer = await preencherTemplate(tipoDocumento, dados);
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
async function carregarTemplate(tipoDocumento: TipoDocumento): Promise<Buffer> {
  const nomeArquivo = ARQUIVO_TEMPLATE[tipoDocumento];
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
  tipoDocumento: TipoDocumento,
  dados: Record<string, unknown>
): Promise<Buffer> {
  const conteudoTemplate = await carregarTemplate(tipoDocumento);
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

// Busca os dados da entidade e monta o objeto plano de placeholders (ver
// lib/documentos/campos.ts) que o Docxtemplater usa para preencher o .docx.
//
// TODO: implementar cada caso assim que `npx prisma db pull` gerar os models
// a partir de site/database/schema.sql. A estrutura de cada consulta já está
// desenhada na Especificação Técnica e no diagrama de Transações — em geral é
// buscar a transação/entidade com os relacionamentos (cliente, imóvel,
// parceiro) via `include`, formatar CPF/datas/valores com os helpers de
// extenso.ts, e devolver um objeto { [placeholder]: valor }.
async function montarDadosDoMerge(
  tipoDocumento: TipoDocumento,
  entidadeId: string
): Promise<Record<string, unknown>> {
  throw new Error(
    `montarDadosDoMerge("${tipoDocumento}", "${entidadeId}") ainda não implementado — ` +
      "requer o schema do Prisma gerado via `npx prisma db pull` contra o banco Supabase."
  );
}
