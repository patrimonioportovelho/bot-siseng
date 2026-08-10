import fs from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Gerador da Ata de Reunião (Fase 3 do módulo Eventos, pedido do usuário
// 10/08/2026: "gerador de ata para que o responsável faça no dia do evento
// (reunião)"). Reaproveita a mesma engine (docxtemplater + PizZip) e o mesmo
// esquema de templates (pasta local em dev via TEMPLATES_LOCAL_DIR, bucket
// "templates" do Supabase Storage em produção) já usado pelo motor de
// documentos em lib/documentos/gerar.ts — mas fica separado dele de
// propósito: a ata não passa pela tabela documentos_gerados (que tem CHECK
// constraint fechado nos valores de entidade_tipo/tipo_documento — mexer
// nisso exigiria rodar SQL direto no banco) e o conteúdo preenchido não fica
// salvo em lugar nenhum, só o registro de QUE foi gerada (ver
// eventos_atas_geradas). Se um dia a ata precisar do mesmo rastro completo
// do motor de documentos, dá pra unificar — por enquanto, mais simples assim.
const NOME_ARQUIVO_TEMPLATE = "ata_reuniao.docx";

async function carregarTemplateAta(): Promise<Buffer> {
  const pastaLocal = process.env.TEMPLATES_LOCAL_DIR;

  if (pastaLocal) {
    return fs.readFile(path.join(pastaLocal, NOME_ARQUIVO_TEMPLATE));
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from("templates").download(NOME_ARQUIVO_TEMPLATE);
  if (error || !data) {
    throw new Error(
      `Não consegui baixar o template "${NOME_ARQUIVO_TEMPLATE}" do bucket "templates" no Supabase Storage: ` +
        (error?.message ?? "arquivo não encontrado")
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

export type SecaoAta = {
  titulo: string;
  itens: string[];
};

export type DadosAta = {
  nomeEvento: string;
  data: string;
  local: string;
  presentes: string;
  observacao: string;
  secoes: SecaoAta[];
};

function dataHoraGeradoEm(): string {
  return new Date().toLocaleString("pt-BR", {
    timeZone: "America/Porto_Velho",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Monta o .docx preenchido a partir dos dados digitados no formulário (ver
// components/ata-form.tsx) — devolvido pronto pra download, nunca salvo em
// disco/storage.
export async function gerarAtaReuniaoDocx(dados: DadosAta): Promise<Buffer> {
  const conteudoTemplate = await carregarTemplateAta();
  const zip = new PizZip(conteudoTemplate);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" }
  });

  const secoesValidas = dados.secoes
    .map((s) => ({ titulo: s.titulo.trim(), itens: s.itens.map((i) => i.trim()).filter(Boolean) }))
    .filter((s) => s.titulo.length > 0 && s.itens.length > 0);

  doc.render({
    NomeEvento: dados.nomeEvento,
    Data: dados.data,
    Local: dados.local || "—",
    Presentes: dados.presentes || "—",
    Observacao: dados.observacao.trim(),
    Secoes: secoesValidas.map((s, indice) => ({
      Numero: indice + 1,
      Titulo: s.titulo.toUpperCase(),
      Itens: s.itens
    })),
    GeradoEm: dataHoraGeradoEm()
  });

  return doc.getZip().generate({ type: "nodebuffer" });
}
