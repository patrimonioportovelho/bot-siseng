import { NextRequest, NextResponse } from "next/server";
import { gerarDocumento, type GerarDocumentoParams } from "@/lib/documentos/gerar";

// POST /api/documentos/gerar
// Body: { tipoDocumento, entidadeTipo, entidadeId, usuarioId? }
// Retorna a URL do arquivo gerado (PDF, se DOCUMENT_CONVERTER_URL estiver
// configurado; .docx caso contrário) e grava a auditoria em documentos_gerados.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<GerarDocumentoParams>;

  if (!body.tipoDocumento || !body.entidadeTipo || !body.entidadeId) {
    return NextResponse.json(
      { erro: "Informe tipoDocumento, entidadeTipo e entidadeId." },
      { status: 400 }
    );
  }

  try {
    const url = await gerarDocumento({
      tipoDocumento: body.tipoDocumento,
      entidadeTipo: body.entidadeTipo,
      entidadeId: body.entidadeId,
      usuarioId: body.usuarioId
    });
    return NextResponse.json({ url });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
