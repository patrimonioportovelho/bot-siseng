import Link from "next/link";
import { hojePortoVelho } from "@/lib/format";

// Calendário compartilhado entre Manutenção e Gestões (ver app/manutencao/
// calendario/page.tsx, que já busca e normaliza as atividades dos dois
// módulos antes de passar pra cá) — por isso o tipo é genérico: cada
// atividade já vem com o rótulo do tipo, o href da ficha de origem e um
// texto de contexto (título do ticket/gestão), sem depender de qual tabela
// ela veio.
type Atividade = {
  id: string;
  tipoLabel: string;
  titulo: string;
  data: Date;
  hora?: string | null;
  feito: boolean;
  href: string;
  contexto: string;
  cancelado?: boolean;
  canceladoMotivo?: string | null;
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function corBadgeAtividade(a: Atividade, atrasada: boolean): string {
  if (a.cancelado) return "bg-red-50 text-red-500 border-red-200 line-through";
  if (atrasada) return "bg-[#B14226]/10 text-[#B14226] border-[#B14226]/30 font-semibold";
  if (a.feito) return "bg-[#3C7A57]/10 text-[#3C7A57] border-[#3C7A57]/30";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

// Visão mensal — grade de semanas (domingo a sábado) com os dias do mês
// anterior/seguinte esmaecidos só pra completar a grade visualmente (não são
// clicáveis pra outro mês, é só preenchimento).
export function ManutencaoCalendario({
  ano,
  mesIndice,
  atividades
}: {
  ano: number;
  mesIndice: number;
  atividades: Atividade[];
}) {
  const primeiroDiaMes = new Date(ano, mesIndice, 1);
  const ultimoDiaMes = new Date(ano, mesIndice + 1, 0);
  const inicioGrade = new Date(ano, mesIndice, 1 - primeiroDiaMes.getDay());
  const totalCelulas = Math.ceil((primeiroDiaMes.getDay() + ultimoDiaMes.getDate()) / 7) * 7;

  const hoje = hojePortoVelho();

  const celulas: Date[] = [];
  for (let i = 0; i < totalCelulas; i++) {
    celulas.push(new Date(inicioGrade.getFullYear(), inicioGrade.getMonth(), inicioGrade.getDate() + i));
  }

  // No mobile a grade de 7 colunas fica estreita demais pra caber título +
  // horário das atividades (usuário reportou 21/08/2026 — "não está
  // enquadrando"). Abaixo de md trocamos pra uma agenda em lista, um dia por
  // linha, com o texto das atividades por extenso; a grade tradicional
  // continua igual em telas md+.
  const diasDoMes: Date[] = [];
  for (let d = 1; d <= ultimoDiaMes.getDate(); d++) {
    diasDoMes.push(new Date(ano, mesIndice, d));
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="md:hidden flex flex-col divide-y divide-gray-100">
        {diasDoMes.map((dia) => {
          const ehHoje = mesmoDia(dia, hoje);
          const atividadesDoDia = atividades.filter((a) => mesmoDia(new Date(a.data), dia));
          return (
            <div key={dia.getTime()} className={`flex gap-3 px-3 py-2 ${ehHoje ? "bg-primary/5" : ""}`}>
              <div className="shrink-0 w-9 text-center pt-0.5">
                <div className={`text-[10px] font-semibold ${ehHoje ? "text-primary" : "text-gray-400"}`}>
                  {DIAS_SEMANA[dia.getDay()]}
                </div>
                <div
                  className={`text-sm font-bold w-6 h-6 mx-auto flex items-center justify-center rounded-full ${
                    ehHoje ? "bg-primary text-white" : "text-gray-700"
                  }`}
                >
                  {dia.getDate()}
                </div>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1 py-1">
                {atividadesDoDia.length === 0 && <div className="text-[11px] text-gray-300">—</div>}
                {atividadesDoDia.map((a) => {
                  const atrasada = !a.feito && !a.cancelado && dia < hoje;
                  const titulo = a.hora ? `${a.hora} ${a.titulo}` : a.titulo;
                  return (
                    <Link
                      key={a.id}
                      href={a.href}
                      className={`text-[11px] rounded-lg px-2 py-1 border ${corBadgeAtividade(a, atrasada)}`}
                    >
                      <div className="font-medium">{titulo}</div>
                      <div className="text-[10px] opacity-80">
                        {a.tipoLabel} — {a.contexto}
                        {a.cancelado && a.canceladoMotivo ? `: "${a.canceladoMotivo}"` : ""}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden md:grid grid-cols-7 border-b border-gray-100">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-[11px] font-semibold text-gray-400 text-center py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="hidden md:grid grid-cols-7">
        {celulas.map((dia, i) => {
          const foraDoMes = dia.getMonth() !== mesIndice;
          const ehHoje = mesmoDia(dia, hoje);
          const atividadesDoDia = atividades.filter((a) => mesmoDia(new Date(a.data), dia));

          return (
            <div
              key={i}
              className={`min-h-[90px] md:min-h-[110px] border-b border-r border-gray-100 p-1.5 flex flex-col gap-1 ${
                foraDoMes ? "bg-gray-50/50" : "bg-white"
              }`}
            >
              <span
                className={`text-[11px] w-5 h-5 flex items-center justify-center rounded-full ${
                  ehHoje ? "bg-primary text-white font-bold" : foraDoMes ? "text-gray-300" : "text-gray-500"
                }`}
              >
                {dia.getDate()}
              </span>
              <div className="flex flex-col gap-1">
                {atividadesDoDia.map((a) => {
                  const atrasada = !a.feito && !a.cancelado && dia < hoje;
                  // hora avulsa (16/08/2026) — pedido do usuário: "para que
                  // se veja os horarios juntamente com o dia e a OM". Some
                  // do texto quando a atividade não tem horário definido.
                  const titulo = a.hora ? `${a.hora} ${a.titulo}` : a.titulo;
                  const tooltip = a.cancelado
                    ? `${a.tipoLabel} — ${a.contexto} — CANCELADO${a.canceladoMotivo ? `: ${a.canceladoMotivo}` : ""}`
                    : `${a.tipoLabel} — ${a.contexto}`;
                  return (
                    <Link
                      key={a.id}
                      href={a.href}
                      title={tooltip}
                      className={`text-[10px] rounded px-1.5 py-0.5 truncate border ${corBadgeAtividade(a, atrasada)}`}
                    >
                      {titulo}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
