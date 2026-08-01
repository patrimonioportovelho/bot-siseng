"use client";

import { useRouter } from "next/navigation";

// Filtro de mês/ano (pedido do usuário em 01/08/2026, painel do corretor de
// Compra e Venda): sempre mostra o mês atual por padrão, com este seletor
// pra ver outros meses — sempre por mês E ano juntos (input nativo
// type="month", não dá pra escolher só um ou só outro). Navega via query
// param na própria URL (?periodo=AAAA-MM), então funciona sem JS extra além
// da navegação — o valor recebido/calculado já vem pronto do servidor
// (page.tsx decide o mês atual quando não tem periodo na URL).
export function MesAnoFiltro({ periodo }: { periodo: string }) {
  const router = useRouter();

  function irPara(novoPeriodo: string) {
    router.push(`?periodo=${novoPeriodo}`);
  }

  function mesAdjacente(delta: number): string {
    const [ano, mes] = periodo.split("-").map(Number);
    const d = new Date(ano, mes - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => irPara(mesAdjacente(-1))}
        className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-gray-600 hover:bg-gray-50"
        title="Mês anterior"
      >
        ←
      </button>
      <input
        type="month"
        className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-primary bg-white"
        value={periodo}
        onChange={(e) => e.target.value && irPara(e.target.value)}
      />
      <button
        type="button"
        onClick={() => irPara(mesAdjacente(1))}
        className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-gray-600 hover:bg-gray-50"
        title="Próximo mês"
      >
        →
      </button>
    </div>
  );
}
