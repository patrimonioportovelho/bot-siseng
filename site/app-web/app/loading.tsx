// Tela de "carregando" de todas as páginas: o Next mostra isto NA HORA do clique (o menu lateral continua no
// lugar) enquanto a página busca os dados no banco. Sem este arquivo, o clique parecia travado até a página
// inteira ficar pronta. Sem "use client": só CSS (animate-pulse do Tailwind).
export default function Carregando() {
  return (
    <div className="flex flex-col gap-4 animate-pulse" role="status" aria-label="Carregando">
      <div className="h-7 w-56 rounded-md bg-gray-200" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-100 border border-gray-200" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-gray-100 border border-gray-200" />
      <div className="h-40 rounded-xl bg-gray-100 border border-gray-200" />
    </div>
  );
}
