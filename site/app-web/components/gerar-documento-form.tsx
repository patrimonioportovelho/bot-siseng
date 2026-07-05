"use client";

import { useEffect, useState } from "react";
import type { TipoDocumento } from "@/lib/documentos/campos";
import { buscarRegistrosAction, gerarDocumentoAction, type OpcaoRegistro } from "@/lib/documentos/actions";

const MODELOS: { valor: TipoDocumento; label: string }[] = [
  { valor: "contrato_locacao", label: "Contrato de locação" },
  { valor: "contrato_compra_venda", label: "Contrato de compra e venda" },
  { valor: "carta_preferencia", label: "Carta de preferência" },
  { valor: "contrato_administracao", label: "Contrato de administração" },
  { valor: "contrato_associacao_corretor", label: "Contrato de associação do corretor" },
  { valor: "termo_entrega_chaves", label: "Termo de entrega de chaves" },
  { valor: "recibo_honorarios", label: "Recibo de honorários" },
  { valor: "repasse_administracao", label: "Repasse de administração" },
  { valor: "repasse_primeira_locacao", label: "Repasse de primeira locação" }
];

const DICA_BUSCA: Record<TipoDocumento, string> = {
  contrato_locacao: "Busque pela chave da transação, endereço do imóvel ou nome do cliente",
  contrato_compra_venda: "Busque pela chave da transação, endereço do imóvel ou nome do cliente",
  carta_preferencia: "Busque pelo endereço do imóvel ou nome do proprietário",
  contrato_administracao: "Busque pelo endereço do imóvel ou nome do proprietário",
  contrato_associacao_corretor: "Busque pelo nome do corretor",
  termo_entrega_chaves: "Busque pela chave da transação ou endereço do imóvel",
  recibo_honorarios: "Busque pelo nome do parceiro ou chave da transação",
  repasse_administracao: "Busque pelo nome do parceiro ou chave da transação",
  repasse_primeira_locacao: "Busque pelo nome do parceiro ou chave da transação"
};

export function GerarDocumentoForm() {
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>("contrato_locacao");
  const [termo, setTermo] = useState("");
  const [opcoes, setOpcoes] = useState<OpcaoRegistro[]>([]);
  const [selecionado, setSelecionado] = useState<string>("");
  const [buscando, setBuscando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: true; url: string } | { ok: false; erro: string } | null>(null);

  useEffect(() => {
    setOpcoes([]);
    setSelecionado("");
    setResultado(null);
  }, [tipoDocumento]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const rows = await buscarRegistrosAction(tipoDocumento, termo);
        setOpcoes(rows);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [tipoDocumento, termo]);

  async function handleGerar() {
    if (!selecionado) return;
    setGerando(true);
    setResultado(null);
    try {
      const r = await gerarDocumentoAction(tipoDocumento, selecionado);
      setResultado(r);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-600 block mb-1">Modelo</label>
          <select
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white"
            value={tipoDocumento}
            onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
          >
            {MODELOS.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">{DICA_BUSCA[tipoDocumento]}</label>
          <input
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary"
            placeholder="Digite para buscar..."
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
        </div>
      </div>

      <div className="border border-gray-100 rounded-lg max-h-48 overflow-auto">
        {buscando && <p className="text-xs text-gray-400 p-3">Buscando...</p>}
        {!buscando && opcoes.length === 0 && (
          <p className="text-xs text-gray-400 p-3">Nenhum registro encontrado ainda — digite para buscar.</p>
        )}
        {!buscando &&
          opcoes.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelecionado(o.id)}
              className={
                "block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 " +
                (selecionado === o.id ? "bg-[#eef1ff] text-primary font-medium" : "text-gray-700")
              }
            >
              {o.label}
            </button>
          ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!selecionado || gerando}
          onClick={handleGerar}
          className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold disabled:opacity-40"
        >
          {gerando ? "Gerando..." : "Gerar documento"}
        </button>
        {resultado?.ok && (
          <a href={resultado.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
            Abrir documento gerado
          </a>
        )}
        {resultado && !resultado.ok && <span className="text-xs text-red-600">{resultado.erro}</span>}
      </div>
    </div>
  );
}
