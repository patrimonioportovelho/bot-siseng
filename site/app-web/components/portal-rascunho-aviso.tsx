"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Aviso reutilizável de "você tem um rascunho salvo" — usado nos painéis de
// cada módulo do portal (Avaliação, Compra e Venda, Locação, Administração,
// Gestão, Proposta). Cada formulário "novo" já mostra esse aviso na própria
// tela de criação (ver components/portal-*-form.tsx); este componente é o
// mesmo aviso só que em QUALQUER outra página do portal — resolve o pedido
// do corretor de "salvei um rascunho, entrei em outra página e ele sumiu":
// o rascunho sempre esteve lá (fica no localStorage do navegador), só que
// antes só aparecia se ele voltasse pra tela exata de criação.
export function PortalRascunhoAviso({ chave, href, label }: { chave: string; href: string; label: string }) {
  const [salvoEm, setSalvoEm] = useState<number | null>(null);

  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(chave);
      if (bruto) {
        const parsed = JSON.parse(bruto);
        if (parsed?.salvoEm) setSalvoEm(parsed.salvoEm);
      }
    } catch {
      // rascunho corrompido ou localStorage indisponível — ignora
    }
  }, [chave]);

  if (!salvoEm) return null;

  const dataHora = new Date(salvoEm).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 flex-wrap"
    >
      <span className="text-xs text-amber-800">
        Rascunho de {label} salvo neste navegador em <strong>{dataHora}</strong> — continue de onde parou.
      </span>
      <span className="text-xs font-semibold text-amber-700 shrink-0">Continuar →</span>
    </Link>
  );
}
