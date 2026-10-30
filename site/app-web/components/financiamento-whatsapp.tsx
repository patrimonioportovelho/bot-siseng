"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MODELOS_MENSAGEM_FIN,
  MODELO_FIN_POR_ID,
  modeloSugeridoFin,
  type DestinatarioMensagem
} from "@/lib/financiamento/mensagens";
import type { ColunaFinId } from "@/lib/financiamento/quadro";
import { dataCurta, linkWhatsapp, numeroWhatsapp, preencherMensagem, primeiroNome } from "@/lib/whatsapp";
import { Rotulo } from "@/components/recrutamento-campos";
import type { AtividadeFinTela } from "@/app/financiamento/quadro-actions";

export type PessoaContato = { nome: string; telefone: string | null };

type Registrar = (
  avaliacaoId: string,
  dados: { tipo: string; resultado: string | null; nota: string | null }
) => Promise<{ ok: true; atividade: AtividadeFinTela } | { ok: false; erro: string }>;

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";

const ROTULO_DESTINATARIO: Record<DestinatarioMensagem, string> = {
  cliente: "Cliente",
  parceiro: "Parceiro (corretor responsável)",
  vendedor: "Vendedor"
};

// Mensagem de WhatsApp da etiqueta do Financiamento: escolhe o destinatário
// (Cliente, Parceiro ou Vendedor), o modelo (sugerido pela etapa), edita o texto
// e abre a conversa em outra aba — o clique registra o contato na linha do tempo.
export function FinanciamentoWhatsapp({
  avaliacaoId,
  coluna,
  statusAvaliacao,
  cliente,
  parceiro,
  vendedor,
  remetentes,
  remetenteIdPadrao,
  remetenteFallback,
  banco,
  imovel,
  validade,
  etapaLabel,
  pendencia,
  proximoPasso,
  inconformidadeAberta,
  registrarContato,
  aoRegistrar
}: {
  avaliacaoId: string;
  coluna: ColunaFinId;
  statusAvaliacao: string;
  cliente: PessoaContato;
  parceiro: PessoaContato | null;
  vendedor: PessoaContato | null;
  remetentes: { id: string; nome: string }[];
  remetenteIdPadrao: string | null;
  remetenteFallback: string;
  banco: string | null;
  imovel: string | null;
  validade: string | null; // yyyy-mm-dd
  etapaLabel: string;
  pendencia: string | null;
  proximoPasso: string | null;
  inconformidadeAberta: boolean;
  registrarContato: Registrar;
  aoRegistrar: (a: AtividadeFinTela) => void;
}) {
  const pessoas: Record<DestinatarioMensagem, PessoaContato | null> = { cliente, parceiro, vendedor };
  const disponiveis = (Object.keys(pessoas) as DestinatarioMensagem[]).filter((d) => pessoas[d]);

  const [destinatario, setDestinatario] = useState<DestinatarioMensagem>("cliente");
  const pessoa = pessoas[destinatario];
  const numero = numeroWhatsapp(pessoa?.telefone);

  // Remetente: acompanha o responsável do card enquanto ninguém escolher outro nome.
  const [remetenteId, setRemetenteId] = useState<string>(remetenteIdPadrao ?? "");
  const escolhidoNaMao = useRef(false);
  useEffect(() => {
    if (!escolhidoNaMao.current) setRemetenteId(remetenteIdPadrao ?? "");
  }, [remetenteIdPadrao]);
  const remetente = primeiroNome(remetentes.find((r) => r.id === remetenteId)?.nome ?? remetenteFallback) || remetenteFallback;

  const ctx = useMemo(
    () => ({
      nome: primeiroNome(pessoa?.nome ?? ""),
      cliente: primeiroNome(cliente.nome),
      parceiro: parceiro ? primeiroNome(parceiro.nome) : null,
      remetente,
      banco,
      imovel,
      validade: dataCurta(validade),
      etapa: etapaLabel,
      pendencia,
      proximo_passo: proximoPasso
    }),
    [pessoa, cliente.nome, parceiro, remetente, banco, imovel, validade, etapaLabel, pendencia, proximoPasso]
  );

  const sugerido = (d: DestinatarioMensagem) => modeloSugeridoFin({ coluna, destinatario: d, inconformidadeAberta, statusAvaliacao });
  const [modeloId, setModeloId] = useState(sugerido("cliente"));
  const modelo = MODELO_FIN_POR_ID.get(modeloId) ?? MODELOS_MENSAGEM_FIN[0];
  const [texto, setTexto] = useState(() => preencherMensagem(modelo.texto, ctx));
  const [editado, setEditado] = useState(false);
  const [estado, setEstado] = useState<"ocioso" | "registrando" | "registrado" | "erro">("ocioso");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  function trocarDestinatario(d: DestinatarioMensagem) {
    setDestinatario(d);
    const novo = sugerido(d);
    setModeloId(novo);
    setEditado(false);
    const m = MODELO_FIN_POR_ID.get(novo);
    // o contexto muda junto com o destinatário: refaz com o nome certo
    if (m) setTexto(preencherMensagem(m.texto, { ...ctx, nome: primeiroNome(pessoas[d]?.nome ?? "") }));
  }

  function trocarModelo(id: string) {
    setModeloId(id);
    setEditado(false);
    const m = MODELO_FIN_POR_ID.get(id);
    if (m) setTexto(preencherMensagem(m.texto, ctx));
  }

  // Trocou o remetente: refaz o texto (se não foi editado) ou troca só o nome em "Aqui é <nome>".
  const remetenteAnterior = useRef(remetente);
  useEffect(() => {
    const antigo = remetenteAnterior.current;
    if (antigo === remetente) return;
    remetenteAnterior.current = remetente;
    if (!editado) setTexto(preencherMensagem(modelo.texto, ctx));
    else {
      const escapado = antigo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      setTexto((t) => t.replace(new RegExp(`(aqui é )${escapado}\\b`, "gi"), `$1${remetente}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remetente]);

  const modelosDoDestinatario = MODELOS_MENSAGEM_FIN.filter((m) => m.destinatario === destinatario);
  const pendentes = (texto.match(/\[[^\]]+\]/g) ?? []).length;

  function abrirWhatsapp() {
    if (!numero) return;
    // window.open precisa acontecer direto no clique (senão o navegador bloqueia a aba nova).
    window.open(linkWhatsapp(numero, texto), "_blank", "noopener,noreferrer");
    void registrar();
  }

  async function registrar() {
    setEstado("registrando");
    setErro("");
    const r = await registrarContato(avaliacaoId, {
      tipo: "WhatsApp",
      resultado: "Mensagem enviada",
      nota: `Para: ${ROTULO_DESTINATARIO[destinatario]} (${pessoa?.nome ?? ""})\nModelo: ${modelo.titulo}\n${texto}`
    });
    if (r.ok) {
      aoRegistrar(r.atividade);
      setEstado("registrado");
      setTimeout(() => setEstado((e) => (e === "registrado" ? "ocioso" : e)), 4000);
    } else {
      setErro(r.erro);
      setEstado("erro");
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não foi possível copiar.");
    }
  }

  return (
    <div className="bg-white border border-green-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="text-sm font-bold text-gray-800">Mensagem de WhatsApp</div>
        <div className="text-[11px] text-gray-400">
          {numero ? "Abre a conversa em outra aba e registra o contato na linha do tempo." : `Sem telefone cadastrado para ${ROTULO_DESTINATARIO[destinatario].toLowerCase()}.`}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11px] text-gray-500">Enviar para:</span>
        {disponiveis.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => trocarDestinatario(d)}
            className={`text-xs rounded-lg px-3 py-1.5 border ${destinatario === d ? "bg-green-600 text-white border-green-600" : "bg-white border-gray-300 text-gray-600"}`}
          >
            {ROTULO_DESTINATARIO[d]}
            {pessoas[d] && <span className="opacity-80"> — {primeiroNome(pessoas[d]!.nome)}</span>}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-2">
        <div>
          <Rotulo>Quem envia (responsável do card)</Rotulo>
          <select
            className={CAMPO}
            value={remetenteId}
            onChange={(e) => {
              escolhidoNaMao.current = true;
              setRemetenteId(e.target.value);
            }}
          >
            <option value="">{remetenteFallback} (você)</option>
            {remetentes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <Rotulo>Modelo (sugerido para esta etapa)</Rotulo>
          <select className={CAMPO} value={modeloId} onChange={(e) => trocarModelo(e.target.value)}>
            {modelosDoDestinatario.map((m) => (
              <option key={m.id} value={m.id}>
                {m.titulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      <textarea
        className={CAMPO}
        rows={6}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setEditado(true);
        }}
      />
      <div className="text-[10px] mt-1">
        {pendentes > 0 ? (
          <span className="text-amber-700">Complete os trechos entre [colchetes] antes de enviar.</span>
        ) : (
          <span className="text-gray-400">Você pode editar o texto antes de enviar.</span>
        )}
        {editado && (
          <button type="button" onClick={() => trocarModelo(modeloId)} className="ml-2 underline text-gray-400">
            restaurar modelo
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button
          type="button"
          onClick={abrirWhatsapp}
          disabled={!numero || estado === "registrando"}
          className="text-xs bg-green-600 text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50 hover:opacity-90"
        >
          Abrir no WhatsApp
        </button>
        <button type="button" onClick={() => void copiar()} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600">
          {copiado ? "Copiado ✓" : "Copiar mensagem"}
        </button>
        {estado === "registrando" && <span className="text-[11px] text-gray-400">Registrando o contato…</span>}
        {estado === "registrado" && <span className="text-[11px] text-green-600">Contato registrado na linha do tempo ✓</span>}
        {estado === "erro" && <span className="text-[11px] text-red-600">{erro || "Não foi possível registrar o contato."}</span>}
      </div>
    </div>
  );
}
