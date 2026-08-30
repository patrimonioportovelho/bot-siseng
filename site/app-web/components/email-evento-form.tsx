"use client";

import { useState } from "react";
import { FUNCOES_EQUIPE } from "@/lib/parceiros/opcoes";

const CAMPO =
  "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";

type Progresso = { feito: number; total: number };
type Falha = { nome: string; email: string; erro: string };
type Resultado = { enviados: number; falharam: number; total: number; falhas: Falha[] };

// Disparo de e-mail por categoria (Fase 4, 10/08/2026) — antes era um
// <form action={Server Action}> nativo, sem JS. Trocado em 12/08/2026 por
// fetch + streaming (POST /eventos/[id]/enviar-email) por dois motivos:
// (1) um disparo real de 31 destinatários só entregou ~12-13 — a causa
// (conferida na caixa de saída do Gmail, ver comentário grande na rota) é
// o filtro antispam de quem recebe rejeitando rajada vinda de conta
// pessoal, não dá pra evitar 100% mas a rota manda um por vez com pausa
// pra reduzir; (2) o usuário pediu uma barra de "1 de 22... concluindo"
// pra saber que está enviando, em vez da tela ficar parada até o fim — e
// isso só dá pra mostrar em tempo real com JS mesmo, não com um <form>
// nativo. O resultado final também lista quem falhou, pra dar pra avisar
// por outro canal (WhatsApp etc.) quem não recebeu o convite por e-mail.
export function EmailEventoForm({ eventoId }: { eventoId: string }) {
  const [categoria, setCategoria] = useState("Todos");
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    setErro(null);
    setResultado(null);
    setProgresso(null);
    setEnviando(true);
    try {
      const resposta = await fetch(`/eventos/${eventoId}/enviar-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria })
      });

      if (!resposta.ok || !resposta.body) {
        const dados = await resposta.json().catch(() => null);
        throw new Error(dados?.erro ?? "Falha ao enviar os e-mails.");
      }

      // A rota devolve um e-mail JSON por linha (NDJSON) conforme cada lote
      // termina — lê aos pedaços em vez de esperar o corpo inteiro, senão
      // não tem como mostrar progresso incremental.
      const leitor = resposta.body.getReader();
      const decodificador = new TextDecoder();
      let sobra = "";

      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;
        sobra += decodificador.decode(value, { stream: true });
        const linhas = sobra.split("\n");
        sobra = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const evento = JSON.parse(linha) as
            | { tipo: "progresso"; feito: number; total: number }
            | { tipo: "concluido"; enviados: number; falharam: number; total: number; falhas: Falha[] };
          if (evento.tipo === "progresso") {
            setProgresso({ feito: evento.feito, total: evento.total });
          } else {
            setResultado({
              enviados: evento.enviados,
              falharam: evento.falharam,
              total: evento.total,
              falhas: evento.falhas ?? []
            });
          }
        }
      }
    } catch (erroEnvio) {
      setErro(erroEnvio instanceof Error ? erroEnvio.message : "Falha ao enviar os e-mails.");
    } finally {
      setEnviando(false);
      setProgresso(null);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
      <div className="text-sm font-bold text-gray-800 mb-1">Enviar e-mail de convite</div>
      <p className="text-xs text-gray-500 mb-3">
        Manda um e-mail com os dados do evento e o lembrete de confirmar presença no painel, pra todo parceiro ativo
        da categoria escolhida.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          disabled={enviando}
          className={CAMPO + " w-auto min-w-[220px] disabled:opacity-60"}
        >
          <option value="Todos">Todos (Administrativo + Corretor + Corretor Estagiário)</option>
          {FUNCOES_EQUIPE.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={enviar}
          disabled={enviando}
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap disabled:opacity-60 disabled:cursor-wait inline-flex items-center gap-1.5"
        >
          {enviando && <span className="w-3 h-3 border-2 rounded-full animate-spin border-white/40 border-t-white shrink-0" />}
          {enviando ? "Enviando..." : "Enviar e-mail"}
        </button>
      </div>

      {enviando && (
        <div className="mt-3">
          <div className="text-xs text-gray-500 mb-1">
            {progresso ? `Enviando ${progresso.feito} de ${progresso.total}...` : "Preparando envio..."}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-1.5 rounded-full transition-all"
              style={{ width: progresso ? `${(progresso.feito / progresso.total) * 100}%` : "5%" }}
            />
          </div>
        </div>
      )}

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mt-3">{erro}</div>
      )}
      {resultado && !erro && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mt-3">
          {resultado.enviados} e-mail{resultado.enviados !== 1 ? "s" : ""} enviado
          {resultado.enviados !== 1 ? "s" : ""} de {resultado.total}
          {resultado.falharam > 0 ? ` — ${resultado.falharam} falharam.` : "."}
        </div>
      )}
      {resultado && resultado.falhas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 mt-2">
          <div className="font-semibold mb-1">
            Não recebeu o convite por e-mail — vale avisar por outro canal (WhatsApp etc.):
          </div>
          <ul className="list-disc list-inside">
            {resultado.falhas.map((f) => (
              <li key={f.email}>
                {f.nome} ({f.email})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
