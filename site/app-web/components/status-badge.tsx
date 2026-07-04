const STYLES: Record<string, string> = {
  ativa: "bg-[#e3f5ea] text-[#1f7a4d]",
  concluida: "bg-[#e7eefb] text-[#1d4e9b]",
  pendente: "bg-[#fdf1da] text-[#92600b]",
  cancelada: "bg-[#fbe7e7] text-[#9b2e2e]"
};

export function StatusBadge({ status, tone }: { status: string; tone: keyof typeof STYLES }) {
  return (
    <span className={"text-xs px-2 py-0.5 rounded-full " + STYLES[tone]}>
      {status}
    </span>
  );
}
