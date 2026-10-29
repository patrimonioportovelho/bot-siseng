"use client";

import { useEffect, useRef, useState } from "react";

// Campos com salvamento automático (sem botão "Salvar" e sem recarregar a
// página) usados na etiqueta de Recrutamento e no quadro. Texto salva ~0,8s
// depois de parar de digitar (e ao sair do campo); data e seleção salvam na
// hora. O estado fica ao lado do campo: "Salvando…", "Salvo ✓" ou o erro.
export type ResultadoSalvar = { ok: true } | { ok: false; erro: string };
type Estado = "ocioso" | "salvando" | "salvo" | "erro";

const CAMPO =
  "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white disabled:bg-gray-50";

function useSalvar(salvar: (valor: string | null) => Promise<ResultadoSalvar>) {
  const [estado, setEstado] = useState<Estado>("ocioso");
  const [erro, setErro] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function executar(valor: string | null) {
    setEstado("salvando");
    try {
      const r = await salvar(valor);
      if (r.ok) {
        setEstado("salvo");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setEstado((e) => (e === "salvo" ? "ocioso" : e)), 2000);
      } else {
        setErro(r.erro);
        setEstado("erro");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      setEstado("erro");
    }
  }
  return { estado, erro, executar };
}

export function EstadoSalvo({ estado, erro }: { estado: Estado; erro: string }) {
  if (estado === "ocioso") return <span className="h-4" />;
  if (estado === "salvando") return <span className="text-[10px] text-gray-400">Salvando…</span>;
  if (estado === "salvo") return <span className="text-[10px] text-green-600">Salvo ✓</span>;
  return <span className="text-[10px] text-red-600">{erro || "Erro ao salvar"}</span>;
}

export function Rotulo({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] text-gray-500 mb-1">{children}</label>;
}

export function CampoTextoAuto({
  valor,
  salvar,
  multilinha = false,
  linhas = 3,
  placeholder
}: {
  valor: string | null;
  salvar: (valor: string | null) => Promise<ResultadoSalvar>;
  multilinha?: boolean;
  linhas?: number;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  const ultimoSalvo = useRef(valor ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { estado, erro, executar } = useSalvar(salvar);

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  function gravar(v: string) {
    if (debounce.current) clearTimeout(debounce.current);
    if (v === ultimoSalvo.current) return;
    ultimoSalvo.current = v;
    void executar(v.trim() === "" ? null : v);
  }

  function aoMudar(v: string) {
    setTexto(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => gravar(v), 800);
  }

  return (
    <div>
      {multilinha ? (
        <textarea
          className={CAMPO}
          rows={linhas}
          value={texto}
          placeholder={placeholder}
          onChange={(e) => aoMudar(e.target.value)}
          onBlur={() => gravar(texto)}
        />
      ) : (
        <input
          className={CAMPO}
          value={texto}
          placeholder={placeholder}
          onChange={(e) => aoMudar(e.target.value)}
          onBlur={() => gravar(texto)}
        />
      )}
      <EstadoSalvo estado={estado} erro={erro} />
    </div>
  );
}

export function CampoDataAuto({
  valor,
  salvar
}: {
  valor: string | null;
  salvar: (valor: string | null) => Promise<ResultadoSalvar>;
}) {
  const [data, setData] = useState(valor ?? "");
  const { estado, erro, executar } = useSalvar(salvar);
  return (
    <div>
      <input
        type="date"
        className={CAMPO}
        value={data}
        onChange={(e) => {
          setData(e.target.value);
          void executar(e.target.value || null);
        }}
      />
      <EstadoSalvo estado={estado} erro={erro} />
    </div>
  );
}

export function CampoSelectAuto({
  valor,
  opcoes,
  salvar,
  vazio = "—",
  desabilitado = false
}: {
  valor: string | null;
  opcoes: { valor: string; rotulo: string }[];
  salvar: (valor: string | null) => Promise<ResultadoSalvar>;
  vazio?: string;
  desabilitado?: boolean;
}) {
  const [atual, setAtual] = useState(valor ?? "");
  const { estado, erro, executar } = useSalvar(salvar);
  return (
    <div>
      <select
        className={CAMPO}
        value={atual}
        disabled={desabilitado}
        onChange={(e) => {
          setAtual(e.target.value);
          void executar(e.target.value || null);
        }}
      >
        <option value="">{vazio}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <EstadoSalvo estado={estado} erro={erro} />
    </div>
  );
}
