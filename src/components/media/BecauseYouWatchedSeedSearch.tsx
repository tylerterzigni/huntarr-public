"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaType } from "@/types";

type WatchSeedResult = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
};

interface BecauseYouWatchedSeedSearchProps {
  onSelect: (seed: WatchSeedResult) => void;
  disabled?: boolean;
}

export function BecauseYouWatchedSeedSearch({
  onSelect,
  disabled = false,
}: BecauseYouWatchedSeedSearchProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WatchSeedResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setShowResults(false);
    setResults([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }

    function onMouseDown(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      handleClose();
    }

    document.addEventListener("keydown", onKeyDown);
    const attachTimer = window.setTimeout(() => {
      document.addEventListener("mousedown", onMouseDown, true);
    }, 0);

    return () => {
      window.clearTimeout(attachTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [open, handleClose]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      setShowResults(false);
      setLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setShowResults(true);
      try {
        const res = await fetch(`/api/watch-history/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [open, query]);

  function focusInput() {
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  }

  function handleSelect(seed: WatchSeedResult) {
    onSelect(seed);
    handleClose();
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <div
        className={cn(
          "flex items-center rounded-md text-sm font-medium transition-colors",
          open ? "bg-gray-900/10 text-gray-900" : "text-gray-600 hover:bg-gray-900/5 hover:text-gray-900"
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            if (open) {
              focusInput();
            } else {
              setOpen(true);
              focusInput();
            }
          }}
          className="flex shrink-0 items-center justify-center px-2 py-2 disabled:opacity-50"
          aria-label="Search watched titles"
          title="Find similar titles from your watch history"
        >
          <Search className="h-4 w-4" />
        </button>

        {open && (
          <>
            <input
              ref={inputRef}
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search watch history..."
              className="ml-1 h-8 w-[220px] max-w-[40vw] shrink-0 rounded-md border border-gray-400 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close search"
              className="ml-1 shrink-0 rounded-md p-1 text-gray-700 hover:bg-gray-900/5"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {open && showResults && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-2rem,320px)] rounded-lg border border-gray-300 bg-white shadow-xl">
          <div className="max-h-64 overflow-y-auto py-1">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching watch history...
              </div>
            )}
            {!loading && results.length === 0 && query.trim() && (
              <p className="px-3 py-2 text-sm text-muted-foreground">No watched titles found.</p>
            )}
            {!loading &&
              results.map((seed) => (
                <button
                  key={`${seed.mediaType}:${seed.tmdbId}`}
                  type="button"
                  onClick={() => handleSelect(seed)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-seerr-hover"
                >
                  <span className="truncate">{seed.title}</span>
                  <span className="shrink-0 text-xs uppercase text-muted-foreground">
                    {seed.mediaType === "movie" ? "Movie" : "TV"}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
