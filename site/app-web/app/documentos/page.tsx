import { Topbar } from "@/components/topbar";
import { GerarDocumentoForm } from "@/components/gerar-documento-form";
import { DisparoEmailForm } from "@/components/disparo-email-form";
import { acessosDaSessao, nivelEmModulos } from "@/lib/acessos";
import { requireAdminSession } from "@/lib/auth";
import { enderecoRemetente } from "@/lib/email";
import { carregarDadosDisparo } from "@/lib/documentos/disparo-email-servidor";

export const dynamic = "force-dynamic";

export default async function DocumentosPage() {
  const sessao = await requireAdminSession();
  // O disparo em massa só aparece para quem pode editar Documentos (Diretor e Administrativo).
  const podeDisparar = nivelEmModulos(acessosDaSessao(sessao), ["documentos"]) === "editar";
  const dadosDisparo = podeDisparar ? await carregarDadosDisparo(sessao.parceiroId) : null;

  return (
    <div>
      <Topbar />

      <div className="flex flex-col gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-1">Gerar documentos</div>
          <p className="text-xs text-gray-500 mb-3">
            Selecione o modelo e o registro (pela chave da transação, endereço do imóvel ou nome do
            parceiro) para gerar o documento preenchido automaticamente.
          </p>
          <GerarDocumentoForm />
        </div>

        {dadosDisparo && <DisparoEmailForm dados={dadosDisparo} remetenteEndereco={enderecoRemetente()} />}
      </div>
    </div>
  );
}
