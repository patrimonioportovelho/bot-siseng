import Link from "next/link";

// Link pra Política de Privacidade (/privacidade). Cada tela passa a classe
// de cor que combina com o próprio rodapé (fundo escuro no /login, claro no
// resto).
export function LinkPrivacidade({ className = "text-gray-400 hover:text-gray-600 underline" }: { className?: string }) {
  return (
    <Link href="/privacidade" className={className}>
      Política de Privacidade
    </Link>
  );
}

// Rodapé padrão do sistema logado (administrativo e portal do corretor).
export function RodapePrivacidade() {
  return (
    <footer className="px-4 py-4 text-center text-[11px] text-gray-400">
      RE/MAX Engimob · SisEng · <LinkPrivacidade />
    </footer>
  );
}
