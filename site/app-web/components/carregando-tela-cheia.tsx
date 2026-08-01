// Spinner de página inteira — usado só como fallback do Suspense raiz em
// app/layout.tsx (era `fallback={null}`, ou seja, não mostrava nada). Sem
// "use client": não precisa de estado nenhum, só CSS (a animação do spin é
// do Tailwind, `animate-spin`).
export function CarregandoTelaCheia() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-primary animate-spin" />
    </div>
  );
}
