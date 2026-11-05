"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClienteWhatsapp } from "@/components/cliente-whatsapp";
import { ETAPA_FUNIL_POR_ID, movimentoPermitido, type EtapaFunilId } from "@/lib/clientes/funil";
import type { VinculoCliente } from "@/lib/clientes/vinculos-servidor";
import type { ContatoCliente } from "@/app/clientes/funil-actions";

export type DadosClienteEtiqueta = {
  id: string;
  idLegado: string | null;
  nome: string;
  telefone: string | null;
  telefoneDigitos: string | null;
  email: string | null;
  corretorNome: string | null;
  corretorId: string | null;
  criadoEm: string;
  etapa: EtapaFunilId;
  motivo: string;
  papeis: string[];
  voltaParaLeads: boolean;
  atendimentoDesde: string | null;
  imovelReferencia: string | null;
};

type Acoes = {
  mover: (id: string, destino: EtapaFunilId) => Promise<{ ok: true } | { ok: false; erro: string }>;
  registrarContato: (
    clienteId: string,
    dados: { tipo: string; resultado: string | null; nota: string | null }
  ) => Promise<{ ok: true; contato: ContatoCliente } | { ok: false; erro: string }>;
};

const TIPOS_CONTATO = ["WhatsApp", "Ligação", "E-mail", "Reunião", "Visita", "Nota"];
const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";
const CARTAO = "bg-white border border-gray-200 rounded-xl p-4";

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Porto_Velho" });
const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho" });

// Etiqueta do cliente (mesmo desenho das etiquetas do Financiamento, Recrutamento e Manutenção): o
// cliente numa tela só, com a etapa, os vínculos, o gerador de WhatsApp e o histórico de contatos.
export function ClienteEtiqueta({
  d,
  vinculos,
  contatosIniciais,
  remetentes,
  remetenteLogado,
  acoes
}: {
  d: DadosClienteEtiqueta;
  vinculos: VinculoCliente[];
  contatosIniciais: ContatoCliente[];
  remetentes: { id: string; nome: string }[];
  remetenteLogado: { id: string; primeiroNome: string };
  acoes: Acoes;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [contatos, setContatos] = useState(contatosIniciais);
  const [erro, setErro] = useState("");
  const etapa = ETAPA_FUNIL_POR_ID.get(d.etapa);

  const [tipo, setTipo] = useState("Nota");
  const [resultado, setResultado] = useState("");
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);

  const podeAtender = movimentoPermitido({ etapa: d.etapa, motivo: d.motivo, papeis: d.papeis, voltaParaLeads: d.voltaParaLeads }, "atendimento");
  const podeVoltar = movimentoPermitido({ etapa: d.etapa, motivo: d.motivo, papeis: d.papeis, voltaParaLeads: d.voltaParaLeads }, "leads");

  async function mover(destino: EtapaFunilId) {
    setErro("");
    const r = await acoes.mover(d.id, destino);
    if (!r.ok) setErro(r.erro);
    else startTransition(() => router.refresh());
  }

  async function adicionar() {
    setSalvando(true);
    setErro("");
    const r = await acoes.registrarContato(d.id, { tipo, resultado: resultado.trim() || null, nota: nota.trim() || null });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setContatos((l) => [r.contato, ...l]);
    setNota("");
    setResultado("");
  }

  const jaContatado = contatos.some((c) => c.tipo !== "Nota");

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className={CARTAO}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-base font-bold text-gray-900">{d.nome}</div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {etapa && <span className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 border ${etapa.cor}`}>{etapa.label}</span>}
              <span className="text-[11px] text-gray-500">{d.motivo}</span>
              {d.papeis
                .filter((p) => etapa?.label.replace(/s$/, "") !== p)
                .map((p) => (
                  <span key={p} className="text-[10px] font-bold rounded-full px-2 py-0.5 border bg-gray-50 text-gray-500 border-gray-200">
                    também {p}
                  </span>
                ))}
            </div>
            <div className="text-xs text-gray-600 mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
              <span>{d.telefone ?? "Sem telefone"}</span>
              {d.email && <span>{d.email}</span>}
              <span>Corretor: {d.corretorNome ?? "—"}</span>
              <span>Cadastrado em {dia(d.criadoEm)}</span>
              {d.idLegado && <span className="text-gray-400">Id {d.idLegado}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {d.etapa === "leads" && podeAtender.ok && (
              <button type="button" onClick={() => void mover("atendimento")} className="text-xs bg-amber-600 text-white rounded-lg px-3 py-1.5 font-semibold hover:opacity-90">
                Marcar em atendimento
              </button>
            )}
            {d.etapa === "atendimento" && podeVoltar.ok && (
              <button type="button" onClick={() => void mover("leads")} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-gray-600">
                Voltar para Leads
              </button>
            )}
            <Link href={`/clientes/${d.id}`} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-gray-600 hover:bg-gray-50">
              Abrir ficha completa
            </Link>
          </div>
        </div>
        {erro && <div className="mt-3 text-xs text-red-600">{erro}</div>}
      </div>

      {/* WhatsApp */}
      <ClienteWhatsapp
        clienteId={d.id}
        nome={d.nome}
        telefoneDigitos={d.telefoneDigitos}
        etapa={d.etapa}
        jaContatado={jaContatado}
        imovelReferencia={d.imovelReferencia}
        remetentes={remetentes}
        remetenteIdPadrao={d.corretorId && remetentes.some((r) => r.id === d.corretorId) ? d.corretorId : remetentes.some((r) => r.id === remetenteLogado.id) ? remetenteLogado.id : null}
        remetenteFallback={remetenteLogado.primeiroNome}
        registrar={acoes.registrarContato}
        aoRegistrar={(c) => setContatos((l) => [c, ...l])}
      />

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Vínculos */}
        <div className={CARTAO}>
          <div className="text-sm font-bold text-gray-800 mb-2">Vínculos no sistema</div>
          {vinculos.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum imóvel, contrato, proposta ou avaliação ainda. É um lead.</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {vinculos.map((v) => {
                const conteudo = (
                  <div className="py-2 flex items-start gap-2">
                    <span className="text-[10px] font-bold rounded-full px-2 py-0.5 border bg-gray-50 text-gray-600 border-gray-200 shrink-0">{v.tipo}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">{v.titulo}</div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {v.detalhe}
                        {v.data ? ` · ${dia(v.data)}` : ""}
                      </div>
                    </div>
                  </div>
                );
                return v.href ? (
                  <Link key={v.id} href={v.href} className="hover:bg-gray-50 rounded-lg px-1 -mx-1">
                    {conteudo}
                  </Link>
                ) : (
                  <div key={v.id}>{conteudo}</div>
                );
              })}
            </div>
          )}
        </div>

        {/* Histórico de contatos e notas */}
        <div className={CARTAO}>
          <div className="text-sm font-bold text-gray-800 mb-2">Contatos e notas</div>
          <div className="flex flex-col gap-2 mb-3">
            <div className="grid grid-cols-2 gap-2">
              <select className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_CONTATO.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input className={CAMPO} value={resultado} onChange={(e) => setResultado(e.target.value)} placeholder="Resultado (opcional)" />
            </div>
            <textarea className={CAMPO} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder={tipo === "Nota" ? "Escreva a nota..." : "Anotação do contato (opcional)"} />
            <div>
              <button
                type="button"
                onClick={() => void adicionar()}
                disabled={salvando || (tipo === "Nota" && !nota.trim())}
                className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
              >
                {salvando ? "Salvando..." : "Registrar"}
              </button>
            </div>
          </div>
          {contatos.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum contato registrado.</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
              {contatos.map((c) => (
                <div key={c.id} className="border border-gray-100 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-gray-700">
                      {c.tipo}
                      {c.resultado ? ` · ${c.resultado}` : ""}
                    </span>
                    <span className="text-gray-400">
                      {dataHora(c.data)}
                      {c.por ? ` · ${c.por.split(" ")[0]}` : ""}
                    </span>
                  </div>
                  {c.nota && <div className="text-[11px] text-gray-600 mt-0.5 whitespace-pre-wrap">{c.nota}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
