"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchPreviewDropdown } from "@/components/search/SearchPreviewDropdown";
import {
  SEARCH_PREVIEW_INITIAL,
  SEARCH_PREVIEW_MORE,
} from "@/lib/search/preview-constants";
import type { SearchPreviewItem } from "@/lib/search/run-search";

interface NavbarSearchProps {
  lightNav?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NavbarSearch({ lightNav = false, onOpenChange }: NavbarSearchProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [previewItems, setPreviewItems] = useState<SearchPreviewItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const setSearchOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  const hideMobileKeyboard = useCallback(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    inputRef.current?.blur();
  }, []);

  const handleClose = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
    setPreviewItems([]);
    setHasMore(false);
    setSearched(false);
    setShowPreview(false);
    setLoading(false);
    setLoadingMore(false);
    inputRef.current?.blur();
  }, [setSearchOpen]);

  // Delay outside-dismiss so the opening tap cannot instantly close after layout shift.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }

    function onPointerDown(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      handleClose();
    }

    document.addEventListener("keydown", onKeyDown);
    const attachTimer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 200);

    return () => {
      window.clearTimeout(attachTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, handleClose]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || !trimmed) {
      setPreviewItems([]);
      setHasMore(false);
      setSearched(false);
      setShowPreview(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    setLoading(true);
    setLoadingMore(false);
    setShowPreview(true);
    setPreviewItems([]);
    setHasMore(false);

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&preview=1&offset=0&limit=${SEARCH_PREVIEW_INITIAL}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setPreviewItems(data.preview ?? []);
        setHasMore(Boolean(data.hasMore));
      } catch {
        if (!cancelled) {
          setPreviewItems([]);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) {
          setSearched(true);
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const handleLoadMore = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&preview=1&offset=${previewItems.length}&limit=${SEARCH_PREVIEW_MORE}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");

      const nextItems = (data.preview ?? []) as SearchPreviewItem[];
      setPreviewItems((prev) => {
        const seen = new Set(prev.map((item) => `${item.kind}:${item.id}`));
        return [
          ...prev,
          ...nextItems.filter((item) => !seen.has(`${item.kind}:${item.id}`)),
        ];
      });
      setHasMore(Boolean(data.hasMore));
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [query, loadingMore, hasMore, previewItems.length]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    handleClose();
  }

  function handlePreviewSelect() {
    handleClose();
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative shrink-0", open && "z-50 min-w-0 flex-1 md:flex-none")}
    >
      <form
        onSubmit={handleSearch}
        className={cn(
          "relative flex min-w-0 items-center rounded-md text-sm font-medium transition-colors",
          open && "w-full",
          lightNav
            ? open
              ? "bg-white/20 text-white"
              : "text-white [@media(hover:hover)_and_(pointer:fine)]:hover:bg-white/10"
            : open
              ? "bg-gray-900/10 text-gray-900"
              : "text-gray-700 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-gray-900/5 [@media(hover:hover)_and_(pointer:fine)]:hover:text-gray-900"
        )}
      >
        {/* Search IS the input — first tap focuses a real field and raises the keyboard. */}
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0"
          aria-hidden
        />
        {!open && (
          <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2">
            Search
          </span>
        )}
        <input
          id="navbar-search-input"
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (!open) {
              flushSync(() => {
                setSearchOpen(true);
              });
            }
          }}
          placeholder={open ? "Movies, TV & people..." : undefined}
          aria-label="Search"
          className={cn(
            "h-9 bg-transparent text-sm focus:outline-none",
            open
              ? cn(
                  "min-w-0 flex-1 rounded-md border py-2 pl-9 pr-2 focus:ring-1 md:w-[220px] md:max-w-[40vw] md:flex-none",
                  lightNav
                    ? "border-white/60 text-white placeholder:text-gray-400 focus:border-white focus:ring-white/80"
                    : "border-gray-400 bg-white text-gray-900 placeholder:text-gray-500 focus:border-gray-500 focus:ring-gray-500"
                )
              : "w-[6.75rem] cursor-pointer border-0 py-2 pl-9 pr-3 text-transparent caret-transparent"
          )}
        />
        {open && (
          <button
            type="button"
            onMouseDown={(e) => {
              // Prevent the input from blurring before we handle close.
              e.preventDefault();
            }}
            onClick={handleClose}
            aria-label="Close search"
            className={cn(
              "mr-1 shrink-0 rounded-md p-1",
              lightNav ? "text-white hover:bg-white/10" : "text-gray-700 hover:bg-gray-900/5"
            )}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {open && showPreview && (
        <SearchPreviewDropdown
          items={previewItems}
          loading={loading}
          loadingMore={loadingMore}
          searched={searched}
          hasMore={hasMore}
          onSelect={handlePreviewSelect}
          onLoadMore={handleLoadMore}
          onScrollContent={hideMobileKeyboard}
        />
      )}
    </div>
  );
}
