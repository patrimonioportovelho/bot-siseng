"use client";

import { useState } from "react";
import Link from "next/link";
import { CHAVES_PRESENCA, PRESENCAS_TURMA, type EstadoTreinamentos } from "@/lib/recrutamento/treinamentos";
import { PRAZO_ACOLHIDA_DIAS } from "@/lib/recrutamento/opcoes";
import { CampoDataAuto, CampoTextoAuto, Rotulo, type ResultadoSalvar } from "@/components/recrutamento-campos";

export type ParticipanteTurma = {
  id: string;
  nome: string;
  funcao: string;
  treinamentos: EstadoTreinamentos;
  acolhidaEm: string | null; // yyyy-mm-dd
};

export type TurmaTela = {
  id: string;
  nome: string;
  inicio: string;
  passosInicio: string | null;
  passosFim: string | null;
  especificosA: string | null;
  especificosB: string | null;
  acolhida: string | null;
  observacao: string | null;
  participantes: ParticipanteTurma[];
  aberta: boolean;
};

type Acoes = {
  salvarCampoTurma: (turmaId: string, campo: string, valor: string | null) => Promise<ResultadoSalvar>;
  alternarTreinamento: (parceiroId: string, chave: string, feito: boolean) => Promise<ResultadoSalvar>;
  criarTurma: (nome: string, inicio: string) => Promise<ResultadoSalvar>;
};

const CURTOS: Record<string, string> = { enc1: "E1", enc2: "E2", enc3: "E3", enc4: "E4", esp_a: "Esp A", esp_b: "Esp B" };

function dataBr(iso: string | null) {
  return iso ? iso.split("-").reverse().join("/") : "—";
}

export function RecrutamentoTurmas({ turmas, hoje, acoes }: { turmas: TurmaTela[]; hoje: string; acoes: Acoes }) {
  const [novoNome, setNovoNome] = useState("");
  const [novoInicio, setNovoInicio] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  async function criar() {
    setErro(null);
    setCriando(true);
    const r = await acoes.criarTurma(novoNome, novoInicio);
    setCriando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setNovoNome("");
    setNovoInicio("");
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-end gap-2 flex-wrap">
        <div>
          <Rotulo>Nova turma</Rotulo>
          <input
            className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white w-56"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Ex.: Abr/27 · 1ª quinzena"
          />
        </div>
        <div>
          <Rotulo>Início</Rotulo>
          <input
            type="date"
            className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white"
            value={novoInicio}
            onChange={(e) => setNovoInicio(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => void criar()}
          disabled={criando || !novoNome || !novoInicio}
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
        >
          Criar turma
        </button>
        {erro && <span className="text-[11px] text-red-600">{erro}</span>}
      </div>

      {turmas.map((t) => (
        <TurmaCard key={t.id} t={t} hoje={hoje} acoes={acoes} />
      ))}
    </div>
  );
}

function TurmaCard({ t, hoje, acoes }: { t: TurmaTela; hoje: string; acoes: Acoes }) {
  const [participantes, setParticipantes] = useState(t.participantes);
  const diasDesdeInicio = Math.floor((new Date(`${hoje}T00:00:00Z`).getTime() - new Date(`${t.inicio}T00:00:00Z`).getTime()) / 86400000);

  async function alternar(parceiroId: string, chave: string, feito: boolean) {
    const anterior = participantes;
    setParticipantes((lista) =>
      lista.map((p) =>
        p.id === parceiroId
          ? { ...p, treinamentos: { ...p.treinamentos, [chave]: feito ? { feito: true, data: hoje } : { feito: false } } }
          : p
      )
    );
    const r = await acoes.alternarTreinamento(parceiroId, chave, feito);
    if (!r.ok) setParticipantes(anterior);
  }

  const completos = participantes.filter((p) => CHAVES_PRESENCA.every((c) => p.treinamentos[c]?.feito)).length;

  return (
    <details className="bg-white border border-gray-200 rounded-xl p-3" open={t.aberta}>
      <summary className="cursor-pointer flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-bold text-gray-800">{t.nome}</span>
        <span className="text-[11px] text-gray-500">
          Início {dataBr(t.inicio)} · acolhida {dataBr(t.acolhida)} · {participantes.length} participante(s)
          {participantes.length > 0 && ` · ${completos} com 100%`}
        </span>
      </summary>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-2">
        <div>
          <Rotulo>Início da turma</Rotulo>
          <CampoDataAuto valor={t.inicio} salvar={(v) => acoes.salvarCampoTurma(t.id, "inicio", v)} />
        </div>
        <div>
          <Rotulo>9 Passos — início</Rotulo>
          <CampoDataAuto valor={t.passosInicio} salvar={(v) => acoes.salvarCampoTurma(t.id, "passos_inicio", v)} />
        </div>
        <div>
          <Rotulo>9 Passos — fim</Rotulo>
          <CampoDataAuto valor={t.passosFim} salvar={(v) => acoes.salvarCampoTurma(t.id, "passos_fim", v)} />
        </div>
        <div>
          <Rotulo>Específicos A</Rotulo>
          <CampoDataAuto valor={t.especificosA} salvar={(v) => acoes.salvarCampoTurma(t.id, "especificos_a", v)} />
        </div>
        <div>
          <Rotulo>Específicos B</Rotulo>
          <CampoDataAuto valor={t.especificosB} salvar={(v) => acoes.salvarCampoTurma(t.id, "especificos_b", v)} />
        </div>
        <div>
          <Rotulo>Acolhida</Rotulo>
          <CampoDataAuto valor={t.acolhida} salvar={(v) => acoes.salvarCampoTurma(t.id, "acolhida", v)} />
        </div>
        <div className="col-span-2 md:col-span-6">
          <Rotulo>Observação (ajuste por feriado etc.)</Rotulo>
          <CampoTextoAuto valor={t.observacao} salvar={(v) => acoes.salvarCampoTurma(t.id, "observacao", v)} />
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs min-w-[560px]">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-normal py-1.5 border-b border-gray-100">Participante</th>
              {PRESENCAS_TURMA.map((p) => (
                <th key={p.chave} className="font-normal py-1.5 border-b border-gray-100 text-center" title={p.titulo}>
                  {CURTOS[p.chave]}
                </th>
              ))}
              <th className="font-normal py-1.5 border-b border-gray-100">Situação</th>
            </tr>
          </thead>
          <tbody>
            {participantes.map((p) => {
              const feitas = CHAVES_PRESENCA.filter((c) => p.treinamentos[c]?.feito).length;
              const completo = feitas === CHAVES_PRESENCA.length;
              const estourou = diasDesdeInicio > PRAZO_ACOLHIDA_DIAS && !p.acolhidaEm && !completo;
              return (
                <tr key={p.id}>
                  <td className="py-1.5 border-b border-gray-50">
                    <Link href={`/recrutamento/${p.id}`} className="text-primary hover:underline">
                      {p.nome}
                    </Link>
                    <span className="text-[10px] text-gray-400"> — {p.funcao}</span>
                  </td>
                  {CHAVES_PRESENCA.map((c) => (
                    <td key={c} className="py-1.5 border-b border-gray-50 text-center">
                      <input type="checkbox" checked={!!p.treinamentos[c]?.feito} onChange={(e) => void alternar(p.id, c, e.target.checked)} />
                    </td>
                  ))}
                  <td className="py-1.5 border-b border-gray-50">
                    {p.acolhidaEm ? (
                      <span className="text-green-700">Acolhido em {dataBr(p.acolhidaEm)}</span>
                    ) : completo ? (
                      <span className="text-green-700 font-semibold">100% — liberar acolhida</span>
                    ) : (
                      <span className={estourou ? "text-red-600 font-semibold" : "text-gray-500"}>
                        {feitas}/{CHAVES_PRESENCA.length}
                        {estourou ? " · passou de 30 dias" : ""}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {participantes.length === 0 && (
              <tr>
                <td colSpan={8} className="py-3 text-center text-gray-400">
                  Nenhum recrutado nesta turma. Defina a turma na etiqueta do recrutado (ou mova para “Em treinamento”).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}
