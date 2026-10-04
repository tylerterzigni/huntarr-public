"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { Settings, Film, Home, Tv, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NavbarSearch } from "@/components/search/NavbarSearch";
import { OptionsMenu } from "@/components/layout/OptionsMenu";
import { UserAccountMenu } from "@/components/layout/UserAccountMenu";
import { useDetailNavContrast } from "@/components/providers/DetailNavContrastProvider";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/movies", label: "Movies", icon: Film },
  { href: "/tv", label: "TV Shows", icon: Tv },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Dark grey (gray-700) ↔ white, driven by fanart/scroll contrast. */
function navForeground(whiteTextMix: number): string {
  const t = Math.min(1, Math.max(0, whiteTextMix));
  const r = Math.round(55 + (255 - 55) * t);
  const g = Math.round(65 + (255 - 65) * t);
  const b = Math.round(81 + (255 - 81) * t);
  return `rgb(${r} ${g} ${b})`;
}

interface NavbarProps {
  onChatOpen?: () => void;
  username?: string;
}

export function Navbar({ onChatOpen, username }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { whiteTextMix, lightNav } = useDetailNavContrast();
  const isDetailPage = /^\/(movie|tv)\/[^/]+/.test(pathname);
  const mix = isDetailPage ? whiteTextMix : 0;
  const useLight = isDetailPage && lightNav;
  const fg = navForeground(mix);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (pathname === "/search") return;
    if (searchParams.get("search") === "1" || searchParams.has("q")) {
      const q = searchParams.get("q") ?? "";
      const target = q ? `/search?q=${encodeURIComponent(q)}` : "/search";
      router.replace(target, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  function handleLogoClick(event: React.MouseEvent<HTMLAnchorElement>) {
    // Full browser reload — clears client state / in-flight streams safely.
    event.preventDefault();
    if (pathname === "/") {
      window.location.reload();
      return;
    }
    window.location.assign("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-300/70 bg-white/40 pt-safe shadow-none backdrop-blur-md">
      <div className="flex h-20 items-center justify-between gap-3 px-4 md:px-8">
        <div
          className={cn(
            "flex min-w-0 items-center gap-3 md:gap-4 lg:gap-6",
            searchOpen && "flex-1"
          )}
        >
          <Link
            href="/"
            className="flex shrink-0 items-center"
            aria-label={pathname === "/" ? "Reload Huntarr" : "Huntarr home"}
            onClick={handleLogoClick}
          >
            <Image
              src="/huntarr-logo.png"
              alt="Huntarr"
              width={128}
              height={150}
              className="h-[68px] w-auto sm:h-[75px]"
              priority
            />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                style={{ color: fg }}
                aria-label={label}
                title={label}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-[color,background-color] duration-300",
                  pathname === href
                    ? useLight
                      ? "bg-white/20"
                      : "bg-gray-900/10"
                    : useLight
                      ? "hover:bg-white/10"
                      : "hover:bg-gray-900/5"
                )}
              >
                <Icon className="h-4 w-4" />
                {/* Icon-only on tablet widths so the nav never runs into the right-side controls. */}
                <span className="hidden lg:inline">{label}</span>
              </Link>
            ))}
          </nav>
          <NavbarSearch
            lightNav={useLight}
            textColor={isDetailPage ? fg : undefined}
            onOpenChange={setSearchOpen}
          />
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center gap-2",
            searchOpen && "max-md:hidden"
          )}
        >
          <OptionsMenu
            onChatOpen={onChatOpen}
            lightNav={useLight}
            textColor={isDetailPage ? fg : undefined}
          />
          {username && <UserAccountMenu username={username} lightNav={useLight} />}
          <Button
            variant="ghost"
            size="icon"
            style={isDetailPage ? { color: fg } : undefined}
            className={cn(
              "transition-colors duration-300",
              useLight && "hover:bg-white/10 hover:text-white"
            )}
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
