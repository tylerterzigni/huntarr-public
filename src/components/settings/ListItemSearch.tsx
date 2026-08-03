"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClampedDropdownStyle } from "@/components/search/use-clamped-dropdown-style";

export type ListSearchItem = {
  id: string;
  title: string;
  subtitle?: string;
};

interface ListItemSearchProps {
  items: ListSearchItem[];
  onSelect: (item: ListSearchItem) => void;
  placeholder?: string;
  emptyLabel?: string;
  noMatchLabel?: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
}

export function ListItemSearch({
  items,
  onSelect,
  placeholder = "Search list...",
  emptyLabel = "Nothing in this list yet.",
  noMatchLabel = "No matching items.",
  ariaLabel = "Search list",
  title = "Search this list",
  disabled = false,
}: ListItemSearchProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openedByPointerRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const dropdownStyle = useClampedDropdownStyle(containerRef, open && showResults);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setShowResults(false);
  }, []);

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
    if (!open) {
      setShowResults(false);
      return;
    }
    setShowResults(true);
  }, [open]);

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return items;
    return items.filter((item) => {
      const haystack = `${item.title} ${item.subtitle ?? ""}`.toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [items, query]);

  function focusInput() {
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function openSearch() {
    if (disabled) return;

    if (open) {
      if (!isMobileViewport()) focusInput();
      return;
    }

    setOpen(true);
    if (!isMobileViewport()) focusInput();
  }

  function handleSelect(item: ListSearchItem) {
    onSelect(item);
    handleClose();
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <div
        className={cn(
          "flex items-center rounded-md text-sm font-medium transition-colors",
          open
            ? "bg-gray-900/10 text-gray-900"
            : "text-gray-600 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-gray-900/5 [@media(hover:hover)_and_(pointer:fine)]:hover:text-gray-900"
        )}
      >
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          onPointerDown={(e) => {
            if (disabled || e.button !== 0) return;
            e.preventDefault();
            openedByPointerRef.current = true;
            openSearch();
          }}
          onClick={() => {
            if (openedByPointerRef.current) {
              openedByPointerRef.current = false;
              return;
            }
            openSearch();
          }}
          className="flex shrink-0 items-center justify-center px-2 py-2 disabled:opacity-50"
          aria-label={ariaLabel}
          title={title}
        >
          <Search className="h-4 w-4" />
        </button>

        {open && (
          <>
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="ml-1 h-8 w-[220px] max-w-[40vw] shrink-0 rounded-md border border-gray-400 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close search"
              className="ml-1 shrink-0 rounded-md p-1 text-gray-700 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-gray-900/5"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {open && showResults && (
        <div
          style={dropdownStyle}
          className={cn(
            "z-50 mt-2 rounded-lg border border-gray-300 bg-white shadow-xl",
            "absolute top-full w-[min(calc(100vw-2rem),320px)]",
            // Desktop: open under the trigger. Mobile uses fixed clamped coords via style.
            "right-0 left-auto md:left-0 md:right-auto"
          )}
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {results.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {items.length === 0
                  ? emptyLabel
                  : query.trim()
                    ? noMatchLabel
                    : emptyLabel}
              </p>
            )}
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm [@media(hover:hover)_and_(pointer:fine)]:hover:bg-seerr-hover"
              >
                <span className="truncate">{item.title}</span>
                {item.subtitle ? (
                  <span className="shrink-0 text-xs uppercase text-muted-foreground">
                    {item.subtitle}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
