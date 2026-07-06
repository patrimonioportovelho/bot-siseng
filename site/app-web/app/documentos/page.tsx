import { Topbar } from "@/components/topbar";
import { GerarDocumentoForm } from "@/components/gerar-documento-form";

export const dynamic = "force-dynamic";

export default function DocumentosPage() {
  return (
    <div>
      <Topbar />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Gerar documentos</div>
        <p className="text-xs text-gray-500 mb-3">
          Selecione o modelo e o registro (pela chave da transação, endereço do imóvel ou nome do
          parceiro) para gerar o documento preenchido automaticamente.
        </p>
        <GerarDocumentoForm />
      </div>
    </div>
  );
}
