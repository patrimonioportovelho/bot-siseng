"use client";

import { useEffect, useState } from "react";
import {
  enviarTestePushAction,
  obterConfigPushAction,
  obterModulosPushAction,
  removerAssinaturaPushAction,
  salvarAssinaturaPushAction,
  salvarModulosPushAction
} from "@/lib/push-actions";

// Lista de módulos duplicada de lib/push.ts (aquele arquivo importa o servidor
// de envio e não pode ir para o navegador).
const MODULOS = [
  { id: "financiamento", rotulo: "Financiamento" },
  { id: "recrutamento", rotulo: "Recrutamento" },
  { id: "manutencao", rotulo: "Manutenção" },
  { id: "gestao", rotulo: "Gestões" },
  { id: "marketing", rotulo: "Marketing" },
  { id: "portal", rotulo: "Novos cadastros do portal" }
];

type Estado = "carregando" | "sem-suporte" | "indisponivel" | "bloqueado" | "desligado" | "ligado";

function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const preenchida = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(preenchida);
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

// "Avisos na tela": o quadradinho do sistema operacional quando alguém movimenta
// um card. A permissão é do navegador e só pode ser pedida num clique.
export function PushAvisos() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [modulos, setModulos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (vivo) setEstado("sem-suporte");
        return;
      }
      const cfg = await obterConfigPushAction().catch(() => ({ disponivel: false, chave: null }));
      if (!cfg.disponivel) {
        if (vivo) setEstado("indisponivel");
        return;
      }
      if (Notification.permission === "denied") {
        if (vivo) setEstado("bloqueado");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!sub) {
        if (vivo) setEstado("desligado");
        return;
      }
      const mods = await obterModulosPushAction(sub.endpoint).catch(() => null);
      if (!vivo) return;
      if (mods) {
        setEndpoint(sub.endpoint);
        setModulos(mods);
        setEstado("ligado");
      } else {
        setEstado("desligado"); // assinatura do navegador que o servidor não conhece (ex.: outro login)
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  async function ativar() {
    setOcupado(true);
    setMsg("");
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }
      const cfg = await obterConfigPushAction();
      if (!cfg.chave) throw new Error("Avisos ainda não configurados no servidor.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const existente = await reg.pushManager.getSubscription();
      const sub = existente ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(cfg.chave) }));
      const json = sub.toJSON();
      const r = await salvarAssinaturaPushAction(
        { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        navigator.userAgent
      );
      if (!r.ok) throw new Error(r.erro);
      const mods = await obterModulosPushAction(sub.endpoint);
      setEndpoint(sub.endpoint);
      setModulos(mods ?? MODULOS.map((m) => m.id));
      setEstado("ligado");
      setMsg("Avisos ativados neste navegador.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não foi possível ativar os avisos.");
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setOcupado(true);
    setMsg("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await removerAssinaturaPushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  async function alternarModulo(id: string) {
    if (!endpoint) return;
    const novos = modulos.includes(id) ? modulos.filter((m) => m !== id) : [...modulos, id];
    setModulos(novos);
    const r = await salvarModulosPushAction(endpoint, novos);
    if (!r.ok) {
      setModulos(modulos);
      setMsg(r.erro);
    }
  }

  async function testar() {
    setMsg("");
    const r = await enviarTestePushAction();
    setMsg(r.ok ? "Teste enviado — o aviso deve aparecer no canto da tela." : r.erro);
  }

  if (estado === "carregando") return null;

  return (
    <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/60">
      <div className="text-[11px] font-semibold text-gray-700 mb-1">Avisos na tela</div>
      {estado === "sem-suporte" && <p className="text-[11px] text-gray-400">Este navegador não permite avisos na tela. No celular iPhone, instale o SisEng na tela inicial primeiro.</p>}
      {estado === "indisponivel" && <p className="text-[11px] text-gray-400">Avisos ainda não configurados no servidor.</p>}
      {estado === "bloqueado" && (
        <p className="text-[11px] text-amber-700">
          O navegador bloqueou os avisos deste site. Clique no cadeado ao lado do endereço, em Notificações, escolha Permitir e recarregue a página.
        </p>
      )}
      {estado === "desligado" && (
        <>
          <p className="text-[11px] text-gray-500 mb-1.5">Receba um aviso no canto da tela quando alguém movimentar um card, mesmo com o sistema em outra aba.</p>
          <button type="button" onClick={() => void ativar()} disabled={ocupado} className="text-[11px] bg-primary text-white rounded-lg px-3 py-1 font-semibold disabled:opacity-50">
            {ocupado ? "Ativando…" : "Ativar avisos neste navegador"}
          </button>
        </>
      )}
      {estado === "ligado" && (
        <>
          <div className="flex flex-col gap-0.5 mb-2">
            {MODULOS.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
                <input type="checkbox" checked={modulos.includes(m.id)} onChange={() => void alternarModulo(m.id)} />
                {m.rotulo}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void testar()} className="text-[11px] border border-gray-300 rounded-lg px-2.5 py-1 text-gray-600 hover:bg-white">
              Enviar teste
            </button>
            <button type="button" onClick={() => void desativar()} disabled={ocupado} className="text-[11px] text-gray-400 hover:text-red-600 underline">
              Desativar neste navegador
            </button>
          </div>
        </>
      )}
      {msg && <p className="text-[11px] text-gray-500 mt-1.5">{msg}</p>}
    </div>
  );
}
