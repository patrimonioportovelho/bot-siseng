"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

// Mostra o Pix "copia e cola" (gerado em lib/eventos/pix.ts, sem API/
// gateway nenhum) como QR Code + botão de copiar o código — usado tanto no
// formulário público (logo depois do convidado se inscrever) quanto no
// admin (pra reenviar por WhatsApp). Fase 6 do módulo Eventos, pedido do
// usuário 12/08/2026.
export function PixQrcode({ codigo, valor }: { codigo: string; valor: number }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Clipboard pode falhar (permissão, navegador antigo) — o código já
      // fica visível pra copiar na mão, então não precisa de erro na tela.
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center gap-3">
      <div className="text-sm font-bold text-gray-800">
        Pix — {valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </div>
      <div className="bg-white p-2 border border-gray-100 rounded-lg">
        <QRCodeSVG value={codigo} size={180} />
      </div>
      <p className="text-[11px] text-gray-400 text-center">
        Aponte a câmera do app do seu banco pro QR Code, ou copie o código abaixo e cole em "Pix Copia e Cola".
      </p>
      <button
        type="button"
        onClick={copiar}
        className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold w-full"
      >
        {copiado ? "Copiado!" : "Copiar código Pix"}
      </button>
      <textarea
        readOnly
        value={codigo}
        onFocus={(e) => e.target.select()}
        rows={3}
        className="text-[10px] text-gray-400 border border-gray-100 rounded-lg p-2 w-full font-mono resize-none"
      />
    </div>
  );
}
