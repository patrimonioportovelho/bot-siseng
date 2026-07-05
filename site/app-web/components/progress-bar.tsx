export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(percent, 999));
  const color =
    percent >= 100 ? "bg-[#1f7a4d]" : percent >= 70 ? "bg-[#c98a1a]" : "bg-[#c94a4a]";
  return (
    <div className="w-full">
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className={"h-2 rounded-full " + color}
          style={{ width: Math.min(clamped, 100) + "%" }}
        />
      </div>
      <div className="text-[11px] text-gray-500 mt-0.5">{percent.toFixed(0)}%</div>
    </div>
  );
}
