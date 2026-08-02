"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Film, Home, Settings, Tv } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home", icon: Home, match: (path: string) => path === "/" },
  { href: "/movies", label: "Movies", icon: Film, match: (path: string) => path === "/movies" || path.startsWith("/movie/") },
  { href: "/tv", label: "Shows", icon: Tv, match: (path: string) => path === "/tv" || path.startsWith("/tv/") },
  { href: "/settings", label: "Settings", icon: Settings, match: (path: string) => path === "/settings" },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const isDetailPage = /^\/(movie|tv)\/[^/]+/.test(pathname);

  return (
    <nav
      aria-label="Primary"
      className={cn("mobile-bottom-dock fixed inset-x-0 bottom-0 z-50 md:hidden")}
    >
      <ul className="mobile-bottom-dock-nav">
        {navItems.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);

          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                title={label}
                className={cn(
                  "flex min-h-11 flex-1 items-center justify-center rounded-md px-1 transition-colors",
                  isDetailPage
                    ? active
                      ? "text-white"
                      : "text-white/80 hover:text-white"
                    : active
                      ? "text-indigo-600"
                      : "text-gray-500 hover:text-gray-900"
                )}
              >
                <Icon className="h-6 w-6 shrink-0" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
