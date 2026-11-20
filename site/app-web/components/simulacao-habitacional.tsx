"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { formatMoeda } from "@/lib/format";
import type { EntradaSimulacao, ResultadoSimulacao } from "@/lib/financiamento/simulacao";
import type { RespostaGerarSimulacao } from "@/app/financiamento/simulacao-actions";
import type { CampoCredito, RespostaCredito } from "@/lib/financiamento/avaliacao-credito";

export type PrefillSimulacao = {
  valorCompra: number | null;
  renda: number | null;
  nascimento: string | null; // YYYY-MM-DD
  municipio: string;
  uf: string;
};

export type ItemHistoricoSimulacao = {
  id: string;
  criadoEm: string;
  por: string | null;
  entrada: EntradaSimulacao;
  resultado: ResultadoSimulacao;
};

type Form = {
  valorCompra: string;
  valorAvaliacao: string;
  municipio: string;
  uf: string;
  renda: string;
  nascimento: string;
  sistema: "SAC" | "PRICE";
  prazo: string;
  saldoFgts: string;
  fgts3anos: boolean;
  possuiImovel: boolean;
  possuiSfh: boolean;
  jaUsouFgts: boolean;
  maisCompradores: boolean;
  relacionamento: boolean;
};

// Respostas da avaliação de crédito (feitas pelo corretor no portal e corrigíveis na etiqueta). Alimentam a simulação.
export type RespostasCreditoSimulacao = Record<CampoCredito, RespostaCredito>;

// Quanto cada resposta vale na simulação:
//  - 3 anos de FGTS: libera o uso do FGTS na entrada e define o cliente como cotista (taxa menor no MCMV);
//  - primeiro imóvel: "Sim" = não possui imóvel; "Não" = possui (bloqueia MCMV e FGTS; mude para "Não" se o imóvel for em outra cidade);
//  - mais de um comprador/dependente: só gera alerta por enquanto.
function doCredito(r: RespostasCreditoSimulacao | undefined) {
  return {
    fgts3anos: r?.credito_fgts_3_anos === "sim",
    possuiImovel: r?.credito_primeiro_imovel === "nao",
    maisCompradores: r?.credito_mais_compradores === "sim"
  };
}

const CAMPO = "w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white";
const LABEL = "text-[11px] text-gray-600 block mb-0.5";

const paraTexto = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

// "280.000,00" / "280000" / "R$ 280.000" -> 280000
function lerNumeroBr(s: string): number | null {
  const t = s.replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, "")) : Number(t);
  return Number.isFinite(n) ? n : null;
}

const rotuloResposta = (r: RespostaCredito) => (r === "sim" ? "sim" : r === "nao" ? "não" : "não respondido");
const pct = (n: number | null | undefined, casas = 2) => (n == null ? "—" : `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const dinheiro = (n: number | null | undefined) => (n == null ? "—" : formatMoeda(n));
const dataBr = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Porto_Velho", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

function formDeEntrada(e: EntradaSimulacao): Form {
  return {
    valorCompra: paraTexto(e.valor_compra),
    valorAvaliacao: paraTexto(e.valor_avaliacao),
    municipio: e.municipio,
    uf: e.uf,
    renda: paraTexto(e.renda_bruta_familiar),
    nascimento: e.data_nascimento_mais_velho,
    sistema: e.sistema_amortizacao,
    prazo: paraTexto(e.prazo_desejado_meses),
    saldoFgts: paraTexto(e.saldo_fgts),
    fgts3anos: e.fgts_3_anos,
    possuiImovel: e.possui_imovel_residencial_municipio,
    possuiSfh: e.possui_financiamento_sfh_ativo,
    jaUsouFgts: e.ja_usou_fgts_em_financiamento,
    maisCompradores: !!e.mais_de_um_comprador,
    relacionamento: !!e.relacionamento_caixa
  };
}

function SimNao({ valor, aoMudar, rotulo }: { valor: boolean; aoMudar: (v: boolean) => void; rotulo: string }) {
  return (
    <div>
      <label className={LABEL}>{rotulo}</label>
      <select className={CAMPO} value={valor ? "sim" : "nao"} onChange={(e) => aoMudar(e.target.value === "sim")}>
        <option value="nao">Não</option>
        <option value="sim">Sim</option>
      </select>
    </div>
  );
}

function Quadro({ rotulo, valor, sub, destaque }: { rotulo: string; valor: string; sub?: ReactNode; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${destaque ? "bg-primary/5 border-primary/20" : "bg-gray-50 border-gray-100"}`}>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{rotulo}</div>
      <div className="text-base font-bold text-gray-900 mt-0.5">{valor}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function textoResumo(r: ResultadoSimulacao, e: EntradaSimulacao): string {
  const linhas = [
    `Simulação de financiamento habitacional (imóvel usado) — ${e.municipio}/${e.uf}`,
    `Modalidade: ${r.modalidade}${r.faixa_mcmv ? ` — faixa ${r.faixa_mcmv}` : ""} (${r.sistema_amortizacao}, ${r.prazo_meses} meses)`,
    `Valor do imóvel: ${dinheiro(e.valor_compra)}`,
    `Valor financiado: ${dinheiro(r.valor_financiado)} (cota de ${pct(r.ltv_aplicado, 0)})`,
    `Entrada: ${dinheiro(r.entrada_total)}${r.fgts_utilizavel ? ` (FGTS ${dinheiro(r.fgts_utilizavel)} + recursos próprios ${dinheiro(r.recursos_proprios)})` : ""}`,
    `1ª prestação: ${dinheiro(r.primeira_prestacao)} | Última: ${dinheiro(r.ultima_prestacao)}`,
    `Juros: ${pct(r.taxa_nominal_aa)} a.a. nominais + TR | CET: ${pct(r.cet_aa)} a.a.`,
    "",
    r.aviso
  ];
  return linhas.join("\n");
}

function Resultado({ r, e }: { r: ResultadoSimulacao; e: EntradaSimulacao }) {
  const [copiado, setCopiado] = useState(false);
  const [todas, setTodas] = useState(false);

  if (r.status !== "ok") {
    const cor = r.status === "entrada_invalida" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-700";
    return (
      <div className={`rounded-lg border px-3 py-2.5 text-xs ${cor}`}>
        <div className="font-semibold">{r.mensagem ?? "Não foi possível simular."}</div>
        {r.motivo_enquadramento && <div className="mt-1 opacity-80">{r.motivo_enquadramento}</div>}
        {r.parametros_ausentes.length > 0 && (
          <div className="mt-1.5">
            Parâmetros em falta: <span className="font-mono">{r.parametros_ausentes.join(", ")}</span>.{" "}
            <Link href="/financiamento/parametros-simulacao" className="underline font-semibold">
              Abrir parâmetros da simulação
            </Link>
          </div>
        )}
      </div>
    );
  }

  const linhas = todas ? r.cronograma : r.cronograma.slice(0, 12);
  const venc = (k: number) => {
    const d = new Date(`${r.primeiro_vencimento}T00:00:00.000Z`);
    d.setUTCMonth(d.getUTCMonth() + k - 1);
    return d.toLocaleDateString("pt-BR", { timeZone: "UTC", month: "2-digit", year: "numeric" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 flex-wrap">
        <span className={`text-[11px] font-bold rounded-full border px-2.5 py-1 ${r.modalidade === "MCMV" ? "bg-green-50 text-green-700 border-green-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
          {r.modalidade}
          {r.faixa_mcmv ? ` · Faixa ${r.faixa_mcmv}` : ""}
        </span>
        <span className="text-[11px] text-gray-600 flex-1 min-w-[200px]">{r.motivo_enquadramento}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Quadro destaque rotulo="Valor financiado" valor={dinheiro(r.valor_financiado)} sub={`Cota ${pct(r.ltv_aplicado, 0)} · limitado por ${r.limitado_por === "ltv" ? "cota do imóvel" : "renda"}`} />
        <Quadro
          destaque
          rotulo="Entrada"
          valor={dinheiro(r.entrada_total)}
          sub={r.fgts_utilizavel ? `FGTS ${dinheiro(r.fgts_utilizavel)} + próprios ${dinheiro(r.recursos_proprios)}` : "Recursos próprios"}
        />
        <Quadro destaque rotulo="1ª prestação" valor={dinheiro(r.primeira_prestacao)} sub={`Última: ${dinheiro(r.ultima_prestacao)}`} />
        <Quadro rotulo="Prazo" valor={`${r.prazo_meses} meses`} sub={`${r.sistema_amortizacao} · TR`} />
        <Quadro rotulo="Juros nominais" valor={`${pct(r.taxa_nominal_aa)} a.a.`} sub={`Efetivos ${pct(r.taxa_efetiva_aa)} a.a.`} />
        <Quadro rotulo="CET" valor={`${pct(r.cet_aa)} a.a.`} sub={r.encargos_incluidos ? "com seguros e taxas" : "sem seguros (não configurados)"} />
        <Quadro rotulo="Soma das parcelas" valor={dinheiro(r.soma_parcelas)} sub={`Com encargos: ${dinheiro(r.soma_encargos)}`} />
        <Quadro rotulo="Base de cálculo" valor={dinheiro(r.base_calculo)} sub={r.avaliacao_pendente ? "avaliação pendente" : "menor entre compra e avaliação"} />
      </div>

      {r.composicao_primeira && (
        <div className="rounded-lg border border-gray-100 p-3">
          <div className="text-[11px] font-semibold text-gray-700 mb-1.5">Composição da 1ª prestação</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            {(
              [
                ["Amortização", r.composicao_primeira.amortizacao],
                ["Juros", r.composicao_primeira.juros],
                ["Seguro MIP", r.composicao_primeira.mip],
                ["Seguro DFI", r.composicao_primeira.dfi],
                ["Taxa de administração", r.composicao_primeira.taxa_administracao]
              ] as const
            ).map(([nome, v]) => (
              <div key={nome}>
                <div className="text-[10px] text-gray-500">{nome}</div>
                <div className="font-semibold text-gray-800">{dinheiro(v)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-100 p-3 text-xs text-gray-700">
        <div className="text-[11px] font-semibold text-gray-700 mb-1">Custos iniciais estimados</div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span>Tarifa de avaliação: <b>{dinheiro(r.custos_iniciais.tarifa_avaliacao)}</b></span>
          <span>Seguro à vista: <b>{dinheiro(r.custos_iniciais.seguro_a_vista)}</b></span>
          <span>ITBI: <b>{r.custos_iniciais.itbi_estimado == null ? "sem alíquota configurada" : dinheiro(r.custos_iniciais.itbi_estimado)}</b></span>
          {r.impacto_avaliacao != null && <span>Impacto da avaliação no financiamento: <b>{dinheiro(r.impacto_avaliacao)}</b></span>}
        </div>
      </div>

      {r.alertas.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <div className="font-semibold mb-1">Alertas</div>
          <ul className="list-disc pl-4 flex flex-col gap-0.5">
            {r.alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="rounded-lg border border-gray-100 px-3 py-2 text-xs">
        <summary className="cursor-pointer font-semibold text-gray-700">Checklist do imóvel usado</summary>
        <ul className="list-disc pl-4 mt-1.5 flex flex-col gap-0.5 text-gray-600">
          {r.checklist_imovel_usado.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>

      <details className="rounded-lg border border-gray-100 px-3 py-2 text-xs">
        <summary className="cursor-pointer font-semibold text-gray-700">Planilha de prestações ({r.cronograma.length} meses)</summary>
        <div className={`mt-2 overflow-auto ${todas ? "max-h-96" : ""}`}>
          <table className="w-full min-w-[520px] text-[11px]">
            <thead className="text-gray-500 text-left">
              <tr>
                {["Nº", "Vencimento", "Prestação", "MIP", "DFI", "Taxa adm.", "Encargo", "Saldo devedor"].map((h, i) => (
                  <th key={h} className={`font-normal py-1 border-b border-gray-100 ${i > 1 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l[0]}>
                  <td className="py-0.5 border-b border-gray-50">{l[0]}</td>
                  <td className="py-0.5 border-b border-gray-50">{venc(l[0])}</td>
                  {l.slice(1).map((v, i) => (
                    <td key={i} className={`py-0.5 border-b border-gray-50 text-right ${i === 4 ? "font-semibold" : ""}`}>
                      {formatMoeda(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {r.cronograma.length > 12 && (
            <button type="button" onClick={() => setTodas((t) => !t)} className="mt-2 text-[11px] text-primary font-semibold underline">
              {todas ? "Mostrar só as 12 primeiras" : `Mostrar as ${r.cronograma.length} parcelas`}
            </button>
          )}
        </div>
      </details>

      <div className="flex items-center gap-2 flex-wrap print:hidden">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(textoResumo(r, e));
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              /* sem permissão da área de transferência */
            }
          }}
          className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600"
        >
          {copiado ? "Resumo copiado ✓" : "Copiar resumo"}
        </button>
        <button type="button" onClick={() => window.print()} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600">
          Imprimir
        </button>
      </div>
      <p className="text-[10px] text-gray-400">{r.aviso}</p>
    </div>
  );
}

// Simulação de financiamento habitacional (Caixa) para imóveis usados. Aparece na etiqueta do Financiamento quando o
// cliente está em "Montagem de processo". Os valores de taxa, teto e seguro vêm dos parâmetros cadastrados no sistema.
export function SimulacaoHabitacional({
  avaliacaoId,
  prefill,
  respostasCredito,
  historico,
  gerar
}: {
  avaliacaoId: string;
  prefill: PrefillSimulacao;
  // sempre as respostas ATUAIS (a etiqueta as reenvia quando são corrigidas)
  respostasCredito?: RespostasCreditoSimulacao;
  historico: ItemHistoricoSimulacao[];
  gerar: (avaliacaoId: string, entrada: Record<string, unknown>) => Promise<RespostaGerarSimulacao>;
}) {
  const cred = doCredito(respostasCredito);
  const [f, setF] = useState<Form>({
    valorCompra: paraTexto(prefill.valorCompra),
    valorAvaliacao: "",
    municipio: prefill.municipio,
    uf: prefill.uf,
    renda: paraTexto(prefill.renda),
    nascimento: prefill.nascimento ?? "",
    sistema: "SAC",
    prazo: "",
    saldoFgts: "",
    fgts3anos: cred.fgts3anos,
    possuiImovel: cred.possuiImovel,
    possuiSfh: false,
    jaUsouFgts: false,
    maisCompradores: cred.maisCompradores,
    relacionamento: false
  });
  // Corrigiu uma resposta na etiqueta: a simulação acompanha na hora.
  useEffect(() => {
    setF((x) => ({ ...x, fgts3anos: cred.fgts3anos, possuiImovel: cred.possuiImovel, maisCompradores: cred.maisCompradores }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respostasCredito?.credito_fgts_3_anos, respostasCredito?.credito_primeiro_imovel, respostasCredito?.credito_mais_compradores]);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [atual, setAtual] = useState<{ entrada: EntradaSimulacao; resultado: ResultadoSimulacao; quando: string | null } | null>(null);
  const [lista, setLista] = useState(historico);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof Form, rotulo: string, placeholder?: string, tipo = "text") => (
    <div>
      <label className={LABEL}>{rotulo}</label>
      <input className={CAMPO} type={tipo} value={String(f[k])} placeholder={placeholder} onChange={(e) => set(k, e.target.value as never)} autoComplete="off" />
    </div>
  );

  async function gerarSimulacao() {
    setErro(null);
    setGerando(true);
    try {
      const r = await gerar(avaliacaoId, {
        valor_compra: lerNumeroBr(f.valorCompra),
        valor_avaliacao: lerNumeroBr(f.valorAvaliacao),
        municipio: f.municipio,
        uf: f.uf,
        renda_bruta_familiar: lerNumeroBr(f.renda),
        data_nascimento_mais_velho: f.nascimento,
        sistema_amortizacao: f.sistema,
        prazo_desejado_meses: lerNumeroBr(f.prazo),
        saldo_fgts: lerNumeroBr(f.saldoFgts),
        fgts_3_anos: f.fgts3anos,
        possui_imovel_residencial_municipio: f.possuiImovel,
        possui_financiamento_sfh_ativo: f.possuiSfh,
        ja_usou_fgts_em_financiamento: f.jaUsouFgts,
        // quem tem 3 anos de FGTS é cotista (define a taxa do MCMV)
        cotista_fgts: f.fgts3anos,
        relacionamento_caixa: f.relacionamento,
        mais_de_um_comprador: f.maisCompradores
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setAtual({ entrada: r.entrada, resultado: r.resultado, quando: r.criadoEm });
      if (r.id) setLista((l) => [{ id: r.id as string, criadoEm: r.criadoEm, por: "você", entrada: r.entrada, resultado: r.resultado }, ...l]);
    } catch {
      setErro("Não foi possível gerar a simulação agora. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
        <div className="text-sm font-bold text-gray-800">Simulação habitacional — imóveis usados</div>
        <Link href="/financiamento/parametros-simulacao" className="text-[11px] text-primary font-semibold hover:underline">
          Parâmetros da simulação →
        </Link>
      </div>
      <p className="text-[11px] text-gray-500 mb-3">
        Estimativa de financiamento da Caixa (MCMV ou SBPE) para a fase de montagem do processo. Confirme a renda e as respostas antes de gerar.
      </p>

      {respostasCredito && (
        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-900">
          <span className="font-semibold">Vem da avaliação de crédito:</span>{" "}
          3 anos de FGTS: <b>{rotuloResposta(respostasCredito.credito_fgts_3_anos)}</b> · mais de um comprador/dependente:{" "}
          <b>{rotuloResposta(respostasCredito.credito_mais_compradores)}</b> · primeiro imóvel: <b>{rotuloResposta(respostasCredito.credito_primeiro_imovel)}</b>. Se
          corrigir as perguntas acima, a simulação acompanha. “Não é o primeiro imóvel” conta como possuir imóvel (bloqueia MCMV e FGTS); se o imóvel for em outra
          cidade, mude o campo abaixo para “Não”.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {txt("valorCompra", "Valor do imóvel (compra) *", "280.000,00")}
        {txt("valorAvaliacao", "Valor de avaliação (laudo)", "opcional")}
        {txt("municipio", "Município *")}
        {txt("uf", "UF *")}
        {txt("renda", "Renda bruta familiar *", "8.500,00")}
        {txt("nascimento", "Nascimento do mais velho *", undefined, "date")}
        <div>
          <label className={LABEL}>Sistema de amortização</label>
          <select className={CAMPO} value={f.sistema} onChange={(e) => set("sistema", e.target.value as "SAC" | "PRICE")}>
            <option value="SAC">SAC</option>
            <option value="PRICE">Price</option>
          </select>
        </div>
        {txt("prazo", "Prazo desejado (meses)", "máximo permitido")}
        {txt("saldoFgts", "Saldo do FGTS para a entrada", "opcional")}
        <SimNao rotulo="3 anos ou mais de FGTS? (cotista)" valor={f.fgts3anos} aoMudar={(v) => set("fgts3anos", v)} />
        <SimNao rotulo="Possui imóvel residencial no município?" valor={f.possuiImovel} aoMudar={(v) => set("possuiImovel", v)} />
        <SimNao rotulo="Mais de um comprador e/ou dependente?" valor={f.maisCompradores} aoMudar={(v) => set("maisCompradores", v)} />
        <SimNao rotulo="Financiamento ativo no SFH?" valor={f.possuiSfh} aoMudar={(v) => set("possuiSfh", v)} />
        <SimNao rotulo="Já usou FGTS em financiamento ativo?" valor={f.jaUsouFgts} aoMudar={(v) => set("jaUsouFgts", v)} />
        <SimNao rotulo="Relacionamento com a Caixa?" valor={f.relacionamento} aoMudar={(v) => set("relacionamento", v)} />
      </div>

      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <button
          type="button"
          onClick={() => void gerarSimulacao()}
          disabled={gerando}
          className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold disabled:opacity-50 hover:opacity-90"
        >
          {gerando ? "Calculando..." : "Gerar simulação"}
        </button>
        {erro && <span className="text-[11px] text-red-600">{erro}</span>}
      </div>

      {atual && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="text-xs font-bold text-gray-800 mb-2">
            Resultado{atual.quando ? <span className="font-normal text-gray-400"> · {dataBr(atual.quando)}</span> : null}
          </div>
          <Resultado r={atual.resultado} e={atual.entrada} />
        </div>
      )}

      {lista.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3 print:hidden">
          <div className="text-xs font-bold text-gray-800 mb-1.5">Simulações anteriores</div>
          <div className="flex flex-col divide-y divide-gray-100">
            {lista.map((s) => (
              <div key={s.id} className="py-1.5 flex items-center gap-2 flex-wrap text-[11px] text-gray-600">
                <span className="text-gray-400">{dataBr(s.criadoEm)}{s.por ? ` · ${s.por.split(" ")[0]}` : ""}</span>
                <span className="font-semibold text-gray-700">
                  {s.resultado.modalidade}
                  {s.resultado.faixa_mcmv ? ` faixa ${s.resultado.faixa_mcmv}` : ""}
                </span>
                <span>financiado {dinheiro(s.resultado.valor_financiado)}</span>
                <span>1ª prestação {dinheiro(s.resultado.primeira_prestacao)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setF(formDeEntrada(s.entrada));
                    setAtual({ entrada: s.entrada, resultado: s.resultado, quando: s.criadoEm });
                  }}
                  className="ml-auto text-primary font-semibold underline"
                >
                  Abrir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
