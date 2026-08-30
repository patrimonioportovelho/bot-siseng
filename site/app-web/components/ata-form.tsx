"use client";

import { useState } from "react";

const CAMPO =
  "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

type Secao = { titulo: string; itens: string[] };

function secaoVazia(): Secao {
  return { titulo: "", itens: [""] };
}

// Gerador de Ata de Reunião (Fase 3 do módulo Eventos, pedido do usuário
// 10/08/2026) — só aparece na página do evento quando tipo = "Reunião" (ver
// app/eventos/[id]/page.tsx). Seções são livres: o responsável cria quantas
// quiser no dia, cada uma com uma lista de itens — não segue um roteiro
// fixo, porque a pauta muda a cada reunião. Ao gerar, baixa o .docx na hora
// (POST /eventos/[id]/ata) — nada do que for digitado aqui fica salvo no
// sistema, só o registro de que a ata foi gerada.
export function AtaForm({ eventoId }: { eventoId: string }) {
  const [presentes, setPresentes] = useState("");
  const [observacao, setObservacao] = useState("");
  const [secoes, setSecoes] = useState<Secao[]>([secaoVazia()]);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);

  function atualizarTituloSecao(indice: number, titulo: string) {
    setSecoes((atual) => atual.map((s, i) => (i === indice ? { ...s, titulo } : s)));
  }

  function atualizarItem(indiceSecao: number, indiceItem: number, valor: string) {
    setSecoes((atual) =>
      atual.map((s, i) =>
        i === indiceSecao ? { ...s, itens: s.itens.map((it, j) => (j === indiceItem ? valor : it)) } : s
      )
    );
  }

  function adicionarItem(indiceSecao: number) {
    setSecoes((atual) => atual.map((s, i) => (i === indiceSecao ? { ...s, itens: [...s.itens, ""] } : s)));
  }

  function removerItem(indiceSecao: number, indiceItem: number) {
    setSecoes((atual) =>
      atual.map((s, i) => (i === indiceSecao ? { ...s, itens: s.itens.filter((_, j) => j !== indiceItem) } : s))
    );
  }

  function adicionarSecao() {
    setSecoes((atual) => [...atual, secaoVazia()]);
  }

  function removerSecao(indice: number) {
    setSecoes((atual) => atual.filter((_, i) => i !== indice));
  }

  async function gerar() {
    setErro(null);
    setGerando(true);
    try {
      const resposta = await fetch(`/eventos/${eventoId}/ata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presentes, observacao, secoes })
      });

      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        throw new Error(dados?.erro ?? "Falha ao gerar a ata.");
      }

      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // O nome real do arquivo vem do Content-Disposition — o navegador usa
      // esse atributo só como reserva caso o header não tenha sido lido.
      a.download = "ata.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setGeradoEm(
        new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Porto_Velho", hour: "2-digit", minute: "2-digit" })
      );

      // Fase 5 (pedido do usuário, 10/08/2026: "depois que acontecer vai
      // limpar as atas pra gerar novas pra próxima?") — nada aqui fica salvo
      // no sistema mesmo (ver comentário no topo do arquivo), então já
      // limpa o formulário na hora depois de gerar. Sem isso, quem deixasse
      // a aba aberta de uma reunião pra outra veria os campos da reunião
      // anterior ainda preenchidos.
      setPresentes("");
      setObservacao("");
      setSecoes([secaoVazia()]);
    } catch (erroGeracao) {
      setErro(erroGeracao instanceof Error ? erroGeracao.message : "Falha ao gerar a ata.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
      <div className="text-sm font-bold text-gray-800 mb-1">Ata da reunião</div>
      <p className="text-xs text-gray-500 mb-3">
        Preencha no dia da reunião e gere o documento — o conteúdo digitado aqui não fica salvo no sistema, só o
        arquivo baixado.
      </p>

      <div className="mb-3">
        <label className={LABEL}>Presentes</label>
        <input
          className={CAMPO}
          value={presentes}
          onChange={(e) => setPresentes(e.target.value)}
          placeholder="Nomes separados por vírgula"
        />
      </div>

      <div className="mb-3">
        <label className={LABEL}>Observação (opcional)</label>
        <input
          className={CAMPO}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Ex.: um departamento não compareceu para apresentar os resultados"
        />
      </div>

      <div className="flex flex-col gap-3 mb-3">
        {secoes.map((secao, indiceSecao) => (
          <div key={indiceSecao} className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <input
                className={CAMPO}
                value={secao.titulo}
                onChange={(e) => atualizarTituloSecao(indiceSecao, e.target.value)}
                placeholder={`Nome da seção (ex.: Comercial, Marketing...)`}
              />
              {secoes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removerSecao(indiceSecao)}
                  className="text-xs text-red-600 shrink-0 px-2"
                >
                  Remover
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1.5 mb-2">
              {secao.itens.map((item, indiceItem) => (
                <div key={indiceItem} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">•</span>
                  <input
                    className={CAMPO}
                    value={item}
                    onChange={(e) => atualizarItem(indiceSecao, indiceItem, e.target.value)}
                    placeholder="Item da pauta / decisão"
                  />
                  {secao.itens.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removerItem(indiceSecao, indiceItem)}
                      className="text-xs text-red-600 shrink-0"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => adicionarItem(indiceSecao)}
              className="text-xs text-primary font-semibold"
            >
              + item
            </button>
          </div>
        ))}
      </div>

      <div className="mb-3">
        <button type="button" onClick={adicionarSecao} className="text-xs text-primary font-semibold">
          + seção
        </button>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-3">{erro}</div>}
      {geradoEm && !erro && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-3">
          Ata gerada e baixada às {geradoEm}.
        </div>
      )}

      <button
        type="button"
        onClick={gerar}
        disabled={gerando}
        className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60 disabled:cursor-wait inline-flex items-center gap-1.5"
      >
        {gerando && <span className="w-3 h-3 border-2 rounded-full animate-spin border-white/40 border-t-white shrink-0" />}
        {gerando ? "Gerando..." : "Gerar e baixar Ata (.docx)"}
      </button>
    </div>
  );
}
