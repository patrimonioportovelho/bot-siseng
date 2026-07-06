"use client";

// Qualquer `throw new Error(...)` dentro de uma Server Action ou de uma
// página (ex.: validação "Nome e função são obrigatórios.") cai aqui, em vez
// de virar a tela de erro genérica do Next. Mantém a mensagem que a Server
// Action já escreveu (geralmente já é amigável, em português) e oferece um
// jeito de tentar de novo sem perder a navegação.
export default function ErrorBoundary({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="bg-white border border-red-200 rounded-xl p-6 max-w-md w-full text-center">
        <div className="text-sm font-bold text-red-700 mb-2">Não deu pra salvar</div>
        <p className="text-xs text-gray-600 mb-4">
          {error.message || "Aconteceu um erro inesperado. Confira os campos e tente de novo."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold hover:opacity-90"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
