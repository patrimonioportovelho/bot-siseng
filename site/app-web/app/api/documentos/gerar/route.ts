import { NextRequest, NextResponse } from "next/server";
import { gerarDocumento, type GerarDocumentoParams } from "@/lib/documentos/gerar";
import { getAdminSession } from "@/lib/auth";

// POST /api/documentos/gerar
// Body: { tipoDocumento, entidadeTipo, entidadeId, usuarioId? }
// Retorna a URL do arquivo gerado (PDF, se DOCUMENT_CONVERTER_URL estiver
// configurado; .docx caso contrário) e grava a auditoria em documentos_gerados.
//
// SEGURANÇA (achado crítico da auditoria de 01/08/2026): esta rota não é
// chamada por nenhuma tela do sistema hoje — a tela de Configurações gera
// documento chamando gerarDocumento() direto como Server Action, já protegida
// por requireAdminSession(). Só que essa rota HTTP ficava fora do
// middleware.ts (que exclui /api/ de propósito, pra rotas de API cuidarem da
// própria auth) e não tinha NENHUMA checagem própria — qualquer pessoa na
// internet, sabendo o entidadeId, gerava documento com CPF/RG/dados
// bancários de cliente/parceiro sem estar logada. Corrigido exigindo sessão
// admin válida aqui também, igual ao resto do sistema administrativo.
export async function POST(request: NextRequest) {
  const sessao = await getAdminSession();
  if (!sessao) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

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
      // usuarioId vem da sessão validada, nunca do body — senão dava pra
      // forjar no request quem "gerou" o documento na auditoria.
      usuarioId: sessao.parceiroId
    });
    return NextResponse.json({ url });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
