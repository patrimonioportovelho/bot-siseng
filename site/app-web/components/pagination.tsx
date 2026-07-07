type PaginationProps = {
  page: number;
  totalPages: number;
  basePath: string;
  q?: string;
  // Outros filtros da tela (ex.: tipo, pago) que precisam continuar na URL
  // ao trocar de página — sem isso, Anterior/Próxima perdia o filtro atual.
  extraParams?: Record<string, string | undefined>;
};

export function Pagination({ page, totalPages, basePath, q, extraParams }: PaginationProps) {
  if (totalPages <= 1) return null;

  function href(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (extraParams) {
      for (const [chave, valor] of Object.entries(extraParams)) {
        if (valor) params.set(chave, valor);
      }
    }
    params.set("page", String(p));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-end gap-2 mt-3 text-xs text-gray-500">
      <span>
        Página {page} de {totalPages}
      </span>
      <a
        href={page > 1 ? href(page - 1) : undefined}
        aria-disabled={page <= 1}
        className={
          "px-2 py-1 rounded-lg border border-gray-200 " +
          (page <= 1 ? "opacity-40 pointer-events-none" : "hover:bg-gray-50")
        }
      >
        Anterior
      </a>
      <a
        href={page < totalPages ? href(page + 1) : undefined}
        aria-disabled={page >= totalPages}
        className={
          "px-2 py-1 rounded-lg border border-gray-200 " +
          (page >= totalPages ? "opacity-40 pointer-events-none" : "hover:bg-gray-50")
        }
      >
        Próxima
      </a>
    </div>
  );
}
