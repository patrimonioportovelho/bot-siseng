"use client";

import { useMemo, useState } from "react";
import { TIPOS_META, PERIODO_TIPO_OPCOES, tipoMetaOpcao, calcularPeriodo } from "@/lib/metas/opcoes";
import { formatValorEditavel } from "@/lib/format";

type CorretorOpcao = { id: string; nome: string; funcao: string | null };
type LojaOpcao = { id: string; nome: string };

type MetaExistente = {
  id: string;
  tipo_meta: string;
  parceiro_id: string | null;
  loja_id: string | null;
  periodo_tipo: string;
  periodo_inicio: Date;
  periodo_fim: Date;
  valor_meta: unknown;
  observacao: string | null;
};

function inputDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Formulário de cadastro/edição de Meta — pensado pra deixar bem claro, na
// hora de cadastrar, que toda meta precisa de um objetivo/explicação (pedido
// explícito: "precisa ter explicações precisa ter objetivo"). O tipo
// escolhido mostra a ajuda de como o progresso é apurado automaticamente
// (nenhuma meta aqui exige que alguém marque "concluído" na mão — o sistema
// mesmo conta a partir dos cadastros reais, ver lib/metas/calculo.ts).
export function MetaForm({
  meta,
  corretores,
  lojas,
  action
}: {
  meta: MetaExistente | null;
  corretores: CorretorOpcao[];
  lojas: LojaOpcao[];
  action: (formData: FormData) => void;
}) {
  const m = meta;

  const [tipoMeta, setTipoMeta] = useState(m?.tipo_meta ?? TIPOS_META[0].chave);
  const opcaoAtual = tipoMetaOpcao(tipoMeta);

  const [escopo, setEscopo] = useState<"geral" | "individual">(m?.parceiro_id ? "individual" : "geral");
  const [parceiroId, setParceiroId] = useState(m?.parceiro_id ?? "");

  const [periodoTipo, setPeriodoTipo] = useState(m?.periodo_tipo ?? "Mensal");
  const [referencia, setReferencia] = useState(() => {
    const base = m?.periodo_inicio ?? new Date();
    return new Date(base).toISOString().slice(0, 7);
  });
  const [periodoInicio, setPeriodoInicio] = useState(inputDate(m?.periodo_inicio) || "");
  const [periodoFim, setPeriodoFim] = useState(inputDate(m?.periodo_fim) || "");

  const [valorMetaTexto, setValorMetaTexto] = useState(
    m?.valor_meta != null ? formatValorEditavel(m.valor_meta) : ""
  );

  function aplicarPeriodoSugerido(tipo: string, ref: string) {
    const sugerido = calcularPeriodo(tipo, ref);
    if (sugerido) {
      setPeriodoInicio(sugerido.inicio);
      setPeriodoFim(sugerido.fim);
    }
  }

  const corretoresOrdenados = useMemo(() => [...corretores].sort((a, b) => a.nome.localeCompare(b.nome)), [corretores]);

  return (
    <form action={action} className="flex flex-col gap-5">
      {m && <input type="hidden" name="metaId" value={m.id} />}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">O que essa meta mede</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Tipo de meta</label>
            <select
              className={CAMPO}
              name="tipo_meta"
              value={tipoMeta}
              onChange={(e) => setTipoMeta(e.target.value)}
              required
            >
              {TIPOS_META.map((t) => (
                <option key={t.chave} value={t.chave}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Valor alvo ({opcaoAtual?.unidadePadrao})</label>
            <input
              className={CAMPO}
              name="valor_meta"
              placeholder={opcaoAtual?.natureza === "valor" ? "500.000,00" : "10"}
              value={valorMetaTexto}
              onChange={(e) => setValorMetaTexto(e.target.value)}
              required
            />
          </div>
        </div>
        {opcaoAtual && (
          <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mt-3">
            Como é apurado: {opcaoAtual.ajuda}
          </p>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Objetivo e explicação</div>
        <p className="text-[11px] text-gray-400 mb-3">
          Escreva o que se espera com essa meta — esse texto aparece pro corretor junto do progresso. Toda meta
          precisa deixar isso claro.
        </p>
        <textarea
          className={CAMPO + " min-h-24"}
          name="observacao"
          required
          placeholder='Ex.: "Precisamos reduzir o estoque de administrações sem inquilino — foque em anunciar e visitar esses imóveis com interessados."'
          defaultValue={m?.observacao ?? ""}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Para quem é a meta</div>
        <div className="flex flex-col gap-2 mb-3">
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input type="radio" name="escopo" checked={escopo === "geral"} onChange={() => setEscopo("geral")} />
            Geral (soma de todos os corretores e estagiários juntos)
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="radio"
              name="escopo"
              checked={escopo === "individual"}
              onChange={() => setEscopo("individual")}
            />
            Individual (só um Parceiro específico)
          </label>
        </div>
        <input type="hidden" name="parceiro_id" value={escopo === "individual" ? parceiroId : ""} />
        {escopo === "individual" && (
          <div>
            <label className={LABEL}>Corretor / Corretor estagiário</label>
            <select className={CAMPO} value={parceiroId} onChange={(e) => setParceiroId(e.target.value)} required>
              <option value="" disabled>
                Selecione...
              </option>
              {corretoresOrdenados.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.funcao === "Corretor Estagiário" ? " (estagiário)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-3">
          <label className={LABEL}>Loja (opcional)</label>
          <select className={CAMPO} name="loja_id" defaultValue={m?.loja_id ?? ""}>
            <option value="">Todas as lojas</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">
            Não filtra tipos de meta ligados a Imóveis/Financiamento (esses cadastros não têm loja).
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Período</div>
        <div className="grid md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className={LABEL}>Periodicidade</label>
            <select
              className={CAMPO}
              name="periodo_tipo"
              value={periodoTipo}
              onChange={(e) => {
                setPeriodoTipo(e.target.value);
                aplicarPeriodoSugerido(e.target.value, referencia);
              }}
            >
              {PERIODO_TIPO_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Mês de referência</label>
            <input
              type="month"
              className={CAMPO}
              value={referencia}
              onChange={(e) => {
                setReferencia(e.target.value);
                aplicarPeriodoSugerido(periodoTipo, e.target.value);
              }}
            />
            <p className="text-[11px] text-gray-400 mt-1">Só pra sugerir as datas ao lado — ajustáveis na mão.</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Início do período</label>
            <input
              type="date"
              className={CAMPO}
              name="periodo_inicio"
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={LABEL}>Fim do período</label>
            <input
              type="date"
              className={CAMPO}
              name="periodo_fim"
              value={periodoFim}
              onChange={(e) => setPeriodoFim(e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90">
          {m ? "Salvar alterações" : "Cadastrar meta"}
        </button>
      </div>
    </form>
  );
}
