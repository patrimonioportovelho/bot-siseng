"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Movimento otimista dos quadros (arrastar e soltar): o card muda de coluna NA
// HORA e o servidor grava em segundo plano. Antes a tela esperava a gravação e
// o recarregamento do quadro inteiro (lento). Se o servidor recusar, o card
// volta para onde estava e o motivo aparece em `erro`. Mesmo comportamento do
// quadro de Recrutamento e do Financiamento.
export function useQuadroOtimista<T extends { id: string; coluna: string }>(
  itensServidor: T[],
  // pode lançar erro ou devolver { ok: false, erro } — em produção o Next
  // esconde a mensagem de um erro lançado, então recusas de regra de negócio
  // devem voltar como { ok: false, erro }.
  mover: (id: string, destino: string) => Promise<void | { ok: boolean; erro?: string }>,
  // campos que mudam junto com a coluna (ex.: relógio de "parado há N dias")
  aoMover?: (item: T, destino: string) => Partial<T>
) {
  const [itens, setItens] = useState(itensServidor);
  const pendentes = useRef(0);
  const [erro, setErro] = useState<string | null>(null);

  // Quando o servidor manda dados novos (navegação, busca) e não há gravação em
  // andamento, a lista local acompanha.
  useEffect(() => {
    if (pendentes.current === 0) setItens(itensServidor);
  }, [itensServidor]);

  const moverPara = useCallback(
    (id: string, destino: string) => {
      const anterior = itens.find((i) => i.id === id);
      if (!anterior || anterior.coluna === destino) return;
      setErro(null);
      setItens((lista) => lista.map((i) => (i.id === id ? { ...i, coluna: destino, ...(aoMover?.(i, destino) ?? {}) } : i)));
      pendentes.current += 1;
      const desfazer = (mensagem: string) => {
        setItens((lista) => lista.map((i) => (i.id === id ? anterior : i)));
        setErro(mensagem);
      };
      mover(id, destino)
        .then((r) => {
          pendentes.current -= 1;
          if (r && r.ok === false) desfazer(r.erro ?? "Não foi possível mover o card.");
        })
        .catch((e: unknown) => {
          pendentes.current -= 1;
          desfazer(e instanceof Error ? e.message : "Não foi possível mover o card.");
        });
    },
    [itens, mover, aoMover]
  );

  return { itens, moverPara, erro, limparErro: () => setErro(null) };
}
