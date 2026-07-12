"use client";

import { useMemo, useState } from "react";

export type ClienteDaAgenda = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cpfCnpj: string | null;
  imoveis: { id: string; endereco: string | null }[];
};

// Lista de clientes do corretor logado ("agenda dele") — mesmos dados que o
// acesso administrativo vê, só que já filtrados pra quem está logado
// (clientes.parceiro_id), mesmo padrão de escopo usado no resto do portal
// (Elaboração de Contrato de Gestão, Proposta). Busca é só no cliente, a
// lista inteira já vem carregada do servidor.
export function PortalClientesLista({ clientes }: { clientes: ClienteDaAgenda[] }) {
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return clientes;
    return clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(b) ||
        (c.telefone ?? "").toLowerCase().includes(b) ||
        (c.email ?? "").toLowerCase().includes(b) ||
        (c.cpfCnpj ?? "").toLowerCase().includes(b)
    );
  }, [busca, clientes]);

  return (
    <div className="flex flex-col gap-3">
      <input
        className="text-sm border border-gray-300 rounded-lg px-3 py-2 w-full outline-none focus:border-primary bg-white"
        placeholder="Buscar por nome, telefone, email ou CPF/CNPJ..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {filtrados.length === 0 && <p className="text-xs text-gray-400">Nenhum cliente encontrado.</p>}

      <div className="flex flex-col gap-2">
        {filtrados.map((c) => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800">{c.nome}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
              {c.telefone && <span>{c.telefone}</span>}
              {c.email && <span>{c.email}</span>}
              {c.cpfCnpj && <span>{c.cpfCnpj}</span>}
              {!c.telefone && !c.email && !c.cpfCnpj && <span className="text-gray-400">sem contato cadastrado</span>}
            </div>
            {c.imoveis.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div className="text-[11px] text-gray-400 mb-1">Imóveis vinculados</div>
                <div className="flex flex-col gap-0.5">
                  {c.imoveis.map((i) => (
                    <div key={i.id} className="text-xs text-gray-600">
                      {i.endereco ?? "(sem endereço)"}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
