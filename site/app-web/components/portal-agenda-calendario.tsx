import { hojePortoVelho } from "@/lib/format";

// Mesma grade visual de components/manutencao-calendario.tsx, mas SÓ
// LEITURA de propósito (pedido do usuário: "ele não vai poder agendar") —
// os itens não são links, porque metade vem de módulos que o corretor não
// tem acesso (Marketing, Manutenção não têm tela própria no portal). É
// overview do que já está confirmado, não um calendário de compromisso
// pessoal.
type Item = {
  id: string;
  tipoLabel: string;
  titulo: string;
  data: Date;
  contexto: string;
  cor: "azul" | "verde" | "roxo";
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const CORES: Record<Item["cor"], string> = {
  azul: "bg-[#33587F]/10 text-[#33587F] border-[#33587F]/30",
  verde: "bg-[#3C7A57]/10 text-[#3C7A57] border-[#3C7A57]/30",
  roxo: "bg-primary/10 text-primary border-primary/30"
};

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function PortalAgendaCalendario({ ano, mesIndice, itens }: { ano: number; mesIndice: number; itens: Item[] }) {
  const primeiroDiaMes = new Date(ano, mesIndice, 1);
  const ultimoDiaMes = new Date(ano, mesIndice + 1, 0);
  const inicioGrade = new Date(ano, mesIndice, 1 - primeiroDiaMes.getDay());
  const totalCelulas = Math.ceil((primeiroDiaMes.getDay() + ultimoDiaMes.getDate()) / 7) * 7;

  const hoje = hojePortoVelho();

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
          const itensDoDia = itens.filter((it) => mesmoDia(new Date(it.data), dia));

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
                {itensDoDia.map((it) => (
                  <div
                    key={it.id}
                    title={`${it.tipoLabel} — ${it.contexto}`}
                    className={`text-[10px] rounded px-1.5 py-0.5 truncate border ${CORES[it.cor]}`}
                  >
                    {it.titulo}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
