export function KpiCard({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={"text-xl font-bold mt-1 " + (accent ? "text-accent" : "text-gray-900")}>
        {value}
      </div>
    </div>
  );
}
