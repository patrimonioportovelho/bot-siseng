import { Topbar } from "@/components/topbar";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <Topbar />
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <div className="text-sm font-bold text-gray-800 mb-2">{title}</div>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </div>
  );
}
