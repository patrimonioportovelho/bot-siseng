"use client";

type ParceiroOpcao = { id: string; nome: string };

type PerfilExistente = {
  instagram: string | null;
  tom_voz: string | null;
  posicionamento: string | null;
  pilares_conteudo: string | null;
  publico_prioritario: string | null;
  regiao: string | null;
  especialidade: string | null;
  meta_mensal_leads: number | null;
  responsavel_marketing_parceiro_id: string | null;
  status: string;
} | null;

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const AREA = CAMPO + " min-h-[70px] resize-y";
const LABEL = "text-xs text-gray-600 block mb-1";

// Formulário do perfil de marca pessoal do corretor (Fase 5b, 09/08/2026) —
// upsert: mesma action serve pra primeiro preenchimento e pra edição
// (ver salvarPerfilCorretorAction).
export function MarketingCorretorPerfilForm({
  parceiroId,
  perfil,
  administrativos,
  action
}: {
  parceiroId: string;
  perfil: PerfilExistente;
  administrativos: ParceiroOpcao[];
  action: (formData: FormData) => void;
}) {
  const p = perfil;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="parceiroId" value={parceiroId} />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Marca e posicionamento</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Instagram</label>
            <input className={CAMPO} name="instagram" defaultValue={p?.instagram ?? ""} placeholder="@usuario" />
          </div>
          <div>
            <label className={LABEL}>Região de atuação</label>
            <input className={CAMPO} name="regiao" defaultValue={p?.regiao ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Especialidade</label>
            <input className={CAMPO} name="especialidade" defaultValue={p?.especialidade ?? ""} placeholder="Alto padrão, locação, lançamentos..." />
          </div>
          <div>
            <label className={LABEL}>Meta mensal de leads</label>
            <input type="number" min="0" className={CAMPO} name="meta_mensal_leads" defaultValue={p?.meta_mensal_leads ?? ""} />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Tom de voz</label>
            <input className={CAMPO} name="tom_voz" defaultValue={p?.tom_voz ?? ""} placeholder="Ex.: direto, técnico, próximo, bem-humorado..." />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Posicionamento</label>
            <textarea className={AREA} name="posicionamento" defaultValue={p?.posicionamento ?? ""} />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Pilares de conteúdo</label>
            <textarea className={AREA} name="pilares_conteudo" defaultValue={p?.pilares_conteudo ?? ""} placeholder="Ex.: bastidores, dicas de financiamento, tour de imóveis..." />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Público prioritário</label>
            <input className={CAMPO} name="publico_prioritario" defaultValue={p?.publico_prioritario ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Responsável de marketing</label>
            <select className={CAMPO} name="responsavel_marketing_parceiro_id" defaultValue={p?.responsavel_marketing_parceiro_id ?? ""}>
              <option value="">—</option>
              {administrativos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select className={CAMPO} name="status" defaultValue={p?.status ?? "Ativo"}>
              <option value="Ativo">Ativo</option>
              <option value="Pausado">Pausado</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold">
          Salvar perfil
        </button>
      </div>
    </form>
  );
}
