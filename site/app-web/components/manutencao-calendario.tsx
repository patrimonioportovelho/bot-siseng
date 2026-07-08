import Link from "next/link";
import { TIPO_ATIVIDADE_LABEL } from "@/lib/manutencao/opcoes";

type Atividade = {
  id: string;
  tipo: string;
  titulo: string;
  data: Date;
  feito: boolean;
  manutencoes: { id: string; titulo: string; imoveis: { endereco: string | null; id_legado: string | null } };
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const celulas: Date[] = [];
  for (let i = 0; i < totalCelulas; i++) {
    celulas.push(new Date(inicioGrade.getFullYear(), inicioGrade.getMonth(), inicioGrade.getDate() + i));
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-[11px] font-semibold text-gray-400 text-center py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
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
                  const atrasada = !a.feito && dia < hoje;
                  return (
                    <Link
                      key={a.id}
                      href={`/manutencao/${a.manutencoes.id}`}
                      title={`${TIPO_ATIVIDADE_LABEL[a.tipo] ?? a.tipo} — ${a.manutencoes.titulo}`}
                      className={`text-[10px] rounded px-1.5 py-0.5 truncate border ${
                        atrasada
                          ? "bg-[#B14226]/10 text-[#B14226] border-[#B14226]/30 font-semibold"
                          : a.feito
                          ? "bg-[#3C7A57]/10 text-[#3C7A57] border-[#3C7A57]/30"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                      }`}
                    >
                      {a.titulo}
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
