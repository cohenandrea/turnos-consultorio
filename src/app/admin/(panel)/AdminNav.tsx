"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ items }: { items: [string, string][] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
      {items.map(([href, label]) => {
        const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-xl px-3 py-2.5 text-[15px] font-medium whitespace-nowrap transition ${active ? "bg-brand text-on-brand" : "text-ink hover:bg-soft"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
