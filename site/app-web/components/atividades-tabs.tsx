import Link from "next/link";

// Navegação compartilhada de Atividades: Manutenção, Gestões e Marketing têm
// quadros (Kanban) separados, mas Calendário e Painel mostram os três
// módulos juntos — por isso só existe uma rota de Calendário e uma de Painel
// (dentro de /manutencao por herança histórica, mas já trazem atividades de
// Gestões e Marketing também).
const TABS = [
  { href: "/manutencao", label: "Quadro · Manutenção" },
  { href: "/gestoes", label: "Quadro · Gestões" },
  { href: "/marketing", label: "Quadro · Marketing" },
  { href: "/manutencao/calendario", label: "Calendário" },
  { href: "/manutencao/painel", label: "Painel" }
];

export function AtividadesTabs({ ativo }: { ativo: string }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={
            "text-xs rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap " +
            (t.href === ativo ? "bg-primary text-white" : "border border-gray-300 text-gray-600 bg-white")
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
