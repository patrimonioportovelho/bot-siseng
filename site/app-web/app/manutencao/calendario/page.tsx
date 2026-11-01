import { Topbar } from "@/components/topbar";
import { CalendarioAtividades } from "@/components/calendario-atividades";
import { AtividadesTabs } from "@/components/atividades-tabs";
import { hojePortoVelho } from "@/lib/format";
import { lojasSelecionadas } from "@/lib/lojas/filtro";
import { itensDoMes } from "@/lib/calendario/atividades";
import { coberturaDatasNascimento } from "@/lib/aniversarios";

export const dynamic = "force-dynamic";

// Formato do parâmetro "mes" na URL: YYYY-MM (ex.: 2026-07).
function parseMes(mes: string | undefined): { ano: number; mesIndice: number } {
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [ano, m] = mes.split("-").map(Number);
    if (m >= 1 && m <= 12) return { ano, mesIndice: m - 1 };
  }
  const hoje = hojePortoVelho();
  return { ano: hoje.getFullYear(), mesIndice: hoje.getMonth() };
}

// Calendário de Atividades: Manutenção, Gestões, Marketing, Eventos e
// Aniversários (clientes e parceiros) no mesmo mês, cada item levando à sua
// ficha. Só o primeiro mês vem do servidor; trocar de mês (Anterior / Hoje /
// Próximo) acontece na própria tela, com os vizinhos já carregados — ver
// components/calendario-atividades.tsx e app/api/calendario/route.ts.
export default async function ManutencaoCalendarioPage({
  searchParams
}: {
  searchParams: Promise<{ mes?: string; aniv?: string }>;
}) {
  const { mes, aniv } = await searchParams;
  const { ano, mesIndice } = parseMes(mes);

  const [itens, cobertura] = await Promise.all([
    lojasSelecionadas().then((lojas) => itensDoMes({ ano, mesIndice, lojas })),
    coberturaDatasNascimento({ incluirParceiros: true })
  ]);

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-gray-800">Atividades · Calendário</div>
        <AtividadesTabs ativo="/manutencao/calendario" />
      </div>

      <CalendarioAtividades
        mesInicial={`${ano}-${String(mesIndice + 1).padStart(2, "0")}`}
        itensIniciais={itens}
        aniversariosInicial={aniv !== "0"}
        cobertura={cobertura}
      />
    </div>
  );
}
