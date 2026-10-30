"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MODELOS_MENSAGEM_MAN,
  MODELO_MAN_POR_ID,
  ROTULO_DESTINATARIO_MAN,
  modeloPorAssunto,
  modeloSugeridoMan,
  type DestinatarioMan
} from "@/lib/manutencao/mensagens";
import { TIPO_ATIVIDADE_LABEL } from "@/lib/manutencao/opcoes";
import { linkWhatsapp, numeroWhatsapp, preencherMensagem, primeiroNome } from "@/lib/whatsapp";
import { Rotulo } from "@/components/recrutamento-campos";
import type { AtividadeMan, NotaManutencao } from "@/app/manutencao/actions";

export type PessoaMan = { nome: string; telefone: string | null };

// Pedido vindo de outra parte da etiqueta: "enviar esta atividade" ou "falar da
// chave". `n` muda a cada clique, para o mesmo pedido poder ser repetido.
export type PedidoMensagem = { tipo: "atividade"; atividade: AtividadeMan; n: number } | { tipo: "chave"; n: number };

function dataBr(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// {obs_atividade} some quando não há observação (os demais viram [colchetes]).
function montar(texto: string, ctx: Record<string, string | null | undefined>, obs: string) {
  return preencherMensagem(texto.replace("{obs_atividade}", obs ? ` Obs.: ${obs}` : ""), ctx);
}

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";

// Mensagem de WhatsApp da etiqueta da Manutenção — mesmo padrão do Recrutamento
// e do Financiamento: escolhe o destinatário (Proprietário, Prestador ou
// Inquilino), o modelo (sugerido pela etapa), edita o texto e abre a conversa
// em outra aba. O clique registra o contato nas notas do ticket.
export function ManutencaoWhatsapp({
  ticketId,
  coluna,
  proprietario,
  prestador,
  remetentes,
  remetenteIdPadrao,
  remetenteFallback,
  contexto,
  pedido,
  registrarContato,
  aoRegistrar
}: {
  ticketId: string;
  coluna: string;
  proprietario: PessoaMan | null;
  prestador: PessoaMan | null;
  remetentes: { id: string; nome: string }[];
  remetenteIdPadrao: string | null;
  remetenteFallback: string;
  contexto: {
    servico: string;
    titulo: string;
    imovel: string | null;
    custoEstimado: string | null;
    custoFinal: string | null;
    urgencia: string;
    chave: string;
  };
  pedido: PedidoMensagem | null;
  registrarContato: (
    id: string,
    dados: { para: string; modelo: string; texto: string }
  ) => Promise<{ ok: true; nota: NotaManutencao } | { ok: false; erro: string }>;
  aoRegistrar: (nota: NotaManutencao) => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  // Atividade em foco (a que o usuário mandou enviar) — alimenta as variáveis do modelo.
  const [atividadeFoco, setAtividadeFoco] = useState<AtividadeMan | null>(null);
  const [inquilinoNome, setInquilinoNome] = useState("");
  const [inquilinoTelefone, setInquilinoTelefone] = useState("");
  const pessoas: Record<DestinatarioMan, PessoaMan | null> = {
    proprietario,
    prestador,
    inquilino: { nome: inquilinoNome, telefone: inquilinoTelefone }
  };

  const [destinatario, setDestinatario] = useState<DestinatarioMan>("proprietario");
  const pessoa = pessoas[destinatario];
  const numero = numeroWhatsapp(pessoa?.telefone);

  const [remetenteId, setRemetenteId] = useState<string>(remetenteIdPadrao ?? "");
  const remetente = primeiroNome(remetentes.find((r) => r.id === remetenteId)?.nome ?? remetenteFallback) || remetenteFallback;

  const ctx = useMemo(
    () => ({
      nome: primeiroNome(pessoa?.nome ?? ""),
      remetente,
      servico: contexto.servico.toLowerCase(),
      titulo: contexto.titulo,
      imovel: contexto.imovel,
      custo_estimado: contexto.custoEstimado,
      custo_final: contexto.custoFinal,
      urgencia: contexto.urgencia.toLowerCase(),
      chave: contexto.chave,
      prestador: prestador ? primeiroNome(prestador.nome) : null,
      proprietario: proprietario ? primeiroNome(proprietario.nome) : null,
      atividade: atividadeFoco ? (TIPO_ATIVIDADE_LABEL[atividadeFoco.tipo] ?? atividadeFoco.tipo).toLowerCase() : null,
      data_atividade: atividadeFoco ? dataBr(atividadeFoco.data) : null,
      titulo_atividade: atividadeFoco?.titulo ?? null
    }),
    [pessoa, remetente, contexto, prestador, proprietario, atividadeFoco]
  );
  const obsAtividade = atividadeFoco?.notas?.trim() ?? "";

  const [modeloId, setModeloId] = useState(modeloSugeridoMan(coluna, "proprietario"));
  const modelo = MODELO_MAN_POR_ID.get(modeloId) ?? MODELOS_MENSAGEM_MAN[0];
  const [texto, setTexto] = useState(() => montar(modelo.texto, ctx, obsAtividade));
  const [editado, setEditado] = useState(false);
  const [estado, setEstado] = useState<"ocioso" | "registrando" | "registrado" | "erro">("ocioso");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  // O card mudou de coluna (ou o prestador/valores mudaram): sugere o modelo da
  // etapa e refaz o texto, desde que a pessoa não tenha editado a mensagem.
  const colunaAnterior = useRef(coluna);
  useEffect(() => {
    if (colunaAnterior.current !== coluna) {
      colunaAnterior.current = coluna;
      if (!editado) {
        const novo = modeloSugeridoMan(coluna, destinatario);
        setModeloId(novo);
        const m = MODELO_MAN_POR_ID.get(novo);
        if (m) setTexto(montar(m.texto, ctx, obsAtividade));
      }
    } else if (!editado) {
      setTexto(montar(modelo.texto, ctx, obsAtividade));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coluna, ctx]);

  // Chegou um pedido ("enviar esta atividade" / "falar da chave"): troca para o
  // modelo certo do destinatário atual e leva a tela até a mensagem.
  const pedidoAplicado = useRef(0);
  useEffect(() => {
    if (!pedido || pedido.n === pedidoAplicado.current) return;
    pedidoAplicado.current = pedido.n;
    const foco = pedido.tipo === "atividade" ? pedido.atividade : null;
    setAtividadeFoco(foco);
    const novo = modeloPorAssunto(pedido.tipo, destinatario);
    setModeloId(novo);
    setEditado(false);
    const m = MODELO_MAN_POR_ID.get(novo);
    if (m) {
      const extra = foco
        ? {
            atividade: (TIPO_ATIVIDADE_LABEL[foco.tipo] ?? foco.tipo).toLowerCase(),
            data_atividade: dataBr(foco.data),
            titulo_atividade: foco.titulo
          }
        : {};
      setTexto(montar(m.texto, { ...ctx, ...extra }, foco?.notas?.trim() ?? ""));
    }
    raiz.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);

  function trocarDestinatario(d: DestinatarioMan) {
    setDestinatario(d);
    const novo = modeloSugeridoMan(coluna, d);
    setModeloId(novo);
    setEditado(false);
    const m = MODELO_MAN_POR_ID.get(novo);
    if (m) setTexto(montar(m.texto, { ...ctx, nome: primeiroNome(pessoas[d]?.nome ?? "") }, obsAtividade));
  }

  function trocarModelo(id: string) {
    setModeloId(id);
    setEditado(false);
    const m = MODELO_MAN_POR_ID.get(id);
    if (m) setTexto(montar(m.texto, ctx, obsAtividade));
  }

  // Trocou o remetente: troca só o nome em "Aqui é <nome>" (mantém o que foi editado).
  const remetenteAnterior = useRef(remetente);
  useEffect(() => {
    const antigo = remetenteAnterior.current;
    if (antigo === remetente) return;
    remetenteAnterior.current = remetente;
    const escapado = antigo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    setTexto((t) => t.replace(new RegExp(`(aqui é )${escapado}\\b`, "gi"), `$1${remetente}`));
  }, [remetente]);

  const modelosDoDestinatario = MODELOS_MENSAGEM_MAN.filter((m) => m.destinatario === destinatario);
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
    const r = await registrarContato(ticketId, {
      para: `${ROTULO_DESTINATARIO_MAN[destinatario]} (${pessoa?.nome ?? ""})`,
      modelo: modelo.titulo,
      texto
    });
    if (r.ok) {
      aoRegistrar(r.nota);
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

  const semTelefone = destinatario === "inquilino" ? "Digite o telefone do inquilino." : `Sem telefone cadastrado para ${ROTULO_DESTINATARIO_MAN[destinatario].toLowerCase()}.`;

  return (
    <div ref={raiz} className="bg-white border border-green-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="text-sm font-bold text-gray-800">Mensagem de WhatsApp</div>
        <div className="text-[11px] text-gray-400">
          {numero ? "Abre a conversa em outra aba e registra o contato nas notas." : semTelefone}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11px] text-gray-500">Enviar para:</span>
        {(["proprietario", "prestador", "inquilino"] as DestinatarioMan[]).map((d) => {
          const p = pessoas[d];
          const indisponivel = d !== "inquilino" && !p;
          return (
            <button
              key={d}
              type="button"
              disabled={indisponivel}
              onClick={() => trocarDestinatario(d)}
              title={indisponivel ? (d === "prestador" ? "Defina o prestador acima." : "Sem proprietário vinculado.") : undefined}
              className={`text-xs rounded-lg px-3 py-1.5 border disabled:opacity-40 ${
                destinatario === d ? "bg-green-600 text-white border-green-600" : "bg-white border-gray-300 text-gray-600"
              }`}
            >
              {ROTULO_DESTINATARIO_MAN[d]}
              {p?.nome && <span className="opacity-80"> — {primeiroNome(p.nome)}</span>}
            </button>
          );
        })}
      </div>

      {destinatario === "inquilino" && (
        <div className="grid md:grid-cols-2 gap-3 mb-3">
          <div>
            <Rotulo>Nome do inquilino</Rotulo>
            <input className={CAMPO} value={inquilinoNome} onChange={(e) => setInquilinoNome(e.target.value)} />
          </div>
          <div>
            <Rotulo>Telefone (com DDD)</Rotulo>
            <input className={CAMPO} placeholder="(69) 99999-9999" value={inquilinoTelefone} onChange={(e) => setInquilinoTelefone(e.target.value)} />
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3 mb-2">
        <div>
          <Rotulo>Quem envia</Rotulo>
          <select className={CAMPO} value={remetenteId} onChange={(e) => setRemetenteId(e.target.value)}>
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
        {estado === "registrado" && <span className="text-[11px] text-green-600">Contato registrado nas notas ✓</span>}
        {estado === "erro" && <span className="text-[11px] text-red-600">{erro || "Não foi possível registrar o contato."}</span>}
      </div>
    </div>
  );
}
