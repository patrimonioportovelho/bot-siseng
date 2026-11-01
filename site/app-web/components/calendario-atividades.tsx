"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hojePortoVelho } from "@/lib/format";
import type { ItemCalendario } from "@/lib/calendario/atividades";
import { ManutencaoCalendario } from "@/components/manutencao-calendario";

type Cobertura = { clientes: { com: number; total: number }; parceiros: { com: number; total: number } | null };

const chaveMes = (ano: number, mesIndice: number) => `${ano}-${String(mesIndice + 1).padStart(2, "0")}`;

function somarMeses(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return chaveMes(d.getFullYear(), d.getMonth());
}

// "yyyy-mm-dd" -> dia local (sem passar pelo fuso: evita cair no dia anterior)
function dataLocal(ymd: string): Date {
  const [a, m, d] = ymd.split("-").map(Number);
  return new Date(a, m - 1, d);
}

// Calendário de Atividades com troca de mês instantânea: os meses vizinhos são
// carregados em segundo plano (e guardados), então Anterior / Hoje / Próximo
// mostram a grade na hora, sem recarregar a página (antes cada clique refazia a
// tela inteira, inclusive o sino de notificações).
export function CalendarioAtividades({
  mesInicial,
  itensIniciais,
  aniversariosInicial,
  cobertura
}: {
  mesInicial: string;
  itensIniciais: ItemCalendario[];
  aniversariosInicial: boolean;
  cobertura: Cobertura;
}) {
  const [mes, setMes] = useState(mesInicial);
  const [mostrarAniversarios, setMostrarAniversarios] = useState(aniversariosInicial);
  const cache = useRef(new Map<string, ItemCalendario[]>([[mesInicial, itensIniciais]]));
  const emAndamento = useRef(new Map<string, Promise<void>>());
  const [, atualizar] = useState(0);
  const [erro, setErro] = useState("");

  const carregar = useCallback((m: string): Promise<void> => {
    if (cache.current.has(m)) return Promise.resolve();
    const jaPedido = emAndamento.current.get(m);
    if (jaPedido) return jaPedido;
    const p = fetch(`/api/calendario?mes=${m}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "Sessão expirada — entre de novo." : "Não foi possível carregar o mês.");
        const dados = (await r.json()) as { itens: ItemCalendario[] };
        cache.current.set(m, dados.itens);
        setErro("");
        atualizar((n) => n + 1);
      })
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : "Não foi possível carregar o mês.");
      })
      .finally(() => {
        emAndamento.current.delete(m);
      });
    emAndamento.current.set(m, p);
    return p;
  }, []);

  // Carrega o mês mostrado e já deixa os vizinhos prontos (±1 e ±2 meses).
  useEffect(() => {
    let vivo = true;
    (async () => {
      await carregar(mes);
      for (const delta of [1, -1, 2, -2]) {
        if (!vivo) return;
        await carregar(somarMeses(mes, delta));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [mes, carregar]);

  function irPara(novo: string) {
    setMes(novo);
    setErro("");
    // mantém o endereço certo (atualizar a página ou copiar o link volta neste mês)
    const params = new URLSearchParams({ mes: novo });
    if (!mostrarAniversarios) params.set("aniv", "0");
    window.history.replaceState(null, "", `/manutencao/calendario?${params.toString()}`);
  }

  function alternarAniversarios() {
    const novo = !mostrarAniversarios;
    setMostrarAniversarios(novo);
    const params = new URLSearchParams({ mes });
    if (!novo) params.set("aniv", "0");
    window.history.replaceState(null, "", `/manutencao/calendario?${params.toString()}`);
  }

  const [ano, m] = mes.split("-").map(Number);
  const mesIndice = m - 1;
  const itensDoMes = cache.current.get(mes);
  const carregando = itensDoMes === undefined;

  const hoje = hojePortoVelho();
  const mesHoje = chaveMes(hoje.getFullYear(), hoje.getMonth());

  const atividades = useMemo(
    () =>
      (itensDoMes ?? [])
        .filter((i) => mostrarAniversarios || !i.aniversario)
        .map((i) => ({ ...i, data: dataLocal(i.data) })),
    [itensDoMes, mostrarAniversarios]
  );
  const totalAniversarios = (itensDoMes ?? []).filter((i) => i.aniversario).length;

  const BOTAO = "text-xs border border-gray-300 bg-white rounded-lg px-3 py-1.5 hover:bg-gray-50 active:bg-gray-100";

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-2">
          <button type="button" onClick={() => irPara(somarMeses(mes, -1))} className={BOTAO}>
            ← Anterior
          </button>
          <button type="button" onClick={() => irPara(mesHoje)} className={BOTAO}>
            Hoje
          </button>
          <button type="button" onClick={() => irPara(somarMeses(mes, 1))} className={BOTAO}>
            Próximo →
          </button>
        </div>
        <div className="text-sm font-bold text-gray-800 capitalize flex items-center gap-2">
          {new Date(ano, mesIndice, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          {carregando && !erro && <span className="text-[11px] font-normal text-gray-400 normal-case">carregando…</span>}
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-3 flex items-center justify-between gap-2">
          <span>{erro}</span>
          <button type="button" onClick={() => void carregar(mes)} className="underline">
            tentar de novo
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap mb-3 text-[11px] text-gray-500">
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-pink-100 border border-pink-200 align-middle mr-1" />
          🎂 Aniversários de clientes e parceiros ({totalAniversarios} neste mês)
        </span>
        <button type="button" onClick={alternarAniversarios} className="underline text-gray-400 hover:text-gray-700">
          {mostrarAniversarios ? "ocultar aniversários" : "mostrar aniversários"}
        </button>
      </div>

      <div className={carregando ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <ManutencaoCalendario ano={ano} mesIndice={mesIndice} atividades={atividades} />
      </div>

      <p className="text-[11px] text-gray-400 mt-3">
        Só aparece quem tem data de nascimento no cadastro: {cobertura.clientes.com} de {cobertura.clientes.total} clientes e{" "}
        {cobertura.parceiros?.com ?? 0} de {cobertura.parceiros?.total ?? 0} parceiros ativos. Para incluir alguém, preencha a data de nascimento na
        ficha.
      </p>
    </>
  );
}
