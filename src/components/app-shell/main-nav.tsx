"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/health", label: "Health" },
] as const;

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {links.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors hover:bg-muted hover:text-foreground",
              active ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
