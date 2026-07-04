export function Topbar() {
  return (
    <div className="flex items-center justify-between mb-4">
      <button className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600">
        Porto Velho
      </button>
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
          JS
        </div>
        <span className="text-xs text-gray-700">Jota &middot; Administrativo</span>
      </div>
    </div>
  );
}
