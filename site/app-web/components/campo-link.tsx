"use client";

import { useState } from "react";

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Campo de texto pra link (Pasta, Arquivo da vistoria, Comprovante etc.) com
// um botão "Abrir ↗" ao lado que aparece assim que tem algo digitado — pedido
// do usuário depois de gostar do botão "Abrir pasta" na ficha de
// visualização da transação: "onde tiver para colocar o link faça isso".
// Funciona tanto não-controlado (defaultValue, estado só interno — pra
// formulários com <form action={...}> que leem via FormData pelo name) quanto
// controlado (value/onChange, pra formulários tipo portal-administracao-form
// que já constroem o FormData na mão).
export function CampoLink({
  label,
  name,
  value,
  onChange,
  defaultValue,
  placeholder
}: {
  label: string;
  name?: string;
  value?: string;
  onChange?: (v: string) => void;
  defaultValue?: string | null;
  placeholder?: string;
}) {
  const [internoValor, setInternoValor] = useState(defaultValue ?? "");
  const controlado = value !== undefined;
  const valorAtual = controlado ? value : internoValor;
  const valorLimpo = valorAtual.trim();

  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex gap-1.5">
        <input
          className={CAMPO}
          name={name}
          value={valorAtual}
          onChange={(e) => (controlado ? onChange?.(e.target.value) : setInternoValor(e.target.value))}
          placeholder={placeholder}
        />
        {valorLimpo && (
          <a
            href={valorLimpo}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-50 hover:text-primary font-semibold"
            title="Abrir link"
          >
            Abrir ↗
          </a>
        )}
      </div>
    </div>
  );
}
