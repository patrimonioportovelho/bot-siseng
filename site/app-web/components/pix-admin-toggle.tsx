"use client";

import { useState } from "react";
import { PixQrcode } from "@/components/pix-qrcode";

// Botão "Ver Pix" no admin (Fase 6, 12/08/2026) — revela o QR/copia-e-cola
// do convidado só quando clicado, pra não lotar a lista de inscrições com
// um QR Code por linha. Serve pra reenviar o código por WhatsApp quando o
// convidado perdeu o que recebeu na hora de se inscrever.
export function PixAdminToggle({ codigo, valor }: { codigo: string; valor: number }) {
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-[10px] text-primary font-semibold hover:underline"
      >
        Ver Pix
      </button>
    );
  }

  return (
    <div className="mt-2 max-w-xs">
      <PixQrcode codigo={codigo} valor={valor} />
      <button
        type="button"
        onClick={() => setAberto(false)}
        className="text-[10px] text-gray-400 hover:underline mt-1"
      >
        Fechar
      </button>
    </div>
  );
}
