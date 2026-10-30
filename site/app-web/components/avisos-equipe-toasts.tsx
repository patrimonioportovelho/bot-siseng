"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Aviso = { id: string; icone: string; titulo: string; detalhe: string | null; url: string | null; criadoEm: string };

const INTERVALO_MS = 7000;
const DURACAO_MS = 10000;
const MAXIMO_NA_TELA = 5;
export const CHAVE_SOM = "sis_avisos_som"; // "0" = som desligado

function somLigado(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_SOM) !== "0";
  } catch {
    return true;
  }
}

// Toque curto de duas notas (sem arquivo de áudio). O navegador só libera som
// depois que a pessoa interagiu com a página — se não liberou, fica em silêncio.
function tocarAviso() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    const nota = (freq: number, inicio: number) => {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      ganho.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
      ganho.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + inicio + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + 0.35);
      osc.connect(ganho).connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + 0.4);
    };
    nota(880, 0);
    nota(1318, 0.14);
    setTimeout(() => void ctx.close(), 900);
  } catch {
    // sem som
  }
}

function Toast({ aviso, aoFechar, aoAbrir }: { aviso: Aviso; aoFechar: () => void; aoAbrir: () => void }) {
  return (
    <div
      className="avisos-toast-entrada pointer-events-auto relative overflow-hidden bg-white border border-gray-200 rounded-xl shadow-lg w-80 max-w-[92vw] group"
      role="status"
    >
      <button
        type="button"
        onClick={aviso.url ? aoAbrir : aoFechar}
        className={`w-full text-left px-3 py-2.5 pr-7 flex items-start gap-2.5 ${aviso.url ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"}`}
      >
        <span className="text-xl leading-none mt-0.5">{aviso.icone}</span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-gray-800 leading-snug">{aviso.titulo}</span>
          {aviso.detalhe && <span className="block text-[11px] text-gray-500 leading-snug truncate">{aviso.detalhe}</span>}
          {aviso.url && <span className="block text-[10px] text-primary mt-0.5">Clique para abrir</span>}
        </span>
      </button>
      <button type="button" onClick={aoFechar} aria-label="Fechar aviso" className="absolute top-1 right-1.5 text-gray-300 hover:text-gray-600 text-base leading-none px-1">
        ×
      </button>
      {/* barra de tempo: ao terminar, o aviso some; o mouse em cima pausa */}
      <div className="h-0.5 bg-gray-100">
        <div className="avisos-toast-barra h-full bg-primary/60" style={{ animationDuration: `${DURACAO_MS}ms` }} onAnimationEnd={aoFechar} />
      </div>
    </div>
  );
}

// Janelinha estilo MSN no canto da tela: quando um corretor entra no portal, faz
// uma proposta ou cadastra algo, aparece um aviso por ~10 s; os novos entram por
// baixo e empurram os antigos para cima. Só no administrativo (AppShell).
export function AvisosEquipeToasts() {
  const router = useRouter();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const cursor = useRef<string | null>(null);
  const vistos = useRef<Set<string>>(new Set());

  const buscar = useCallback(async () => {
    try {
      const url = cursor.current ? `/api/avisos?desde=${encodeURIComponent(cursor.current)}` : "/api/avisos";
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return;
      const dados = (await r.json()) as { agora: string; avisos: Aviso[] };
      cursor.current = dados.agora;
      const novos = dados.avisos.filter((a) => !vistos.current.has(a.id));
      if (novos.length === 0) return;
      for (const a of novos) vistos.current.add(a.id);
      setAvisos((atual) => [...atual, ...novos].slice(-MAXIMO_NA_TELA));
      if (somLigado()) tocarAviso();
    } catch {
      // sem rede: tenta de novo no próximo ciclo
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const iniciar = () => {
      if (timer) return;
      void buscar();
      timer = setInterval(() => void buscar(), INTERVALO_MS);
    };
    const parar = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    // Aba escondida não consulta; ao voltar, busca o que aconteceu enquanto isso.
    const aoMudarVisibilidade = () => (document.visibilityState === "visible" ? iniciar() : parar());
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    if (document.visibilityState === "visible") iniciar();
    return () => {
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      parar();
    };
  }, [buscar]);

  const fechar = (id: string) => setAvisos((atual) => atual.filter((a) => a.id !== id));

  if (avisos.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 items-end pointer-events-none">
      {avisos.map((a) => (
        <Toast
          key={a.id}
          aviso={a}
          aoFechar={() => fechar(a.id)}
          aoAbrir={() => {
            fechar(a.id);
            if (a.url) router.push(a.url);
          }}
        />
      ))}
    </div>
  );
}
