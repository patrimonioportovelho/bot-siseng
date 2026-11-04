"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { solicitarLiberacaoAction } from "@/lib/ponto/actions";
import { INATIVIDADE_MIN, INTERVALO_SINAL_BLOQUEADO_S, INTERVALO_SINAL_S, formatarMin } from "@/lib/ponto/regras";
import type { StatusPonto } from "@/lib/ponto/servidor";

type Status = Extract<StatusPonto, { controlado: true }>;

const OPCOES_TEMPO = [
  { min: 30, rotulo: "30 minutos" },
  { min: 60, rotulo: "1 hora" },
  { min: 120, rotulo: "2 horas" },
  { min: 180, rotulo: "3 horas" },
  { min: 240, rotulo: "4 horas" }
];

// Monitor do controle de ponto (só para quem tem o uso controlado). Roda em todas as telas do
// administrativo:
//  - manda um sinal de vida por minuto enquanto a pessoa USA a tela (aba visível e com atividade),
//    então só o tempo de uso real conta;
//  - sem mexer por 10 min, encerra a sessão; ao fechar a aba, avisa o servidor da saída;
//  - mostra as horas da semana, avisa perto do teto/fim do expediente e, passando do limite ou fora
//    do expediente, cobre a tela com o pedido de liberação para a diretoria.
export function PontoMonitor({ statusInicial }: { statusInicial: StatusPonto }) {
  const [status, setStatus] = useState<Status | null>(statusInicial.controlado ? statusInicial : null);
  const [ociosoAviso, setOciosoAviso] = useState(false);
  const ultimaAtividade = useRef(Date.now());
  const ultimoSinal = useRef(0);
  const encerrando = useRef(false);
  const bloqueado = !!status?.bloqueio;
  const bloqueadoRef = useRef(bloqueado);
  bloqueadoRef.current = bloqueado;
  const controlado = status !== null;

  const encerrarPorInatividade = useCallback(async () => {
    if (encerrando.current) return;
    encerrando.current = true;
    try {
      await logoutAction();
    } finally {
      window.location.href = "/login?motivo=inatividade";
    }
  }, []);

  const enviarSinal = useCallback(async () => {
    ultimoSinal.current = Date.now();
    try {
      const r = await fetch("/api/ponto/sinal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "sinal" }),
        cache: "no-store"
      });
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!r.ok) return;
      const dados = (await r.json()) as StatusPonto;
      setStatus(dados.controlado ? dados : null);
    } catch {
      // sem rede por um instante: tenta no próximo ciclo
    }
  }, []);

  useEffect(() => {
    if (!controlado) return;
    const marcar = () => {
      ultimaAtividade.current = Date.now();
    };
    const eventos: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }));

    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      if ((Date.now() - ultimaAtividade.current) / 60000 >= INATIVIDADE_MIN) void encerrarPorInatividade();
      else void enviarSinal();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    // fechou a aba ou o navegador: avisa a saída (o navegador pode não deixar enviar; o servidor
    // também fecha o período no último sinal de vida)
    const aoSair = () => {
      try {
        navigator.sendBeacon("/api/ponto/sinal", new Blob([JSON.stringify({ acao: "saida" })], { type: "application/json" }));
      } catch {
        // ignora
      }
    };
    window.addEventListener("pagehide", aoSair);

    const passo = () => {
      const ociosoMin = (Date.now() - ultimaAtividade.current) / 60000;
      if (ociosoMin >= INATIVIDADE_MIN) {
        void encerrarPorInatividade();
        return;
      }
      setOciosoAviso(ociosoMin >= INATIVIDADE_MIN - 1);
      const intervalo = (bloqueadoRef.current ? INTERVALO_SINAL_BLOQUEADO_S : INTERVALO_SINAL_S) * 1000;
      if (document.visibilityState === "visible" && Date.now() - ultimoSinal.current >= intervalo) void enviarSinal();
    };
    const timer = window.setInterval(passo, 5000);
    void enviarSinal();

    return () => {
      eventos.forEach((e) => window.removeEventListener(e, marcar));
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("pagehide", aoSair);
      window.clearInterval(timer);
    };
  }, [controlado, enviarSinal, encerrarPorInatividade]);

  if (!status) return null;

  const emExtra = status.extra !== null;
  return (
    <>
      <div className="print:hidden fixed bottom-3 left-3 md:left-[11.75rem] z-[60] max-w-[calc(100vw-1.5rem)] md:max-w-sm">
        <div
          className={`rounded-xl border shadow-md px-3 py-1.5 text-[11px] backdrop-blur ${
            emExtra ? "bg-red-50/95 border-red-200 text-red-800" : status.aviso ? "bg-amber-50/95 border-amber-200 text-amber-900" : "bg-white/95 border-gray-200 text-gray-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <span aria-hidden>⏱</span>
            <span>
              <strong>{formatarMin(status.semanaMin)}</strong> de {formatarMin(status.cargaMin)} na semana · hoje <strong>{formatarMin(status.hojeMin)}</strong>
            </span>
          </div>
          {emExtra && status.extra && <div className="mt-0.5">Hora extra autorizada: restam {formatarMin(status.extra.restanteMin)}.</div>}
          {!emExtra && status.aviso && <div className="mt-0.5">{status.aviso}</div>}
          {!emExtra && !status.aviso && status.noAlmoco && <div className="mt-0.5 text-gray-500">Horário de almoço: o uso é registrado e fica sinalizado no relatório.</div>}
        </div>
      </div>

      {ociosoAviso && !bloqueado && (
        <div className="print:hidden fixed bottom-16 left-1/2 -translate-x-1/2 z-[70] bg-gray-900 text-white text-xs rounded-xl px-4 py-2 shadow-xl">
          Sem atividade: sua sessão será encerrada em 1 minuto. Mexa na tela para continuar.
        </div>
      )}

      {status.bloqueio && <TelaBloqueio status={status} bloqueio={status.bloqueio} aoPedir={() => void enviarSinal()} />}
    </>
  );
}

function TelaBloqueio({ status, bloqueio, aoPedir }: { status: Status; bloqueio: NonNullable<Status["bloqueio"]>; aoPedir: () => void }) {
  const [minutos, setMinutos] = useState(60);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const pendente = status.pedidoPendente;

  async function pedir() {
    setErro("");
    setEnviando(true);
    const r = await solicitarLiberacaoAction(motivo, minutos).catch(() => ({ ok: false as const, erro: "Não foi possível enviar o pedido agora." }));
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    aoPedir();
  }

  return (
    <div className="print:hidden fixed inset-0 z-[100] bg-gray-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
        <div className="text-base font-bold text-gray-900">{bloqueio.tipo === "teto" ? "Limite semanal atingido" : "Fora do expediente"}</div>
        <p className="text-sm text-gray-600 mt-1">{bloqueio.mensagem}</p>
        <p className="text-xs text-gray-500 mt-2">
          Esta semana: <strong>{formatarMin(status.semanaMin)}</strong> de {formatarMin(status.cargaMin)}. Para continuar, a diretoria precisa liberar o acesso.
        </p>

        {pendente ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
            <strong>Pedido enviado.</strong> Você pediu {formatarMin(pendente.minutos)} e está aguardando a diretoria. Esta tela libera sozinha quando for aprovado.
            <div className="mt-1 text-amber-800/80">“{pendente.motivo}”</div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <label className="text-[11px] text-gray-600">
              Por quanto tempo você precisa?
              <select value={minutos} onChange={(e) => setMinutos(Number(e.target.value))} className="block w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 mt-0.5 bg-white">
                {OPCOES_TEMPO.map((o) => (
                  <option key={o.min} value={o.min}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-gray-600">
              Motivo
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Explique por que precisa trabalhar além do limite"
                className="block w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 mt-0.5 bg-white"
              />
            </label>
            {erro && <div className="text-xs text-red-600">{erro}</div>}
            <button
              type="button"
              onClick={pedir}
              disabled={enviando || motivo.trim().length < 10}
              className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:opacity-90"
            >
              {enviando ? "Enviando..." : "Solicitar liberação"}
            </button>
          </div>
        )}

        <form action={logoutAction} className="mt-3 text-center">
          <button type="submit" className="text-xs text-gray-500 hover:text-gray-800 underline">
            Sair do sistema
          </button>
        </form>
      </div>
    </div>
  );
}
