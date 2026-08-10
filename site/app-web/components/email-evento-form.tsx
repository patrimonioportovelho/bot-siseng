import { enviarEmailEventoAction } from "@/app/eventos/actions";
import { FUNCOES_EQUIPE } from "@/lib/parceiros/opcoes";

const CAMPO =
  "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";

// Disparo de e-mail por categoria (Fase 4, 10/08/2026) — formulário nativo
// (<form action={...}>), sem JS de cliente: o redirect da Server Action é
// tratado direto pelo navegador, sem o cuidado de NEXT_REDIRECT que
// evento-form.tsx/publicacao-form.tsx precisam (aquele problema só existe
// quando a action é chamada via fetch/JS, não em envio nativo de formulário).
export function EmailEventoForm({ eventoId }: { eventoId: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
      <div className="text-sm font-bold text-gray-800 mb-1">Enviar e-mail de convite</div>
      <p className="text-xs text-gray-500 mb-3">
        Manda um e-mail com os dados do evento e o lembrete de confirmar presença no painel, pra todo parceiro ativo
        da categoria escolhida.
      </p>
      <form action={enviarEmailEventoAction} className="flex items-center gap-2 flex-wrap">
        <input type="hidden" name="eventoId" value={eventoId} />
        <select name="categoria" defaultValue="Todos" className={CAMPO + " w-auto min-w-[220px]"}>
          <option value="Todos">Todos (Administrativo + Corretor + Corretor Estagiário)</option>
          {FUNCOES_EQUIPE.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
        >
          Enviar e-mail
        </button>
      </form>
    </div>
  );
}
