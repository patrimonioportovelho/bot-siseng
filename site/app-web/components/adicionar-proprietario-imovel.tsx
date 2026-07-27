"use client";

import { useMemo, useState } from "react";

type ClienteOpcao = { id: string; nome: string; id_legado?: string | null; parceiro_id?: string | null };

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";

// Widget embutido em Transação/Administração/Gestão pra adicionar mais um
// proprietário/co-titular ao imóvel vinculado, sem precisar sair da tela e
// ir em Imóveis — pedido do usuário: "pode ser que o corretor deixe alguém
// para trás, aí o adm precisa adicionar". Só adiciona (nunca remove os que
// já estavam cadastrados) — ver comentário em
// lib/imoveis/proprietarios-extra.ts sobre por que é assim de propósito.
//
// O campo hidden usa `name={campo}` (padrão "proprietario_extra_id") — quem
// usar este componente precisa chamar sincronizarProprietariosExtra() na
// server action correspondente pra gravar de fato.
export function AdicionarProprietarioImovel({
  proprietariosAtuais,
  clientesDisponiveis,
  campo = "proprietario_extra_id"
}: {
  proprietariosAtuais: { id: string; nome: string }[];
  clientesDisponiveis: ClienteOpcao[];
  campo?: string;
}) {
  const [adicionados, setAdicionados] = useState<ClienteOpcao[]>([]);
  const [busca, setBusca] = useState("");
  const [listaAberta, setListaAberta] = useState(false);

  const jaVinculadosIds = useMemo(
    () => new Set([...proprietariosAtuais.map((p) => p.id), ...adicionados.map((c) => c.id)]),
    [proprietariosAtuais, adicionados]
  );

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const disponiveis = clientesDisponiveis.filter((c) => !jaVinculadosIds.has(c.id));
    if (!t) return disponiveis.slice(0, 30);
    return disponiveis.filter((c) => c.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [busca, clientesDisponiveis, jaVinculadosIds]);

  function adicionar(c: ClienteOpcao) {
    setAdicionados((atual) => [...atual, c]);
    setBusca("");
    setListaAberta(false);
  }

  function remover(id: string) {
    setAdicionados((atual) => atual.filter((c) => c.id !== id));
  }

  return (
    <div>
      {adicionados.map((c) => (
        <input key={c.id} type="hidden" name={campo} value={c.id} />
      ))}

      {proprietariosAtuais.length > 0 && (
        <div className="text-xs text-gray-700 mb-2">
          <span className="text-gray-400">Já cadastrado(s): </span>
          {proprietariosAtuais.map((p) => p.nome).join(", ")}
        </div>
      )}

      {adicionados.length > 0 && (
        <div className="flex flex-col gap-1 mb-2">
          {adicionados.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-1.5"
            >
              <span className="text-green-800 font-medium truncate">+ {c.nome}</span>
              <button type="button" onClick={() => remover(c.id)} className="text-green-700/60 hover:text-red-600 ml-2">
                remover
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          className={CAMPO}
          placeholder="+ Adicionar proprietário/co-titular esquecido — digite para buscar..."
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setListaAberta(true);
          }}
          onFocus={() => setListaAberta(true)}
          onBlur={() => setTimeout(() => setListaAberta(false), 150)}
        />
        {listaAberta && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
            {filtrados.length === 0 && <p className="text-xs text-gray-400 p-3">Nenhum cliente encontrado.</p>}
            {filtrados.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => adicionar(c)}
                className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
              >
                {c.nome}
                {c.id_legado ? ` — ${c.id_legado}` : ""}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
