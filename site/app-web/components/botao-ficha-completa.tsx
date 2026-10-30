"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PainelLateral } from "@/components/painel-lateral";

// "Abrir ficha completa" da etiqueta do Financiamento. No computador (tela
// larga) abre a ficha num painel ao lado, sem sair da etiqueta; ao fechar, a
// etiqueta é atualizada (a ficha pode ter mudado status, valores etc.). No
// celular navega para a ficha em outra tela, e o "Voltar" dela retorna à
// etiqueta (?voltar=etiqueta), não ao quadro.
export function BotaoFichaCompleta({ avaliacaoId, nome }: { avaliacaoId: string; nome: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const base = `/financiamento/${avaliacaoId}`;

  return (
    <>
      <Link
        href={`${base}?voltar=etiqueta`}
        onClick={(e) => {
          if (window.matchMedia("(min-width: 768px)").matches) {
            e.preventDefault();
            setAberto(true);
          }
        }}
        className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50"
      >
        Abrir ficha completa
      </Link>
      <PainelLateral
        aberto={aberto}
        href={`${base}?embed=1`}
        titulo={`Ficha completa — ${nome}`}
        onFechar={() => {
          setAberto(false);
          router.refresh();
        }}
      />
    </>
  );
}
