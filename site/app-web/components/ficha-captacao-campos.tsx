"use client";

import { CAMPOS_FICHA, ESCOLHAS_FICHA, GRUPOS_FICHA, type FichaDados } from "@/lib/gestoes/ficha";

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

function Pilula({ marcada, aoClicar, children }: { marcada: boolean; aoClicar: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={marcada}
      className={`text-[11px] rounded-full border px-2.5 py-1 transition-colors ${
        marcada ? "bg-primary text-white border-primary font-semibold" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

// Item 3 do formulário de Ficha de Captação: o que o corretor marca aqui sai igualzinho na ficha impressa
// (mesmas opções do modelo da imobiliária — ver lib/gestoes/ficha.ts).
export function FichaCaptacaoCampos({ ficha, aoMudar }: { ficha: FichaDados; aoMudar: (f: FichaDados) => void }) {
  const alternarEscolha = (id: string, opcao: string, multipla?: boolean) => {
    const atual = ficha.escolhas[id] ?? [];
    const novo = multipla ? (atual.includes(opcao) ? atual.filter((o) => o !== opcao) : [...atual, opcao]) : atual.includes(opcao) ? [] : [opcao];
    aoMudar({ ...ficha, escolhas: { ...ficha.escolhas, [id]: novo } });
  };
  const alternarGrupo = (id: string, opcao: string) => {
    const atual = ficha.grupos[id] ?? [];
    aoMudar({ ...ficha, grupos: { ...ficha.grupos, [id]: atual.includes(opcao) ? atual.filter((o) => o !== opcao) : [...atual, opcao] } });
  };
  const definirCampo = (id: string, valor: string) => aoMudar({ ...ficha, campos: { ...ficha.campos, [id]: valor } });
  const campo = (id: string) => CAMPOS_FICHA.find((c) => c.id === id)!;

  const inputCampo = (id: string) => {
    const c = campo(id);
    return (
      <div key={id}>
        <label className={LABEL} htmlFor={`ficha-${id}`}>
          {c.rotulo}
        </label>
        <input
          id={`ficha-${id}`}
          className={CAMPO}
          type={c.tipo === "data" ? "date" : "text"}
          inputMode={c.tipo === "moeda" || c.tipo === "area" ? "decimal" : c.tipo === "numero" ? "numeric" : undefined}
          placeholder={c.tipo === "moeda" ? "0,00" : undefined}
          value={ficha.campos[id] ?? ""}
          onChange={(e) => definirCampo(id, e.target.value)}
        />
      </div>
    );
  };
  const escolha = (id: string) => {
    const e = ESCOLHAS_FICHA.find((x) => x.id === id)!;
    return (
      <div key={id}>
        <div className={LABEL}>{e.rotulo}</div>
        <div className="flex flex-wrap gap-1.5">
          {e.opcoes.map((o) => (
            <Pilula key={o} marcada={(ficha.escolhas[id] ?? []).includes(o)} aoClicar={() => alternarEscolha(id, o, e.multipla)}>
              {o}
            </Pilula>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="text-[11px] font-semibold text-gray-500 mb-2">Negociação</div>
        <div className="grid md:grid-cols-3 gap-3 mb-3">
          {inputCampo("valorLocacao")}
          {inputCampo("finalidade")}
          {inputCampo("condicaoComercial")}
        </div>
        <div className="grid md:grid-cols-2 gap-x-4 gap-y-3">
          {escolha("padrao")}
          {escolha("localizacao")}
          {escolha("financiado")}
          {escolha("usouFgts")}
          {escolha("autorizadoNegociacao")}
          {escolha("exclusividade")}
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-3">
          {inputCampo("nomeEdificio")}
          {inputCampo("nomeCondominio")}
          {inputCampo("valorCondominio")}
          {inputCampo("valorIptu")}
          {inputCampo("inicioContrato")}
          {inputCampo("validadeDias")}
        </div>
      </section>

      <section>
        <div className="text-[11px] font-semibold text-gray-500 mb-2">Situação do imóvel</div>
        <div className="grid md:grid-cols-2 gap-x-4 gap-y-3">
          {escolha("situacao")}
          {escolha("pelo")}
        </div>
        {(ficha.escolhas.situacao ?? []).includes("Ocupado") && <div className="grid md:grid-cols-3 gap-3 mt-3">{inputCampo("ocupadoAte")}</div>}
      </section>

      <section>
        <div className="text-[11px] font-semibold text-gray-500 mb-2">Características (marque tudo que tiver)</div>
        <div className="grid md:grid-cols-3 gap-3 mb-3">
          {inputCampo("areaTotal")}
          {inputCampo("areaUtil")}
          {inputCampo("areaExterna")}
        </div>
        <div className="mb-3">{escolha("face")}</div>
        <div className="flex flex-col gap-3">
          {GRUPOS_FICHA.map((g) => (
            <div key={g.id}>
              <div className={LABEL}>
                {g.titulo}
                {(ficha.grupos[g.id]?.length ?? 0) > 0 && <span className="text-gray-400"> · {ficha.grupos[g.id].length} marcado(s)</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.opcoes.map((o) => (
                  <Pilula key={o} marcada={(ficha.grupos[g.id] ?? []).includes(o)} aoClicar={() => alternarGrupo(g.id, o)}>
                    {o}
                  </Pilula>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <label className={LABEL} htmlFor="ficha-obs">
            Quantidades e observações (ex.: 3 dormitórios, 2 suítes, 2 vagas)
          </label>
          <input id="ficha-obs" className={CAMPO} value={ficha.caracteristicasObs} onChange={(e) => aoMudar({ ...ficha, caracteristicasObs: e.target.value })} />
        </div>
      </section>

      <section>
        <div className="text-[11px] font-semibold text-gray-500 mb-2">Documentação e detalhes</div>
        <div className="grid md:grid-cols-3 gap-3 mb-3">
          {inputCampo("localChave")}
          {inputCampo("anoConstrucao")}
          {inputCampo("anoReforma")}
          {inputCampo("eletricidade")}
          {inputCampo("agua")}
        </div>
        {escolha("placa")}
      </section>

      <section className="grid gap-3">
        <div>
          <label className={LABEL} htmlFor="ficha-anuncio">
            Descrição para anúncios (site e jornal)
          </label>
          <textarea id="ficha-anuncio" className={`${CAMPO} min-h-20`} value={ficha.descricaoAnuncios} onChange={(e) => aoMudar({ ...ficha, descricaoAnuncios: e.target.value })} />
        </div>
        <div>
          <label className={LABEL} htmlFor="ficha-interno">
            Comentário interno (só aparece na ficha impressa)
          </label>
          <textarea id="ficha-interno" className={`${CAMPO} min-h-16`} value={ficha.comentarioInterno} onChange={(e) => aoMudar({ ...ficha, comentarioInterno: e.target.value })} />
        </div>
      </section>
    </div>
  );
}
