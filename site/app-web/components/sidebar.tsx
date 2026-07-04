"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-44 shrink-0 bg-primary text-white flex flex-col gap-1 p-4">
      <div className="text-base font-bold mb-4 tracking-wide">SisEng</div>
      {NAV_ITEMS.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "text-sm rounded-lg px-3 py-2 transition-colors " +
              (active ? "bg-white/15" : "opacity-80 hover:opacity-100 hover:bg-white/10")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </aside>
  );
}
