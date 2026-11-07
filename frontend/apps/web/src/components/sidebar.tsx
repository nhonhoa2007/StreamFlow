"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, navItems } from "./navigation";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed bottom-0 left-0 top-16 z-40 hidden w-[84px] flex-col items-center border-r border-white/10 bg-sf-base pt-6  lg:flex">
      <nav aria-label="Primary navigation" className="w-full space-y-2 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-focus ${
                active
                  ? "bg-white/10 text-white"
                  : "text-sf-text-muted hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && <span className="absolute left-0 h-7 w-1 rounded-r-full bg-sf-accent" />}
              <Icon size={19} strokeWidth={active ? 2.4 : 1.7} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
