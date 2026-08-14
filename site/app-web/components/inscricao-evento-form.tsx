"use client";

import { useState } from "react";
import { inscreverEventoAction } from "@/app/evento/[id]/actions";

const CAMPO =
  "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Inscrição pública de convidado externo (Formulário Básico/Completo, Fase 3
// do módulo Eventos, pedido do usuário 10/08/2026) — mostrado só quando
// evento.formulario_inscricao está ativo (ver app/evento/[id]/page.tsx).
// Cliente simples (sem upload, sem redirect) — chama a Server Action direto
// e mostra sucesso/erro na mesma página, sem precisar do tratamento de
// NEXT_REDIRECT usado em evento-form.tsx/publicacao-form.tsx.
//
// Fase 6 (12/08/2026, "cobrar por cabeça, criança até 14 anos não paga"):
// uma inscrição por pessoa (inclusive criança — o responsável preenche uma
// vez pra cada uma), com campo de idade só quando o evento cobra convidado.
// A lista/resumo por quem convidou fica no admin (app/eventos/[id]/
// page.tsx) — aqui é só o preenchimento.
export function InscricaoEventoForm({
  eventoId,
  completo,
  convidadoPor,
  cobraConvidado,
  valorConvidado,
  idadeGratisAte
}: {
  eventoId: string;
  completo: boolean;
  convidadoPor: { id: string; nome: string }[];
  // Cobrança por convidado (Fase 6, 12/08/2026) — quando ativa, pede a
  // idade (pra saber se paga ou é criança grátis) e mostra o valor antes de
  // enviar, pra ninguém se inscrever sem saber que tem custo.
  cobraConvidado: boolean;
  valorConvidado: string | null;
  idadeGratisAte: number;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const fd = new FormData(e.currentTarget);
      const resultado = await inscreverEventoAction(fd);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setSucesso(true);
    } catch {
      setErro("Falha ao enviar sua inscrição. Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  if (sucesso) {
    return (
      <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl p-4">
        Inscrição recebida! Te esperamos no evento.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
      <input type="hidden" name="eventoId" value={eventoId} />
      <div className="text-sm font-bold text-gray-800 mb-1">Inscreva-se</div>

      <div>
        <label className={LABEL}>Nome</label>
        <input name="nome" required className={CAMPO} />
      </div>
      <div className="grid md:grid-cols-2 gap-2">
        <div>
          <label className={LABEL}>E-mail</label>
          <input name="email" type="email" required className={CAMPO} />
        </div>
        <div>
          <label className={LABEL}>Telefone</label>
          <input name="telefone" required className={CAMPO} />
        </div>
      </div>

      {completo && (
        <>
          <div>
            <label className={LABEL}>Endereço</label>
            <input name="endereco" className={CAMPO} />
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Profissão</label>
              <input name="profissao" className={CAMPO} />
            </div>
            <div>
              <label className={LABEL}>Especialidade</label>
              <input name="especialidade" className={CAMPO} />
            </div>
          </div>
        </>
      )}

      <div>
        <label className={LABEL}>Quem te convidou?</label>
        <select name="convidado_por_id" defaultValue="" className={CAMPO}>
          <option value="">Prefiro não informar</option>
          {convidadoPor.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      {cobraConvidado && (
        <div>
          <label className={LABEL}>Sua idade</label>
          <input name="idade" type="number" min={0} max={120} required className={CAMPO} />
          <p className="text-[10px] text-gray-400 mt-1">
            Entrada: {valorConvidado ?? "consulte"} por pessoa. Até {idadeGratisAte} anos não paga.
          </p>
        </div>
      )}

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{erro}</div>}

      <button
        type="submit"
        disabled={enviando}
        className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60 mt-1"
      >
        {enviando ? "Enviando..." : "Confirmar inscrição"}
      </button>
    </form>
  );
}
