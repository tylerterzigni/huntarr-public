"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { MessageSquare, Settings, Film, Tv, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NavbarSearch } from "@/components/search/NavbarSearch";
import { LibraryWatchedToggle } from "@/components/layout/LibraryWatchedToggle";
import { UserAccountMenu } from "@/components/layout/UserAccountMenu";
import { dispatchHuntarrRefresh } from "@/lib/pwa/refresh";

const navItems = [
  { href: "/", label: "Home", icon: Film },
  { href: "/movies", label: "Movies", icon: Film },
  { href: "/tv", label: "TV Shows", icon: Tv },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface NavbarProps {
  onChatOpen?: () => void;
  username?: string;
}

export function Navbar({ onChatOpen, username }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDetailPage = /^\/(movie|tv)\/[^/]+/.test(pathname);
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
    if (pathname !== "/") return;
    event.preventDefault();
    dispatchHuntarrRefresh();
    router.refresh();
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-40 pt-safe",
        isDetailPage
          ? "border-b border-transparent bg-transparent"
          : "border-b border-gray-300 bg-seerr-bg/95 backdrop-blur"
      )}
    >
      <div className="flex h-20 items-center justify-between gap-3 px-4 md:px-8">
        <div
          className={cn(
            "flex min-w-0 items-center gap-3 md:gap-6",
            searchOpen && "flex-1"
          )}
        >
          <Link
            href="/"
            className="flex shrink-0 items-center"
            aria-label={pathname === "/" ? "Refresh Huntarr home" : "Huntarr home"}
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
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isDetailPage
                    ? pathname === href
                      ? "bg-white/20 text-white"
                      : "text-white hover:bg-white/10"
                    : pathname === href
                      ? "bg-gray-900/10 text-gray-900"
                      : "text-gray-700 hover:bg-gray-900/5 hover:text-gray-900"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
          <NavbarSearch lightNav={isDetailPage} onOpenChange={setSearchOpen} />
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center gap-2",
            searchOpen && "max-md:hidden"
          )}
        >
          <LibraryWatchedToggle lightNav={isDetailPage} />
          {onChatOpen && (
            <Button variant="outline" size="sm" onClick={onChatOpen} className="border-indigo-500/50">
              <MessageSquare className="h-4 w-4 mr-1" />
              AI Chat
            </Button>
          )}
          {username && <UserAccountMenu username={username} lightNav={isDetailPage} />}
          <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: "/login" })}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
