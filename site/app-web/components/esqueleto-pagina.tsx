// Esqueleto simples usado nos loading.tsx das telas mais pesadas (fazem
// várias queries em paralelo antes de renderizar) — aparece na hora, antes
// mesmo da barra de progresso do topo terminar, pra encurtar ainda mais a
// sensação de "tela parada".
export function EsqueletoPagina() {
  return (
    <div className="animate-pulse flex flex-col gap-4">
      <div className="h-5 w-48 bg-gray-200 rounded" />
      <div className="h-24 bg-gray-100 rounded-xl" />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="h-40 bg-gray-100 rounded-xl" />
        <div className="h-40 bg-gray-100 rounded-xl" />
      </div>
      <div className="h-64 bg-gray-100 rounded-xl" />
    </div>
  );
}
