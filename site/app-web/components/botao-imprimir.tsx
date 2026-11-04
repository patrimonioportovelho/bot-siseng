"use client";

export function BotaoImprimir({ children = "Imprimir" }: { children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.print()} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 font-semibold text-gray-600 hover:bg-gray-50 print:hidden">
      {children}
    </button>
  );
}
