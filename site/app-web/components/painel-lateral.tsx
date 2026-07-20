"use client";

// Painel deslizante (drawer) que abre por cima da tela atual, dividindo o
// espaço em vez de navegar pra outra aba/janela — pedido do usuário: "não
// tem como abrir uma segunda tela no mesmo local dividindo a página?
// conferindo e editando de forma rápida e podendo fechar novamente?". O
// conteúdo é a própria página (/imoveis/[id], /clientes/[id] etc.) carregada
// num iframe com ?embed=1, que faz o AppShell esconder o menu lateral/Topbar
// dela (ver components/app-shell.tsx) — assim dentro do painel aparece só o
// conteúdo da ficha, já editável, sem menu duplicado.
export function PainelLateral({
  aberto,
  href,
  titulo,
  onFechar
}: {
  aberto: boolean;
  href: string | null;
  titulo: string;
  onFechar: () => void;
}) {
  if (!aberto || !href) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onFechar} />
      <div className="relative w-full md:w-[560px] lg:w-[640px] h-full bg-gray-50 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="text-sm font-bold text-gray-800 truncate">{titulo}</div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={href.replace(/[?&]embed=1/, "")}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-gray-500 hover:text-gray-800 underline"
            >
              Abrir em nova aba
            </a>
            <button
              type="button"
              onClick={onFechar}
              className="text-xs border border-gray-300 rounded-lg px-2.5 py-1 text-gray-600 hover:bg-gray-50 font-semibold"
            >
              Fechar ✕
            </button>
          </div>
        </div>
        <iframe key={href} src={href} title={titulo} className="flex-1 w-full border-0 bg-gray-50" />
      </div>
    </div>
  );
}
