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
// Cliente recém-adicionado pelo widget, com o vínculo de cônjuge opcional
// que o admin declara na hora — "esse novo é cônjuge de fulano, que já
// estava na lista?" (ver comentário completo em prisma/schema.prisma,
// campo clientes.conjuge_id). conjugeDeId é o id de alguém JÁ na lista
// (proprietariosAtuais ou outro já adicionado antes dele) — nunca de outro
// cliente novo adicionado depois, pra não criar dependência de ordem.
type ClienteAdicionado = ClienteOpcao & { conjugeDeId?: string };

export function AdicionarProprietarioImovel({
  proprietariosAtuais,
  clientesDisponiveis,
  campo = "proprietario_extra_id"
}: {
  proprietariosAtuais: { id: string; nome: string }[];
  clientesDisponiveis: ClienteOpcao[];
  campo?: string;
}) {
  const [adicionados, setAdicionados] = useState<ClienteAdicionado[]>([]);
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
    setAdicionados((atual) => [...atual, { ...c, conjugeDeId: undefined }]);
    setBusca("");
    setListaAberta(false);
  }

  function remover(id: string) {
    setAdicionados((atual) =>
      // Some com o cônjuge quem apontava pra ele, senão a pergunta "é cônjuge
      // de fulano" continuaria de pé com o fulano removido.
      atual.filter((c) => c.id !== id).map((c) => (c.conjugeDeId === id ? { ...c, conjugeDeId: undefined } : c))
    );
  }

  function definirConjuge(id: string, conjugeDeId: string) {
    setAdicionados((atual) => atual.map((c) => (c.id === id ? { ...c, conjugeDeId: conjugeDeId || undefined } : c)));
  }

  return (
    <div>
      {adicionados.map((c) => (
        <input key={c.id} type="hidden" name={campo} value={c.id} />
      ))}
      {adicionados
        .filter((c) => c.conjugeDeId)
        .map((c) => (
          <input key={`${c.id}-conjuge`} type="hidden" name={`${campo}_conjuge`} value={`${c.id}:${c.conjugeDeId}`} />
        ))}

      {proprietariosAtuais.length > 0 && (
        <div className="text-xs text-gray-700 mb-2">
          <span className="text-gray-400">Já cadastrado(s): </span>
          {proprietariosAtuais.map((p) => p.nome).join(", ")}
        </div>
      )}

      {adicionados.length > 0 && (
        <div className="flex flex-col gap-2 mb-2">
          {adicionados.map((c) => {
            // Só oferece marcar cônjuge de quem já estava na lista ANTES
            // deste (proprietariosAtuais + adicionados anteriores a ele) —
            // evita depender da ordem em que os cliques acontecem.
            const indiceAtual = adicionados.findIndex((a) => a.id === c.id);
            const opcoesVinculo = [
              ...proprietariosAtuais,
              ...adicionados.slice(0, indiceAtual).map((a) => ({ id: a.id, nome: a.nome }))
            ];
            return (
              <div key={c.id} className="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-800 font-medium truncate">+ {c.nome}</span>
                  <button type="button" onClick={() => remover(c.id)} className="text-green-700/60 hover:text-red-600 ml-2">
                    remover
                  </button>
                </div>
                {opcoesVinculo.length > 0 && (
                  <select
                    className="text-[11px] border border-green-300 rounded-md px-2 py-1 mt-1.5 w-full bg-white text-green-900"
                    value={c.conjugeDeId ?? ""}
                    onChange={(e) => definirConjuge(c.id, e.target.value)}
                  >
                    <option value="">Não é cônjuge de ninguém na lista</option>
                    {opcoesVinculo.map((o) => (
                      <option key={o.id} value={o.id}>
                        É cônjuge de {o.nome}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
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
