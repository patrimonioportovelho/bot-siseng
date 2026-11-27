"use client";

import type { ContatoCliente } from "@/app/clientes/funil-actions";
import { TEMPERATURAS, type AtividadeCliente, type CrmCliente } from "@/lib/crm/atividades";
import { textoDoCampo, type FichaDoCliente } from "@/lib/crm/ficha";
import { SEGMENTOS, type Segmento } from "@/lib/crm/roteiro";

const data = (iso: string) => iso.split("-").reverse().join("/");
const dataDoInstante = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho" });

// Dias até a próxima vez que esse dia e mês acontecem (0 = hoje).
function diasAte(iso: string, hoje: string): number {
  const base = Date.parse(`${hoje}T00:00:00Z`);
  const ano = Number(hoje.slice(0, 4));
  for (const a of [ano, ano + 1]) {
    const alvo = Date.parse(`${a}-${iso.slice(5)}T00:00:00Z`);
    if (!Number.isNaN(alvo) && alvo >= base) return Math.round((alvo - base) / 86400000);
  }
  return 999;
}

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide font-bold text-gray-400">{rotulo}</div>
      <div className="text-xs text-gray-800 break-words">{children}</div>
    </div>
  );
}

// "Antes de ligar": o que olhar em dez segundos antes de falar com o cliente.
export function AntesDeLigar({
  hoje,
  segmento,
  crm,
  contatos,
  atividades,
  ficha
}: {
  hoje: string;
  segmento: Segmento;
  crm: CrmCliente;
  contatos: ContatoCliente[];
  atividades: AtividadeCliente[];
  ficha: FichaDoCliente;
}) {
  // anotação interna não é contato com o cliente
  const ultimo = contatos.find((c) => c.tipo !== "Nota" && c.tipo !== "Transferência");
  const proxima = atividades.filter((a) => !a.feito).sort((a, b) => a.data.localeCompare(b.data))[0];
  const temperatura = crm.temperatura ? TEMPERATURAS[crm.temperatura] : null;
  const preferencias = [textoDoCampo(ficha.dados.horario, "texto"), textoDoCampo(ficha.dados.canal, "texto"), textoDoCampo(ficha.dados.perfil, "texto")].filter(Boolean).join(" · ");
  const nascimento = ficha.nascimentoCadastro ?? (typeof ficha.dados.nascimento === "string" ? ficha.dados.nascimento : null);
  const casamento = typeof ficha.dados.casamento === "string" ? ficha.dados.casamento : null;
  const datasProximas = (
    [
      ["🎂 Aniversário", nascimento],
      ["💍 Casamento", casamento]
    ] as const
  )
    .map(([rotulo, d]) => (d ? { rotulo, d, dias: diasAte(d, hoje) } : null))
    .filter((x): x is { rotulo: "🎂 Aniversário" | "💍 Casamento"; d: string; dias: number } => !!x && x.dias <= 30);

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      <div className="text-xs font-bold text-blue-900 mb-2">Antes de ligar</div>
      {crm.optOut && <div className="text-[11px] font-bold text-red-700 mb-2">⛔ Este cliente pediu para não receber novidades. Não faça contato de marketing.</div>}
      {crm.telefoneInvalido && <div className="text-[11px] font-bold text-amber-700 mb-2">Telefone marcado como inválido: confira o contato antes.</div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2">
        <Item rotulo="Segmento">
          {SEGMENTOS.find((s) => s.id === segmento)?.rotulo}
          {temperatura ? ` · ${temperatura.icone} ${temperatura.rotulo}` : ""}
        </Item>
        <Item rotulo="Último contato">{ultimo ? `${dataDoInstante(ultimo.data)} · ${ultimo.tipo}${ultimo.resultado ? ` · ${ultimo.resultado}` : ""}` : "Nenhum contato registrado"}</Item>
        <Item rotulo="Próxima ação">
          {proxima ? (
            <span className={proxima.data < hoje ? "text-red-700 font-semibold" : ""}>
              {data(proxima.data)}
              {proxima.data < hoje ? " (atrasada)" : proxima.data === hoje ? " (hoje)" : ""} · {proxima.titulo}
            </span>
          ) : (
            "Nada agendado"
          )}
        </Item>
        <Item rotulo="Como prefere">{preferencias || "Não informado"}</Item>
      </div>
      <div className="mt-2">
        <Item rotulo="Ganchos de conversa">
          {ficha.ganchos.length ? (
            <ul className="list-disc pl-4">
              {ficha.ganchos.slice(0, 3).map((g) => (
                <li key={g.id}>
                  {g.texto} <span className="text-gray-400">({dataDoInstante(g.criadoEm)})</span>
                </li>
              ))}
            </ul>
          ) : (
            "Nenhum ainda"
          )}
        </Item>
      </div>
      {datasProximas.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {datasProximas.map((d) => (
            <span key={d.rotulo} className="text-[11px] font-semibold rounded-full border border-pink-200 bg-pink-50 text-pink-800 px-2.5 py-0.5">
              {d.rotulo} {d.dias === 0 ? "é hoje!" : `em ${d.dias} dia${d.dias > 1 ? "s" : ""}`} ({data(d.d).slice(0, 5)})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
