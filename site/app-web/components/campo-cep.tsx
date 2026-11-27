"use client";

import { useRef, useState } from "react";
import { buscarCep, type CepEncontrado } from "@/lib/enderecos";

// Campo de CEP: busca assim que os 8 números são digitados (e também ao sair do campo) e diz o que aconteceu.
// Antes, CEP não encontrado não fazia nada e parecia defeito.
export function CampoCep({
  valor,
  aoMudar,
  aoEncontrar,
  className,
  travado
}: {
  valor: string;
  aoMudar: (v: string) => void;
  aoEncontrar: (e: CepEncontrado) => void;
  className: string;
  travado?: boolean;
}) {
  const [aviso, setAviso] = useState<{ tom: "info" | "ok" | "alerta"; texto: string } | null>(null);
  const ultimo = useRef("");

  async function buscar(texto: string) {
    const d = texto.replace(/\D/g, "");
    if (travado || d.length !== 8 || d === ultimo.current) return;
    ultimo.current = d;
    setAviso({ tom: "info", texto: "Buscando o endereço…" });
    const e = await buscarCep(d);
    // o CEP mudou enquanto buscava: esta resposta não vale mais
    if (ultimo.current !== d) return;
    if (!e) {
      // deixa tentar de novo (pode ter sido só a internet)
      ultimo.current = "";
      setAviso({ tom: "alerta", texto: "CEP não encontrado. Confira os números ou preencha o endereço à mão." });
      return;
    }
    aoEncontrar(e);
    setAviso(
      e.logradouro && e.bairro
        ? { tom: "ok", texto: "Endereço preenchido. Confira e informe o número." }
        : { tom: "alerta", texto: `Este CEP é geral (${e.localidade}/${e.uf}): complete a rua e o bairro.` }
    );
  }

  return (
    <>
      <input
        className={className}
        readOnly={travado}
        value={valor}
        inputMode="numeric"
        maxLength={9}
        placeholder="00000-000"
        onChange={(e) => {
          aoMudar(e.target.value);
          if (e.target.value.replace(/\D/g, "").length !== 8) {
            ultimo.current = "";
            setAviso(null);
          }
          void buscar(e.target.value);
        }}
        onBlur={(e) => {
          const n = e.target.value.replace(/\D/g, "").length;
          if (!travado && n > 0 && n < 8) setAviso({ tom: "alerta", texto: "O CEP tem 8 números." });
          void buscar(e.target.value);
        }}
      />
      {aviso && !travado && (
        <p className={`text-[11px] mt-1 ${aviso.tom === "ok" ? "text-green-700" : aviso.tom === "alerta" ? "text-amber-700" : "text-gray-500"}`} role="status">
          {aviso.texto}
        </p>
      )}
    </>
  );
}
